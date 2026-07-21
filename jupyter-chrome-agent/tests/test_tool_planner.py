import sys
import unittest
from pathlib import Path


RUNTIME_PATH = Path(__file__).parents[1] / "runtime"
sys.path.insert(0, str(RUNTIME_PATH))

from tool_planner import ToolPlanningError, classify_tool_batch, validate_tool_calls  # noqa: E402


TOOLS = [
    {"name": "list_cells"},
    {"name": "read_cell"},
    {"name": "edit_cell"},
]


class ToolPlannerTests(unittest.TestCase):
    def test_normalizes_valid_calls_and_copies_arguments(self):
        arguments = {"index": 1}
        calls = validate_tool_calls([{"name": "read_cell", "args": arguments}], TOOLS)

        arguments["index"] = 9
        self.assertEqual(calls, [{"name": "read_cell", "args": {"index": 1}}])

    def test_rejects_unknown_malformed_and_duplicate_calls(self):
        cases = [
            [{"name": "delete_everything", "args": {}}],
            [{"name": "read_cell", "args": []}],
            [
                {"name": "list_cells", "args": {}},
                {"name": "list_cells", "args": {}},
            ],
        ]
        for calls in cases:
            with self.assertRaises(ToolPlanningError):
                validate_tool_calls(calls, TOOLS)

    def test_classifies_read_batches(self):
        result = classify_tool_batch([
            {"name": "list_cells", "args": {}},
            {"name": "read_cell", "args": {"index": 0}},
        ])

        self.assertEqual(result, {
            "mode": "read_only",
            "mutationCount": 0,
            "requiresStableTargets": False,
        })

    def test_classifies_mutations_as_ordered(self):
        result = classify_tool_batch([
            {"name": "edit_cell", "args": {"cellId": "cell-a", "source": "x = 1"}},
            {"name": "list_cells", "args": {}},
        ])

        self.assertEqual(result["mode"], "ordered")
        self.assertEqual(result["mutationCount"], 1)
        self.assertTrue(result["requiresStableTargets"])


if __name__ == "__main__":
    unittest.main()
