import json
import os
from typing import Any, Callable

from gemini_agent import GeminiError


class LangChainGeminiClient:
    def __init__(self) -> None:
        try:
            from langchain_google_genai import ChatGoogleGenerativeAI
        except ImportError as error:
            raise GeminiError(
                "LangChain support requires langchain-google-genai. Install runtime requirements."
            ) from error

        self.max_output_tokens = min(int(os.environ.get("GEMINI_MAX_OUTPUT_TOKENS", "65536")), 65536)
        self.model_name = os.environ.get("GEMINI_MODEL", "gemini-3.1-flash-lite")
        self.model_factory = ChatGoogleGenerativeAI
        self.model = None

    def _bound_model(self, tools: list[dict[str, Any]]):
        if self.model is None:
            self.model = self.model_factory(
                model=self.model_name,
                google_api_key=os.environ.get("GEMINI_API_KEY", ""),
                max_output_tokens=self.max_output_tokens,
                temperature=0,
            )
        return self.model.bind_tools([tool_schema(tool) for tool in tools])

    def generate(self, contents: list[dict[str, Any]], tools: list[dict[str, Any]]) -> dict[str, Any]:
        response = self._bound_model(tools).invoke(to_langchain_messages(contents))
        return normalize_response(response)

    def generate_stream(
        self,
        contents: list[dict[str, Any]],
        tools: list[dict[str, Any]],
        on_text: Callable[[str], None],
    ) -> dict[str, Any]:
        accumulated = None
        for chunk in self._bound_model(tools).stream(to_langchain_messages(contents)):
            accumulated = chunk if accumulated is None else accumulated + chunk
            text = text_content(getattr(chunk, "content", ""))
            if text:
                on_text(text)
        if accumulated is None:
            raise GeminiError("LangChain returned an empty model response.")
        return normalize_response(accumulated)


def tool_schema(tool: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": "function",
        "function": {
            "name": tool["name"],
            "description": tool.get("description", ""),
            "parameters": tool.get("parameters", {"type": "object", "properties": {}}),
        },
    }


def to_langchain_messages(contents: list[dict[str, Any]]) -> list[Any]:
    try:
        from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
    except ImportError as error:
        raise GeminiError("LangChain core is not installed. Install runtime requirements.") from error

    messages = []
    pending_call_ids: list[str] = []
    for content in contents:
        role = content.get("role", "user")
        parts = content.get("parts", [])
        text = "\n".join(str(part.get("text", "")) for part in parts if part.get("text"))
        calls = [part["functionCall"] for part in parts if part.get("functionCall")]
        responses = [part["functionResponse"] for part in parts if part.get("functionResponse")]

        if role == "model":
            pending_call_ids = [f"notebookpilot-call-{index}" for index in range(len(calls))]
            messages.append(AIMessage(
                content=text,
                tool_calls=[{
                    "name": call["name"],
                    "args": call.get("args", {}),
                    "id": pending_call_ids[index],
                } for index, call in enumerate(calls)],
            ))
        elif responses:
            for index, response in enumerate(responses):
                messages.append(ToolMessage(
                    content=json.dumps(response.get("response", {}).get("result", {}), ensure_ascii=False),
                    tool_call_id=pending_call_ids[index] if index < len(pending_call_ids) else f"notebookpilot-call-{index}",
                ))
            pending_call_ids = []
        elif text:
            messages.append(HumanMessage(content=text))
    return messages


def normalize_response(response: Any) -> dict[str, Any]:
    parts = []
    text = text_content(getattr(response, "content", ""))
    if text:
        parts.append({"text": text})
    for call in getattr(response, "tool_calls", []) or []:
        parts.append({"functionCall": {"name": call["name"], "args": call.get("args", {})}})
    return {"candidates": [{"content": {"role": "model", "parts": parts}}]}


def text_content(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(str(item.get("text", "")) for item in content if isinstance(item, dict))
    return ""
