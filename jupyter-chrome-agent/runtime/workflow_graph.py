"""Dependency-aware notebook workflow planning and resumable transitions."""

from __future__ import annotations

from copy import deepcopy
from typing import Any, TypedDict


class WorkflowStage(TypedDict, total=False):
    id: str
    title: str
    type: str
    cell_id: str
    depends_on: list[str]
    status: str
    error: str


class WorkflowError(ValueError):
    pass


TERMINAL_STATUSES = frozenset({"completed", "failed"})


def normalize_workflow(stages: list[dict[str, Any]]) -> list[WorkflowStage]:
    """Validate and normalize a workflow without mutating caller-owned data."""

    if not isinstance(stages, list):
        raise WorkflowError("Workflow stages must be a list.")
    normalized: list[WorkflowStage] = []
    stage_ids: set[str] = set()
    for stage in stages:
        if not isinstance(stage, dict):
            raise WorkflowError("Each workflow stage must be an object.")
        stage_id = stage.get("id")
        if not isinstance(stage_id, str) or not stage_id.strip():
            raise WorkflowError("Each workflow stage needs a non-empty id.")
        stage_id = stage_id.strip()
        if stage_id in stage_ids:
            raise WorkflowError(f"Workflow stage id is duplicated: {stage_id}.")
        dependencies = stage.get("depends_on", [])
        if not isinstance(dependencies, list) or any(not isinstance(item, str) for item in dependencies):
            raise WorkflowError(f"Dependencies for {stage_id} must be a list of strings.")
        status = stage.get("status", "pending")
        if status not in {"pending", "running", "completed", "failed"}:
            raise WorkflowError(f"Invalid workflow status for {stage_id}: {status}.")
        normalized.append({
            "id": stage_id,
            "title": str(stage.get("title", stage_id)).strip(),
            "type": str(stage.get("type", "code")).strip() or "code",
            "cell_id": str(stage.get("cell_id", "")).strip(),
            "depends_on": list(dict.fromkeys(dependencies)),
            "status": status,
            **({"error": str(stage["error"])} if stage.get("error") else {}),
        })
        stage_ids.add(stage_id)

    known_ids = {stage["id"] for stage in normalized}
    for stage in normalized:
        missing = [item for item in stage["depends_on"] if item not in known_ids]
        if missing:
            raise WorkflowError(f"{stage['id']} depends on unknown stage(s): {', '.join(missing)}.")
    _assert_acyclic(normalized)
    return normalized


def next_ready_stage(stages: list[dict[str, Any]]) -> WorkflowStage | None:
    """Return the first pending stage whose dependencies completed."""

    workflow = normalize_workflow(stages)
    by_id = {stage["id"]: stage for stage in workflow}
    for stage in workflow:
        if stage["status"] != "pending":
            continue
        dependencies = [by_id[item] for item in stage["depends_on"]]
        if any(item["status"] == "failed" for item in dependencies):
            continue
        if all(item["status"] == "completed" for item in dependencies):
            return deepcopy(stage)
    return None


def advance_workflow(
    stages: list[dict[str, Any]],
    stage_id: str,
    ok: bool,
    error: str = "",
) -> list[WorkflowStage]:
    """Mark one stage complete or failed and return the updated workflow."""

    workflow = normalize_workflow(stages)
    target = next((stage for stage in workflow if stage["id"] == stage_id), None)
    if target is None:
        raise WorkflowError(f"Unknown workflow stage: {stage_id}.")
    if target["status"] in TERMINAL_STATUSES:
        raise WorkflowError(f"Workflow stage is already terminal: {stage_id}.")
    target["status"] = "completed" if ok else "failed"
    if ok:
        target.pop("error", None)
    else:
        target["error"] = error.strip() or "Stage execution failed."
    return workflow


def _assert_acyclic(stages: list[WorkflowStage]) -> None:
    by_id = {stage["id"]: stage for stage in stages}
    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(stage_id: str) -> None:
        if stage_id in visiting:
            raise WorkflowError("Workflow dependencies contain a cycle.")
        if stage_id in visited:
            return
        visiting.add(stage_id)
        for dependency in by_id[stage_id]["depends_on"]:
            visit(dependency)
        visiting.remove(stage_id)
        visited.add(stage_id)

    for stage in stages:
        visit(stage["id"])
