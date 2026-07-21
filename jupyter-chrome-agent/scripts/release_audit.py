"""Run production-readiness checks for the NotebookPilot repository."""

import json
import re
import subprocess
import sys
import zipfile
from pathlib import Path


PROJECT = Path(__file__).parents[1]
REPOSITORY = PROJECT.parent
REQUIRED_FILES = [
    "manifest.json",
    "service-worker.js",
    "inpage-panel.js",
    "bridge/server.py",
    "runtime/server.py",
    "jupyterlab-bridge/src/index.ts",
    "server-extension/pyproject.toml",
]
FORBIDDEN_ARCHIVE_ENTRIES = {".env", "node_modules", "__pycache__"}
SECRET_PATTERNS = [
    re.compile(r"AIza[0-9A-Za-z_-]{20,}"),
    re.compile(r"\bsk-[A-Za-z0-9]{20,}"),
    re.compile(r"JUPYTER_TOKEN\s*=\s*[^$\s<>{}]+"),
]


def tracked_files() -> list[Path]:
    result = subprocess.run(
        ["git", "ls-files"], cwd=REPOSITORY, capture_output=True, text=True, check=True
    )
    return [REPOSITORY / line for line in result.stdout.splitlines() if line]


def main() -> int:
    failures = []
    for relative_path in REQUIRED_FILES:
        if not (PROJECT / relative_path).is_file():
            failures.append(f"missing required file: {relative_path}")

    try:
        manifest = json.loads((PROJECT / "manifest.json").read_text(encoding="utf-8"))
        if manifest.get("manifest_version") != 3:
            failures.append("manifest is not Manifest V3")
        if manifest.get("version") != "0.3.0":
            failures.append("manifest version is not 0.3.0")
    except (OSError, ValueError) as error:
        failures.append(f"manifest is invalid: {error}")

    for path in tracked_files():
        if not path.is_file() or path.suffix in {".ipynb", ".lock"}:
            continue
        try:
            contents = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for pattern in SECRET_PATTERNS:
            if pattern.search(contents):
                failures.append(f"possible secret pattern in tracked file: {path.relative_to(REPOSITORY)}")

    archive = REPOSITORY / "dist" / "notebookpilot-chrome-extension.zip"
    if not archive.is_file():
        failures.append("Chrome extension archive is missing; run package_extension.py")
    else:
        with zipfile.ZipFile(archive) as package:
            entries = set(package.namelist())
            expected = {
                "manifest.json", "service-worker.js", "tab-identity.js",
                "inpage-panel.js",
            }
            if entries != expected:
                failures.append(f"archive entries differ from expected set: {sorted(entries)}")
            if any(any(part in FORBIDDEN_ARCHIVE_ENTRIES for part in Path(entry).parts) for entry in entries):
                failures.append("archive contains forbidden generated or secret files")

    if failures:
        print("RELEASE AUDIT FAILED")
        print("\n".join(f"- {failure}" for failure in failures))
        return 1
    print("RELEASE AUDIT PASSED")
    print(f"- {len(REQUIRED_FILES)} required project files present")
    print("- Manifest V3 metadata valid")
    print("- No tracked secret patterns found")
    print("- Chrome archive contents valid")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
