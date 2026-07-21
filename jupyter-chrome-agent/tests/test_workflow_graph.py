import sys
import unittest
from pathlib import Path


RUNTIME_PATH = Path(__file__).parents[1] / "runtime"
sys.path.insert(0, str(RUNTIME_PATH))

from workflow_graph import WorkflowError, advance_workflow, next_ready_stage, normalize_workflow  # noqa: E402


class WorkflowGraphTests(unittest.TestCase):
    def setUp(self):
        self.workflow = [
            {"id": "imports", "title": "Imports"},
            {"id": "train", "title": "Train", "depends_on": ["imports"]},
            {"id": "evaluate", "title": "Evaluate", "depends_on": ["train"]},
        ]

    def test_returns_only_dependency_ready_stage(self):
        self.assertEqual(next_ready_stage(self.workflow)["id"], "imports")
        workflow = advance_workflow(self.workflow, "imports", True)
        self.assertEqual(next_ready_stage(workflow)["id"], "train")

    def test_failed_dependency_blocks_downstream_stage(self):
        workflow = advance_workflow(self.workflow, "imports", False, "Syntax error")

        self.assertIsNone(next_ready_stage(workflow))
        self.assertEqual(workflow[0]["error"], "Syntax error")

    def test_workflow_can_resume_after_completed_stages(self):
        workflow = advance_workflow(self.workflow, "imports", True)
        workflow = advance_workflow(workflow, "train", True)

        self.assertEqual(next_ready_stage(workflow)["id"], "evaluate")

    def test_rejects_missing_dependencies_and_cycles(self):
        with self.assertRaises(WorkflowError):
            normalize_workflow([{"id": "train", "depends_on": ["missing"]}])
        with self.assertRaises(WorkflowError):
            normalize_workflow([
                {"id": "a", "depends_on": ["b"]},
                {"id": "b", "depends_on": ["a"]},
            ])

    def test_rejects_duplicate_and_terminal_reexecution(self):
        with self.assertRaises(WorkflowError):
            normalize_workflow([{"id": "a"}, {"id": "a"}])
        workflow = advance_workflow(self.workflow, "imports", True)
        with self.assertRaises(WorkflowError):
            advance_workflow(workflow, "imports", True)


if __name__ == "__main__":
    unittest.main()
