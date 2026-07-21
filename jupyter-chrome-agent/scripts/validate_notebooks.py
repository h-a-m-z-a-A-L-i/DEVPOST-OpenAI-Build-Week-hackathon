"""Validate notebook structure and emit reproducible local metrics."""

import argparse
import json
import sys
import time
from pathlib import Path

BRIDGE_PATH = Path(__file__).parents[1] / "bridge"
sys.path.insert(0, str(BRIDGE_PATH))

from notebook_parser import build_context, parse_notebook  # noqa: E402


def validate(path: Path) -> dict:
    started = time.perf_counter()
    notebook = parse_notebook(path)
    context = build_context(path)
    errors = [
        cell["index"]
        for cell in notebook["cells"]
        if any(output.get("type") == "error" for output in cell["outputs"])
    ]
    return {
        "path": str(path),
        "cellCount": notebook["cellCount"],
        "codeCells": sum(cell["type"] == "code" for cell in notebook["cells"]),
        "markdownCells": sum(cell["type"] == "markdown" for cell in notebook["cells"]),
        "errorCells": errors,
        "contextTruncated": context["context"]["truncated"],
        "contextChars": len(json.dumps(context, ensure_ascii=False)),
        "parseMilliseconds": round((time.perf_counter() - started) * 1000, 2),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path, help="Notebook file or directory to validate")
    parser.add_argument("--json", action="store_true", dest="as_json")
    args = parser.parse_args()
    paths = [args.root] if args.root.is_file() else sorted(args.root.rglob("*.ipynb"))
    paths = [path for path in paths if not any(part in {".git", "node_modules", ".venv"} for part in path.parts)]
    if not paths:
        print("No notebooks found.", file=sys.stderr)
        return 1

    results = []
    for path in paths:
        try:
            results.append(validate(path))
        except (OSError, ValueError, KeyError) as error:
            results.append({"path": str(path), "valid": False, "error": str(error)})

    if args.as_json:
        print(json.dumps(results, indent=2, ensure_ascii=False))
    else:
        for result in results:
            if result.get("valid") is False:
                print(f"FAIL {result['path']}: {result['error']}")
            else:
                print(
                    f"PASS {result['path']}: {result['cellCount']} cells, "
                    f"{len(result['errorCells'])} error cells, "
                    f"{result['parseMilliseconds']} ms"
                )
    return 1 if any(result.get("valid") is False for result in results) else 0


if __name__ == "__main__":
    raise SystemExit(main())
