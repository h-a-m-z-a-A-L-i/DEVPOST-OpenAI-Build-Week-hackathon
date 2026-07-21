import sys
import unittest
from pathlib import Path
from unittest.mock import patch


RUNTIME_PATH = Path(__file__).parents[1] / "runtime"
sys.path.insert(0, str(RUNTIME_PATH))

import server  # noqa: E402


class FakeGraph:
    def start(self, prompt, context, tools, history=None, on_text=None, notebook_path="", conversation_id=""):
        return {"status": "complete", "text": prompt, "threadId": f"{notebook_path}:{conversation_id}"}

    def continue_session(self, state, tool_results, on_text=None):
        return {"status": "complete", "text": str(tool_results), "threadId": state["thread_id"]}

    def resume(self, thread_id, tool_results, on_text=None):
        return {"status": "complete", "text": str(tool_results), "threadId": thread_id}


class ServerApiTests(unittest.TestCase):
    def test_graph_start_passes_notebook_and_conversation_identity(self):
        with patch.object(server, "graph_agent", FakeGraph()):
            result = server.graph_agent.start(
                "inspect",
                {"cells": []},
                server.NOTEBOOK_TOOLS,
                [],
                notebook_path="demo.ipynb",
                conversation_id="conversation-2",
            )

        self.assertEqual(result["threadId"], "demo.ipynb:conversation-2")

    def test_graph_endpoints_are_documented_as_additive(self):
        readme = (RUNTIME_PATH / "README.md").read_text(encoding="utf-8")
        self.assertIn("/api/graph/start", readme)
        self.assertIn("/api/graph/resume", readme)


if __name__ == "__main__":
    unittest.main()
