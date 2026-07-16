import json
import sys
import tempfile
import unittest
from pathlib import Path


BRIDGE_PATH = Path(__file__).parents[1] / "bridge"
sys.path.insert(0, str(BRIDGE_PATH))

from notebook_parser import build_context, find_notebooks, parse_notebook  # noqa: E402


class NotebookParserTests(unittest.TestCase):
    def write_notebook(self, directory: Path, name: str, cells: list[dict]) -> Path:
        path = directory / name
        path.write_text(json.dumps({
            "nbformat": 4,
            "nbformat_minor": 5,
            "metadata": {"kernelspec": {"language": "python"}},
            "cells": cells,
        }), encoding="utf-8")
        return path

    def test_normalizes_cells_and_outputs(self):
        with tempfile.TemporaryDirectory() as directory:
            path = self.write_notebook(Path(directory), "demo.ipynb", [{
                "cell_type": "code",
                "source": ["print('ok')\n"],
                "execution_count": 1,
                "outputs": [{"output_type": "stream", "name": "stdout", "text": ["ok\n"]}],
            }])

            notebook = parse_notebook(path)

            self.assertEqual(notebook["cellCount"], 1)
            self.assertEqual(notebook["cells"][0]["source"], "print('ok')\n")
            self.assertEqual(notebook["cells"][0]["outputs"][0]["text"], "ok\n")

    def test_limits_large_context(self):
        with tempfile.TemporaryDirectory() as directory:
            cells = [{"cell_type": "code", "source": "x" * 12000, "outputs": []} for _ in range(8)]
            context = build_context(self.write_notebook(Path(directory), "large.ipynb", cells))

            self.assertTrue(context["context"]["truncated"])
            self.assertTrue(any("omitted" in cell["source"] for cell in context["cells"]))

    def test_duplicate_names_are_returned_for_caller_resolution(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.write_notebook(root / "one" if (root / "one").mkdir() is None else root, "same.ipynb", [])
            (root / "two").mkdir()
            self.write_notebook(root / "two", "same.ipynb", [])

            matches = find_notebooks(root, "same.ipynb")

            self.assertEqual(len(matches), 2)


if __name__ == "__main__":
    unittest.main()
