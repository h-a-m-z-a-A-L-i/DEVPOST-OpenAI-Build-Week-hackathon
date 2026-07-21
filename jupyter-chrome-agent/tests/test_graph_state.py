import sys
import unittest
from pathlib import Path


RUNTIME_PATH = Path(__file__).parents[1] / "runtime"
sys.path.insert(0, str(RUNTIME_PATH))

from graph_state import build_initial_state, graph_config, make_thread_id  # noqa: E402


class GraphStateTests(unittest.TestCase):
    def test_thread_id_is_stable_and_does_not_expose_path(self):
        first = make_thread_id("C:/notebooks/demo.ipynb", "conversation-1")
        second = make_thread_id("C:/notebooks/demo.ipynb", "conversation-1")

        self.assertEqual(first, second)
        self.assertTrue(first.startswith("notebookpilot-"))
        self.assertNotIn("demo.ipynb", first)

    def test_notebook_and_conversation_are_isolated(self):
        base = make_thread_id("demo.ipynb", "conversation-1")

        self.assertNotEqual(base, make_thread_id("demo.ipynb", "conversation-2"))
        self.assertNotEqual(base, make_thread_id("other.ipynb", "conversation-1"))

    def test_initial_state_has_safe_defaults(self):
        state = build_initial_state(
            "read the notebook",
            "demo.ipynb",
            "conversation-1",
            {"cells": [{"id": "cell-1"}]},
            [{"role": "user", "content": "hello"}],
        )

        self.assertEqual(state["current_step"], "load_context")
        self.assertEqual(state["status"], "ready")
        self.assertEqual(state["round_count"], 0)
        self.assertEqual(state["history"], [{"role": "user", "content": "hello"}])
        self.assertEqual(state["pending_tool_calls"], [])
        self.assertEqual(graph_config(state), {"configurable": {"thread_id": state["thread_id"]}})

    def test_initial_state_copies_mutable_inputs(self):
        context = {"cells": []}
        history = []
        state = build_initial_state("request", "demo.ipynb", "conversation-1", context, history)

        context["changed"] = True
        history.append({"role": "assistant", "content": "changed"})

        self.assertNotIn("changed", state["notebook_context"])
        self.assertEqual(state["history"], [])

    def test_invalid_inputs_are_rejected(self):
        with self.assertRaises(ValueError):
            make_thread_id("", "conversation-1")
        with self.assertRaises(ValueError):
            build_initial_state("request", "demo.ipynb", "conversation-1", [])
        with self.assertRaises(ValueError):
            build_initial_state("request", "demo.ipynb", "conversation-1", {}, {})


if __name__ == "__main__":
    unittest.main()
