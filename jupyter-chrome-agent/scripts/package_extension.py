"""Create a clean distributable archive for the Chrome extension."""

import json
import zipfile
from pathlib import Path


ROOT = Path(__file__).parents[1]
OUTPUT = ROOT.parent / "dist" / "notebookpilot-chrome-extension.zip"
FILES = [
    "manifest.json",
    "service-worker.js",
    "tab-identity.js",
    "inpage-panel.js",
    "sidepanel.html",
    "sidepanel.js",
    "sidepanel.css",
]


def main() -> int:
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    missing = [path for path in FILES if not (ROOT / path).is_file()]
    if missing:
        raise SystemExit(f"Missing extension files: {', '.join(missing)}")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(OUTPUT, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for relative_path in FILES:
            archive.write(ROOT / relative_path, relative_path)
    print(f"Packaged NotebookPilot {manifest['version']} at {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
