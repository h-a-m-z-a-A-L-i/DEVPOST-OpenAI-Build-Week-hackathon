import json
import os
import threading
import time
import uuid
from typing import Any

import requests


class GeminiError(RuntimeError):
    pass


class GeminiClient:
    def __init__(self) -> None:
        self.api_key = os.environ.get("GEMINI_API_KEY", "")
        self.model = os.environ.get("GEMINI_MODEL", "gemini-3.1-flash-lite")
        self.max_output_tokens = int(os.environ.get("GEMINI_MAX_OUTPUT_TOKENS", "8192"))
        self.min_interval = float(os.environ.get("GEMINI_REACT_MIN_INTERVAL_SEC", "4"))
        self._last_request = 0.0
        self._lock = threading.Lock()

    def generate(self, contents: list[dict[str, Any]], tools: list[dict[str, Any]]) -> dict[str, Any]:
        if not self.api_key:
            raise GeminiError("GEMINI_API_KEY is not configured.")

        with self._lock:
            wait = self.min_interval - (time.monotonic() - self._last_request)
            if wait > 0:
                time.sleep(wait)
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
            self._last_request = time.monotonic()

        if not response.ok:
            raise GeminiError(f"Gemini request failed with status {response.status_code}.")
        return response.json()


class NotebookAgent:
    def __init__(self, client: GeminiClient | None = None) -> None:
        self.client = client or GeminiClient()
        self.sessions: dict[str, dict[str, Any]] = {}
        self.max_rounds = int(os.environ.get("LLM_REACT_MAX_ROUNDS", "15"))

    def start(self, prompt: str, context: dict[str, Any], tools: list[dict[str, Any]]) -> dict[str, Any]:
        session_id = uuid.uuid4().hex
        contents = [{"role": "user", "parts": [{"text": build_prompt(prompt, context)}]}]
        session = {"contents": contents, "tools": tools, "round": 0, "pending": None}
        self.sessions[session_id] = session
        return self._advance(session_id)

    def continue_session(self, session_id: str, tool_result: dict[str, Any]) -> dict[str, Any]:
        session = self.sessions.get(session_id)
        if not session:
            raise GeminiError("Agent session was not found or expired.")
        pending = session.get("pending")
        if not pending:
            raise GeminiError("Agent session has no pending tool call.")

        session["contents"].append({
            "role": "user",
            "parts": [{"functionResponse": {"name": pending["name"], "response": {"result": tool_result}}}],
        })
        session["pending"] = None
        return self._advance(session_id)

    def _advance(self, session_id: str) -> dict[str, Any]:
        session = self.sessions[session_id]
        session["round"] += 1
        if session["round"] > self.max_rounds:
            raise GeminiError("Agent round limit reached.")

        response = self.client.generate(session["contents"], session["tools"])
        candidate = response.get("candidates", [{}])[0]
        content = candidate.get("content", {"role": "model", "parts": []})
        session["contents"].append(content)
        parts = content.get("parts", [])
        function_call = next((part.get("functionCall") for part in parts if part.get("functionCall")), None)
        if function_call:
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


def build_prompt(prompt: str, context: dict[str, Any]) -> str:
    return (
        "You are NotebookPilot, an autonomous local JupyterLab notebook assistant. "
        "Use tools when notebook changes or execution are required. Stay focused on the active notebook.\n\n"
        f"Notebook context:\n{json.dumps(context, ensure_ascii=False)}\n\n"
        f"User request:\n{prompt}"
    )
