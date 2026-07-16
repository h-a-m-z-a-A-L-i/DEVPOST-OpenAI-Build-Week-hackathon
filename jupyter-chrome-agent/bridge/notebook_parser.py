import json
import os
import subprocess
from pathlib import Path
from typing import Any


IGNORED_DIRECTORIES = {".git", "node_modules", ".venv", "venv", "__pycache__"}


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
    configured_root = os.getenv("JUPYTER_ROOT_DIR")
    if configured_root:
        return Path(configured_root).expanduser().resolve()

    result = subprocess.run(
        ["python", "-m", "jupyter", "server", "list"],
        capture_output=True,
        text=True,
        check=True,
    )
    for line in result.stdout.splitlines():
        if " :: " in line:
            return Path(line.rsplit(" :: ", 1)[1].strip()).resolve()

    raise RuntimeError("No running Jupyter server was found.")


def find_notebooks(root: Path, notebook_name: str) -> list[Path]:
    matches: list[Path] = []
    for path in root.rglob(notebook_name):
        if not path.is_file() or path.suffix.lower() != ".ipynb":
            continue
        if any(part in IGNORED_DIRECTORIES for part in path.parts):
            continue
        matches.append(path)
    return sorted(matches)


def parse_notebook(path: Path) -> dict[str, Any]:
    notebook = json.loads(path.read_text(encoding="utf-8"))
    cells = []
    for index, cell in enumerate(notebook.get("cells", [])):
        cells.append({
            "index": index,
            "type": cell.get("cell_type", "unknown"),
            "language": notebook.get("metadata", {}).get("kernelspec", {}).get("language", "python"),
            "source": "".join(cell.get("source", [])) if isinstance(cell.get("source"), list) else cell.get("source", ""),
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


def normalize_outputs(outputs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized = []
    for output in outputs:
        item = {"type": output.get("output_type")}
        if output.get("name"):
            item["name"] = output["name"]
        if output.get("text") is not None:
            item["text"] = join_value(output["text"])
        if output.get("data") is not None:
            item["data"] = output["data"]
        if output.get("ename") or output.get("evalue"):
            item["error"] = {
                "name": output.get("ename"),
                "value": output.get("evalue"),
                "traceback": output.get("traceback", []),
            }
        normalized.append(item)
    return normalized


def join_value(value: Any) -> Any:
    return "".join(value) if isinstance(value, list) else value


load_dotenv()
