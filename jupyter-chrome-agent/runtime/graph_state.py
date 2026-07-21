"""Typed state contract and thread identity helpers for the agent graph."""

from __future__ import annotations

import hashlib
from typing import Any, TypedDict


class NotebookGraphState(TypedDict, total=False):
    """State shared by the notebook agent graph nodes."""

    thread_id: str
    conversation_id: str
    notebook_path: str
    user_request: str
    tools: list[dict[str, Any]]
    notebook_context: dict[str, Any]
    history: list[dict[str, Any]]
    cell_plan: list[dict[str, Any]]
    workflow_plan: list[dict[str, Any]]
    active_stage_id: str
    completed_stage_ids: list[str]
    pending_tool_calls: list[dict[str, Any]]
    tool_results: list[dict[str, Any]]
    execution_errors: list[dict[str, Any]]
    current_step: str
    round_count: int
    request_count: int
    final_response: str
    agent_session_id: str
    streamed_text: str
    on_text: Any
    result: dict[str, Any]
    status: str


def _required_text(value: str, field_name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field_name} must be a non-empty string")
    return value.strip()


def make_thread_id(notebook_path: str, conversation_id: str) -> str:
    """Return a stable, non-sensitive graph thread ID for one notebook chat."""

    notebook_path = _required_text(notebook_path, "notebook_path")
    conversation_id = _required_text(conversation_id, "conversation_id")
    identity = f"{notebook_path}\0{conversation_id}".encode("utf-8")
    digest = hashlib.sha256(identity).hexdigest()
    return f"notebookpilot-{digest}"


def build_initial_state(
    user_request: str,
    notebook_path: str,
    conversation_id: str,
    notebook_context: dict[str, Any],
    history: list[dict[str, Any]] | None = None,
    tools: list[dict[str, Any]] | None = None,
) -> NotebookGraphState:
    """Build a clean state for a request without sharing mutable collections."""

    user_request = _required_text(user_request, "user_request")
    notebook_path = _required_text(notebook_path, "notebook_path")
    conversation_id = _required_text(conversation_id, "conversation_id")
    if not isinstance(notebook_context, dict):
        raise ValueError("notebook_context must be a dictionary")
    if history is not None and not isinstance(history, list):
        raise ValueError("history must be a list")

    return {
        "thread_id": make_thread_id(notebook_path, conversation_id),
        "conversation_id": conversation_id,
        "notebook_path": notebook_path,
        "user_request": user_request,
        "tools": list(tools or []),
        "notebook_context": dict(notebook_context),
        "history": list(history or []),
        "cell_plan": [],
        "workflow_plan": [],
        "active_stage_id": "",
        "completed_stage_ids": [],
        "pending_tool_calls": [],
        "tool_results": [],
        "execution_errors": [],
        "current_step": "load_context",
        "round_count": 0,
        "request_count": 0,
        "final_response": "",
        "agent_session_id": "",
        "streamed_text": "",
        "status": "ready",
    }


def graph_config(state: NotebookGraphState) -> dict[str, dict[str, str]]:
    """Return the LangGraph config shape used by future checkpointers."""

    thread_id = _required_text(state.get("thread_id", ""), "thread_id")
    return {"configurable": {"thread_id": thread_id}}
