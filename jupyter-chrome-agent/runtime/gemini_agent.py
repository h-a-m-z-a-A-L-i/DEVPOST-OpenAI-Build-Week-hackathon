import json
import os
import json
import threading
import time
import uuid
from copy import deepcopy
from typing import Any

import requests


class GeminiError(RuntimeError):
    pass


class GeminiClient:
    def __init__(self) -> None:
        self.api_key = os.environ.get("GEMINI_API_KEY", "")
        self.model = os.environ.get("GEMINI_MODEL", "gemini-3.1-flash-lite")
        self.max_output_tokens = min(int(os.environ.get("GEMINI_MAX_OUTPUT_TOKENS", "4096")), 4096)
        self.min_interval = 4.0
        self._last_request = 0.0
        self._lock = threading.Lock()

    def generate(self, contents: list[dict[str, Any]], tools: list[dict[str, Any]]) -> dict[str, Any]:
        if not self.api_key:
            raise GeminiError("GEMINI_API_KEY is not configured.")

        with self._lock:
            wait = self.min_interval - (time.monotonic() - self._last_request)
            if wait > 0:
                time.sleep(wait)
            request_started = time.monotonic()
            self._last_request = request_started
            response = requests.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent",
                params={"key": self.api_key},
                json={
                    "contents": contents,
                    "tools": [{"function_declarations": tools}],
                    "generationConfig": {"maxOutputTokens": self.max_output_tokens},
                },
                timeout=90,
            )

        if not response.ok:
            raise GeminiError(format_provider_error("Gemini", response))
        return response.json()


class CodexClient:
    """OpenAI-compatible client for Codex or a compatible local gateway."""

    def __init__(self) -> None:
        self.api_key = os.environ.get("CODEX_API_KEY", "")
        self.model = os.environ.get("CODEX_MODEL", "gpt-4.1-mini")
        self.base_url = os.environ.get("CODEX_BASE_URL", "https://api.openai.com/v1").rstrip("/")
        self.max_output_tokens = min(int(os.environ.get("GEMINI_MAX_OUTPUT_TOKENS", "4096")), 4096)
        self.min_interval = 4.0
        self._last_request = 0.0
        self._lock = threading.Lock()

    def generate(self, contents: list[dict[str, Any]], tools: list[dict[str, Any]]) -> dict[str, Any]:
        if not self.api_key:
            raise GeminiError("CODEX_API_KEY is not configured.")

        with self._lock:
            wait = self.min_interval - (time.monotonic() - self._last_request)
            if wait > 0:
                time.sleep(wait)
            request_started = time.monotonic()
            self._last_request = request_started
            response = requests.post(
                f"{self.base_url}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={
                    "model": self.model,
                    "messages": codex_messages(contents),
                    "tools": [{"type": "function", "function": tool} for tool in tools],
                    "max_tokens": self.max_output_tokens,
                },
                timeout=90,
            )

        if not response.ok:
            raise GeminiError(format_provider_error("Codex", response))
        return normalize_codex_response(response.json())


class NotebookAgent:
    def __init__(self, client: GeminiClient | None = None) -> None:
        self.client = client or create_client()
        self.sessions: dict[str, dict[str, Any]] = {}
        self.max_rounds = int(os.environ.get("LLM_REACT_MAX_ROUNDS", "15"))
        self.max_tool_failures = int(os.environ.get("LLM_MAX_TOOL_FAILURES", "3"))
        self.session_ttl = float(os.environ.get("LLM_SESSION_TTL_SEC", "900"))

    def start(
        self,
        prompt: str,
        context: dict[str, Any],
        tools: list[dict[str, Any]],
        history: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        if not isinstance(prompt, str) or not prompt.strip():
            raise GeminiError("A non-empty prompt is required.")
        if not isinstance(context, dict):
            raise GeminiError("Notebook context must be an object.")
        self.cleanup_sessions()
        session_id = uuid.uuid4().hex
        contents = [{"role": "user", "parts": [{"text": build_prompt(prompt, compress_context(context), history or [])}]}]
        session = {
            "contents": contents,
            "tools": tools,
            "round": 0,
            "pending": None,
            "toolFailures": 0,
            "lastToolSignature": None,
            "repeatedToolCalls": 0,
            "createdAt": time.monotonic(),
        }
        self.sessions[session_id] = session
        try:
            return self._advance(session_id)
        except Exception:
            self.sessions.pop(session_id, None)
            raise

    def continue_session(self, session_id: str, tool_result: dict[str, Any]) -> dict[str, Any]:
        session = self.sessions.get(session_id)
        if not session:
            raise GeminiError("Agent session was not found or expired.")
        pending = session.get("pending")
        if not pending:
            raise GeminiError("Agent session has no pending tool call.")
        if not isinstance(tool_result, dict):
            raise GeminiError("Tool result must be an object.")
        if tool_result.get("ok") is False:
            session["toolFailures"] += 1
            session["lastToolSignature"] = None
            session["repeatedToolCalls"] = 0
            if session["toolFailures"] > self.max_tool_failures:
                self.sessions.pop(session_id, None)
                raise GeminiError("The agent stopped after repeated notebook tool failures.")

        session["contents"].append({
            "role": "user",
            "parts": [{"functionResponse": {"name": pending["name"], "response": {"result": tool_result}}}],
        })
        session["pending"] = None
        try:
            return self._advance(session_id)
        except Exception:
            self.sessions.pop(session_id, None)
            raise

    def _advance(self, session_id: str) -> dict[str, Any]:
        session = self.sessions[session_id]
        if time.monotonic() - session["createdAt"] > self.session_ttl:
            self.sessions.pop(session_id, None)
            raise GeminiError("Agent session expired; please retry the request.")
        session["round"] += 1
        if session["round"] > self.max_rounds:
            raise GeminiError("Agent round limit reached.")

        response = self.client.generate(session["contents"], session["tools"])
        candidate = response.get("candidates", [{}])[0]
        content = candidate.get("content", {"role": "model", "parts": []})
        if not isinstance(content, dict) or not isinstance(content.get("parts", []), list):
            raise GeminiError("The model returned an invalid response format.")
        session["contents"].append(content)
        parts = content.get("parts", [])
        function_call = next((part.get("functionCall") for part in parts if part.get("functionCall")), None)
        if function_call:
            if not function_call.get("name") or not isinstance(function_call.get("args", {}), dict):
                raise GeminiError("The model returned an invalid tool call.")
            signature = json.dumps(
                {"name": function_call["name"], "args": function_call.get("args", {})},
                sort_keys=True,
                ensure_ascii=False,
            )
            if signature == session.get("lastToolSignature"):
                session["repeatedToolCalls"] += 1
            else:
                session["lastToolSignature"] = signature
                session["repeatedToolCalls"] = 1
            if session["repeatedToolCalls"] >= 3:
                self.sessions.pop(session_id, None)
                raise GeminiError(
                    f"The agent stopped after repeating the {function_call['name']} tool call."
                )
            session["pending"] = function_call
            return {
                "status": "tool_call",
                "sessionId": session_id,
                "round": session["round"],
                "toolCall": function_call,
            }

        text = "\n".join(part.get("text", "") for part in parts if part.get("text"))
        self.sessions.pop(session_id, None)
        return {"status": "complete", "sessionId": session_id, "round": session["round"], "text": text}

    def cleanup_sessions(self) -> None:
        now = time.monotonic()
        expired = [
            session_id for session_id, session in self.sessions.items()
            if now - session.get("createdAt", now) > self.session_ttl
        ]
        for session_id in expired:
            self.sessions.pop(session_id, None)


def build_prompt(prompt: str, context: dict[str, Any], history: list[dict[str, Any]] | None = None) -> str:
    memory = compact_history(history or [])
    memory_text = json.dumps(memory, ensure_ascii=False) if memory else "No prior conversation."
    return (
        "You are NotebookPilot, an autonomous local JupyterLab notebook assistant. "
        "Use tools when notebook changes or execution are required. Stay focused on the active notebook. "
        "The supplied notebook context is authoritative for read-only questions; do not call read tools "
        "just to reread cells already present in context. Use a tool only when the user requests a mutation, "
        "execution, fresh output, or information missing from the context. "
        "Notebook structure is mandatory: never place a large workflow or large code answer in one cell. "
        "Split substantial work into separate, logically complete cells, with one working stage per cell "
        "such as imports, configuration, data loading, cleaning, feature engineering, training, evaluation, "
        "and visualization. Keep cells in dependency order, make each cell runnable after its prerequisites, "
        "and use a short markdown heading cell when it clarifies a section. When modifying an existing large "
        "cell, preserve behavior while refactoring it into these separate working sections; do not create a "
        "monolithic replacement cell. After structural edits, run affected cells in order and report failures. "
        "Never invent tool results. If a tool fails, inspect the error and recover or explain the blocker.\n\n"
        f"Notebook context:\n{json.dumps(context, ensure_ascii=False)}\n\n"
        f"Recent conversation:\n{memory_text}\n\n"
        f"User request:\n{prompt}"
    )


def compress_context(context: dict[str, Any]) -> dict[str, Any]:
    limit = int(os.environ.get("LLM_CONTEXT_MAX_CHARS", "120000"))
    compact = deepcopy(context)
    cells = compact.get("cells", [])
    if not isinstance(cells, list):
        compact["cells"] = []
        return compact

    compact_cells = []
    for cell in cells:
        if not isinstance(cell, dict):
            continue
        item = {
            "index": cell.get("index"),
            "id": cell.get("id"),
            "type": cell.get("type"),
            "source": str(cell.get("source", ""))[:8000],
            "executionCount": cell.get("executionCount"),
            "outputs": compact_outputs(cell.get("outputs", [])),
        }
        trial = {**compact, "cells": compact_cells + [item]}
        if compact_cells and len(json.dumps(trial, ensure_ascii=False)) > limit:
            break
        compact_cells.append(item)
    compact["cells"] = compact_cells
    compact["contextSummary"] = {
        "originalCellCount": len(cells),
        "includedCellCount": len(compact_cells),
        "truncated": len(compact_cells) < len(cells),
        "errorCellIndexes": [
            cell.get("index") for cell in compact_cells
            if any(output.get("type") == "error" or output.get("output_type") == "error"
                   for output in cell.get("outputs", []) if isinstance(output, dict))
        ],
    }
    return compact


def compact_outputs(outputs: Any) -> list[dict[str, Any]]:
    if not isinstance(outputs, list):
        return []
    compacted = []
    for output in outputs[:8]:
        if not isinstance(output, dict):
            continue
        item = {key: value for key, value in output.items() if key in {"type", "output_type", "name", "ename", "evalue"}}
        if "text" in output:
            item["text"] = str(output["text"])[:3000]
        if "error" in output:
            item["error"] = output["error"]
        compacted.append(item)
    return compacted


def compact_history(history: list[dict[str, Any]]) -> list[dict[str, str]]:
    result = []
    for message in history[-12:]:
        if not isinstance(message, dict) or message.get("role") not in {"user", "assistant"}:
            continue
        text = str(message.get("text", "")).strip()
        if text:
            result.append({"role": message["role"], "text": text[:4000]})
    return result


def create_client():
    provider = os.environ.get("LLM_PROVIDER", "gemini").strip().lower()
    if provider in {"codex", "openai"}:
        return CodexClient()
    return GeminiClient()


def format_provider_error(provider: str, response: requests.Response) -> str:
    try:
        detail = response.json().get("error", {}).get("message")
    except (ValueError, AttributeError):
        detail = None
    suffix = f": {detail}" if detail else ""
    return f"{provider} request failed with status {response.status_code}{suffix}."


def codex_messages(contents: list[dict[str, Any]]) -> list[dict[str, Any]]:
    messages = []
    for content in contents:
        role = content.get("role", "user")
        parts = content.get("parts", [])
        text = "\n".join(part["text"] for part in parts if part.get("text"))
        calls = [part["functionCall"] for part in parts if part.get("functionCall")]
        responses = [part["functionResponse"] for part in parts if part.get("functionResponse")]
        if calls:
            messages.append({
                "role": "assistant",
                "tool_calls": [
                    {"id": f"call_{index}", "type": "function", "function": {
                        "name": call["name"], "arguments": json.dumps(call.get("args", {}))
                    }} for index, call in enumerate(calls)
                ],
            })
        elif responses:
            for response in responses:
                messages.append({
                    "role": "tool",
                    "tool_call_id": "call_0",
                    "content": json.dumps(response.get("response", {}).get("result", {}), ensure_ascii=False),
                })
        elif text:
            messages.append({"role": "assistant" if role == "model" else role, "content": text})
    return messages


def normalize_codex_response(payload: dict[str, Any]) -> dict[str, Any]:
    message = payload.get("choices", [{}])[0].get("message", {})
    parts = []
    if message.get("content"):
        parts.append({"text": message["content"]})
    for call in message.get("tool_calls", []):
        try:
            args = json.loads(call.get("function", {}).get("arguments", "{}"))
        except json.JSONDecodeError as error:
            raise GeminiError(f"Codex returned invalid tool arguments: {error}") from error
        parts.append({"functionCall": {"name": call.get("function", {}).get("name"), "args": args}})
    return {"candidates": [{"content": {"role": "model", "parts": parts}}]}
