import json
import sys
import tempfile
import unittest
from pathlib import Path


BRIDGE_PATH = Path(__file__).parents[1] / "bridge"
SCRIPT_PATH = Path(__file__).parents[1] / "scripts"
sys.path.insert(0, str(BRIDGE_PATH))
sys.path.insert(0, str(SCRIPT_PATH))

from notebook_parser import build_context, parse_notebook  # noqa: E402
from validate_notebooks import validate  # noqa: E402


class WorkflowValidationTests(unittest.TestCase):
    def make_workflow(self, directory: Path) -> Path:
        cells = [
            {"id": "intro", "cell_type": "markdown", "source": "# EDA and model workflow", "outputs": []},
            {"id": "eda", "cell_type": "code", "source": "df.describe()\ndf.isna().sum()", "outputs": []},
            {"id": "features", "cell_type": "code", "source": "X = df[['area', 'rooms']]\ny = df['price']", "outputs": []},
            {"id": "model", "cell_type": "code", "source": "model.fit(X, y)\npredictions = model.predict(X)", "outputs": []},
            {"id": "plot", "cell_type": "code", "source": "plt.scatter(y, predictions)", "outputs": []},
            {"id": "failure", "cell_type": "code", "source": "missing_name", "outputs": [{
                "output_type": "error", "ename": "NameError", "evalue": "missing_name is not defined", "traceback": []
            }]},
        ]
        path = directory / "workflow.ipynb"
        path.write_text(json.dumps({"nbformat": 4, "nbformat_minor": 5, "metadata": {}, "cells": cells}), encoding="utf-8")
        return path

    def test_data_science_workflow_and_failure_are_visible(self):
        with tempfile.TemporaryDirectory() as directory:
            path = self.make_workflow(Path(directory))
            notebook = parse_notebook(path)
            context = build_context(path)
            report = validate(path)

            sources = "\n".join(cell["source"] for cell in notebook["cells"])
            self.assertIn("df.describe", sources)
            self.assertIn("model.fit", sources)
            self.assertIn("plt.scatter", sources)
            self.assertEqual(report["errorCells"], [5])
            self.assertEqual(context["cells"][5]["outputs"][0]["type"], "error")
            self.assertFalse(report["contextTruncated"])

    def test_context_preserves_workflow_cell_ids(self):
        with tempfile.TemporaryDirectory() as directory:
            context = build_context(self.make_workflow(Path(directory)))
            self.assertEqual(context["cells"][0]["id"], "intro")
            self.assertTrue(all(cell["stableId"] for cell in context["cells"]))


if __name__ == "__main__":
    unittest.main()
