import json
import os
import subprocess
import time
from pathlib import Path
from typing import Any


IGNORED_DIRECTORIES = {
    ".git", "node_modules", ".venv", "venv", "__pycache__", ".cache", ".conda",
    "AppData", "Application Data", "Local Settings",
}
MAX_SOURCE_CHARS = 12000
MAX_OUTPUT_CHARS = 8000
MAX_CONTEXT_CHARS = 60000
SERVER_ROOT_CACHE_TTL = 30.0
_server_root_cache: tuple[float, Path] | None = None


def load_dotenv() -> None:
    candidates = [
        Path.cwd() / ".env",
        Path(__file__).resolve().parents[2] / ".env",
    ]
    for path in candidates:
        if not path.is_file():
            continue
        for raw_line in path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            name, value = line.split("=", 1)
            name = name.strip().strip("'\"")
            value = value.strip().strip("'\"")
            os.environ.setdefault(name, value)
        return


def discover_server_root() -> Path:
    global _server_root_cache
    configured_root = os.getenv("JUPYTER_ROOT_DIR") or os.getenv("JUPYTER_SERVER_ROOT")
    if configured_root:
        return Path(configured_root).expanduser().resolve()

    if _server_root_cache and time.monotonic() - _server_root_cache[0] < SERVER_ROOT_CACHE_TTL:
        return _server_root_cache[1]

    result = subprocess.run(
        ["python", "-m", "jupyter", "server", "list"],
        capture_output=True,
        text=True,
        check=True,
        timeout=10,
    )
    for line in result.stdout.splitlines():
        if " :: " in line:
            root = Path(line.rsplit(" :: ", 1)[1].strip()).resolve()
            _server_root_cache = (time.monotonic(), root)
            return root

    raise RuntimeError("No running Jupyter server was found or its root could not be discovered.")


def find_notebooks(root: Path, notebook_name: str) -> list[Path]:
    matches: list[Path] = []
    target = Path(notebook_name).name.lower()
    direct_match = root / Path(notebook_name).name
    if direct_match.is_file():
        matches.append(direct_match)
    for directory, child_directories, filenames in os.walk(root, followlinks=False, onerror=lambda _error: None):
        child_directories[:] = [
            child for child in child_directories
            if child not in IGNORED_DIRECTORIES
        ]
        for filename in filenames:
            if filename.lower() == target and filename.lower().endswith(".ipynb") and Path(directory) / filename != direct_match:
                matches.append(Path(directory) / filename)
    return sorted(matches)


def parse_notebook(path: Path) -> dict[str, Any]:
    notebook = json.loads(path.read_text(encoding="utf-8"))
    cells = []
    for index, cell in enumerate(notebook.get("cells", [])):
        cells.append({
            "index": index,
            "id": cell.get("id"),
            "stableId": isinstance(cell.get("id"), str) and bool(cell.get("id")),
            "type": cell.get("cell_type", "unknown"),
            "language": notebook.get("metadata", {}).get("kernelspec", {}).get("language", "python"),
            "source": truncate_text(join_value(cell.get("source", "")), MAX_SOURCE_CHARS),
            "executionCount": cell.get("execution_count"),
            "outputs": normalize_outputs(cell.get("outputs", [])),
        })

    return {
        "path": str(path),
        "name": path.name,
        "format": notebook.get("nbformat"),
        "formatMinor": notebook.get("nbformat_minor"),
        "cellCount": len(cells),
        "cells": cells,
    }


def build_context(path: Path) -> dict[str, Any]:
    notebook = parse_notebook(path)
    context = {
        **notebook,
        "context": {
            "maxChars": MAX_CONTEXT_CHARS,
            "truncated": False,
        },
    }

    serialized = json.dumps(context, ensure_ascii=False)
    if len(serialized) <= MAX_CONTEXT_CHARS:
        return context

    context["cells"] = compact_cells(context["cells"])
    context["context"]["truncated"] = True
    return context


def normalize_outputs(outputs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized = []
    for output in outputs:
        item = {"type": output.get("output_type")}
        if output.get("name"):
            item["name"] = output["name"]
        if output.get("text") is not None:
            item["text"] = truncate_text(join_value(output["text"]), MAX_OUTPUT_CHARS)
        if output.get("data") is not None:
            item["data"] = compact_data(output["data"])
        if output.get("ename") or output.get("evalue"):
            item["error"] = {
                "name": output.get("ename"),
                "value": output.get("evalue"),
                "traceback": output.get("traceback", []),
            }
        normalized.append(item)
    return normalized


def compact_cells(cells: list[dict[str, Any]]) -> list[dict[str, Any]]:
    compacted = []
    current_size = 0
    for cell in cells:
        encoded = json.dumps(cell, ensure_ascii=False)
        if compacted and current_size + len(encoded) > MAX_CONTEXT_CHARS:
            compacted.append({
                "index": cell["index"],
                "type": cell["type"],
                "source": "[omitted: context limit reached]",
                "outputs": [],
            })
            continue
        compacted.append(cell)
        current_size += len(encoded)
    return compacted


def compact_data(value: Any) -> Any:
    if isinstance(value, str):
        return truncate_text(value, MAX_OUTPUT_CHARS)
    if isinstance(value, (dict, list)):
        encoded = json.dumps(value, ensure_ascii=False)
        if len(encoded) <= MAX_OUTPUT_CHARS:
            return value
        return {
            "omitted": True,
            "reason": "output exceeded context limit",
            "preview": truncate_text(encoded, MAX_OUTPUT_CHARS),
        }
    return value


def truncate_text(value: Any, limit: int) -> str:
    text = str(value)
    if len(text) <= limit:
        return text
    return f"{text[:limit]}\n...[truncated]"


def join_value(value: Any) -> Any:
    return "".join(value) if isinstance(value, list) else value


load_dotenv()
