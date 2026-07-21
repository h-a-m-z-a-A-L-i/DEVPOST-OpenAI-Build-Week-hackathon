"""LangGraph adapter for the existing externally-executed notebook agent loop."""

from __future__ import annotations

from typing import Any, Callable

from gemini_agent import GeminiError, NotebookAgent
from graph_state import NotebookGraphState, build_initial_state


class NotebookAgentGraph:
    """Run NotebookAgent through a graph-shaped start/continue boundary.

    The frontend still owns tool execution. A graph invocation therefore ends
    when the model requests tools and resumes with the collected results.
    """

    def __init__(self, agent: NotebookAgent, use_langgraph: bool = True) -> None:
        self.agent = agent
        self._graph = _build_langgraph(agent) if use_langgraph else None

    def start(
        self,
        prompt: str,
        context: dict[str, Any],
        tools: list[dict[str, Any]],
        history: list[dict[str, Any]] | None = None,
        on_text: Callable[[str], None] | None = None,
        notebook_path: str = "active-notebook",
        conversation_id: str = "default",
    ) -> dict[str, Any]:
        state = build_initial_state(
            prompt,
            notebook_path,
            conversation_id,
            context,
            history,
            tools,
        )
        state["on_text"] = on_text
        return self._invoke(state)

    def continue_session(
        self,
        state: NotebookGraphState,
        tool_results: list[dict[str, Any]],
        on_text: Callable[[str], None] | None = None,
    ) -> dict[str, Any]:
        if not state.get("agent_session_id"):
            raise GeminiError("Graph state has no active agent session.")
        next_state = dict(state)
        next_state["tool_results"] = tool_results
        next_state["status"] = "tool_results_ready"
        if on_text is not None:
            next_state["on_text"] = on_text
        return self._invoke(next_state)

    def _invoke(self, state: NotebookGraphState) -> dict[str, Any]:
        if self._graph is not None:
            result = self._graph.invoke(state)
        else:
            result = _agent_node(state, self.agent)
        return _state_to_result(result)


def _agent_node(state: NotebookGraphState, agent: NotebookAgent) -> NotebookGraphState:
    on_text = state.get("on_text")
    if state.get("status") == "tool_results_ready":
        result = agent.continue_session(
            state["agent_session_id"],
            {"toolResults": state.get("tool_results", [])},
            on_text,
        )
    else:
        result = agent.start(
            state["user_request"],
            state["notebook_context"],
            state.get("tools", []),
            state.get("history", []),
            on_text,
        )
    return _merge_agent_result(state, result)


def _merge_agent_result(state: NotebookGraphState, result: dict[str, Any]) -> NotebookGraphState:
    next_state = dict(state)
    next_state["agent_session_id"] = result.get("sessionId", state.get("agent_session_id", ""))
    next_state["round_count"] = result.get("round", state.get("round_count", 0))
    next_state["status"] = "waiting_for_tools" if result.get("status") == "tool_call" else "complete"
    next_state["pending_tool_calls"] = result.get("toolCalls", [])
    if result.get("status") == "tool_call" and not next_state["pending_tool_calls"]:
        next_state["pending_tool_calls"] = [result["toolCall"]]
    next_state["final_response"] = result.get("text", "")
    next_state["streamed_text"] = result.get("text", "")
    next_state["result"] = result
    return next_state


def _state_to_result(state: NotebookGraphState) -> dict[str, Any]:
    result = state.get("result")
    if not isinstance(result, dict):
        raise GeminiError("Agent graph returned no result.")
    result["graphState"] = state
    return result


def _build_langgraph(agent: NotebookAgent):
    try:
        from langgraph.graph import END, START, StateGraph
    except ImportError:
        return None

    graph = StateGraph(NotebookGraphState)
    graph.add_node("agent", lambda state: _agent_node(state, agent))
    graph.add_edge(START, "agent")
    graph.add_edge("agent", END)
    return graph.compile()
