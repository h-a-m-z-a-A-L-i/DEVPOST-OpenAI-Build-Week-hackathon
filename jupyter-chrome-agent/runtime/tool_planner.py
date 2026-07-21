"""Validate and classify model tool calls before frontend execution."""

from __future__ import annotations

import json
from typing import Any


class ToolPlanningError(ValueError):
    pass


MUTATING_TOOLS = frozenset({
    "insert_cell",
    "edit_cell",
    "delete_cell",
    "run_cell",
    "clear_cell_output",
})


def validate_tool_calls(
    function_calls: list[dict[str, Any]],
    available_tools: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Return normalized calls after enforcing the runtime tool contract."""

    if not isinstance(function_calls, list) or not function_calls:
        raise ToolPlanningError("The model returned no tool calls to plan.")
    if len(function_calls) > 8:
        raise ToolPlanningError("The model returned too many tool calls in one batch.")

    allowed_names = {
        tool.get("name") for tool in available_tools
        if isinstance(tool, dict) and isinstance(tool.get("name"), str)
    }
    normalized: list[dict[str, Any]] = []
    signatures: set[str] = set()
    for call in function_calls:
        if not isinstance(call, dict) or not isinstance(call.get("name"), str):
            raise ToolPlanningError("Each tool call must contain a tool name.")
        name = call["name"].strip()
        if not name or name not in allowed_names:
            raise ToolPlanningError(f"The model requested an unavailable tool: {name or '<empty>'}.")
        args = call.get("args", {})
        if not isinstance(args, dict):
            raise ToolPlanningError(f"Arguments for {name} must be an object.")
        normalized_call = {"name": name, "args": dict(args)}
        signature = json.dumps(normalized_call, sort_keys=True, ensure_ascii=False)
        if signature in signatures:
            raise ToolPlanningError(f"The model repeated {name} in the same batch.")
        signatures.add(signature)
        normalized.append(normalized_call)
    return normalized


def classify_tool_batch(function_calls: list[dict[str, Any]]) -> dict[str, Any]:
    """Describe whether the frontend may treat a batch as reads or ordered work."""

    mutation_count = sum(call.get("name") in MUTATING_TOOLS for call in function_calls)
    return {
        "mode": "ordered" if mutation_count else "read_only",
        "mutationCount": mutation_count,
        "requiresStableTargets": mutation_count > 0,
    }
