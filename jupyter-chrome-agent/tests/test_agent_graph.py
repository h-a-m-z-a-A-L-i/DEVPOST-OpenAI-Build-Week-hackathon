import sys
import unittest
from pathlib import Path


RUNTIME_PATH = Path(__file__).parents[1] / "runtime"
sys.path.insert(0, str(RUNTIME_PATH))

from agent_graph import NotebookAgentGraph  # noqa: E402
from checkpoint_store import SQLiteCheckpointStore  # noqa: E402


class FakeAgent:
    def __init__(self):
        self.calls = []

    def start(self, prompt, context, tools, history, on_text=None):
        self.calls.append(("start", prompt, context, tools, history))
        if on_text:
            on_text("planning")
        return {
            "status": "tool_call",
            "sessionId": "session-1",
            "round": 1,
            "toolCall": {"name": "list_cells", "args": {}},
        }

    def continue_session(self, session_id, result, on_text=None):
        self.calls.append(("continue", session_id, result))
        return {"status": "complete", "sessionId": session_id, "round": 2, "text": "done"}


class AgentGraphTests(unittest.TestCase):
    def test_graph_pauses_for_frontend_tools_and_resumes(self):
        agent = FakeAgent()
        streamed = []
        graph = NotebookAgentGraph(agent, use_langgraph=False)

        pending = graph.start(
            "inspect notebook",
            {"cells": []},
            [{"name": "list_cells"}],
            on_text=streamed.append,
            notebook_path="demo.ipynb",
            conversation_id="conversation-1",
        )

        self.assertEqual(pending["status"], "tool_call")
        self.assertEqual(pending["graphState"]["status"], "waiting_for_tools")
        self.assertTrue(pending["graphState"]["thread_id"].startswith("notebookpilot-"))
        self.assertEqual(pending["graphState"]["pending_tool_calls"][0]["name"], "list_cells")
        self.assertEqual(streamed, ["planning"])

        complete = graph.continue_session(
            pending["graphState"],
            [{"ok": True, "cells": []}],
        )

        self.assertEqual(complete["status"], "complete")
        self.assertEqual(complete["text"], "done")
        self.assertEqual(agent.calls[1][0:2], ("continue", "session-1"))

    def test_graph_preserves_multiple_tool_calls(self):
        class MultiToolAgent(FakeAgent):
            def start(self, *args, **kwargs):
                return {
                    "status": "tool_call",
                    "sessionId": "session-2",
                    "round": 1,
                    "toolCalls": [
                        {"name": "list_cells", "args": {}},
                        {"name": "get_notebook_info", "args": {}},
                    ],
                }

        pending = NotebookAgentGraph(MultiToolAgent(), use_langgraph=False).start(
            "inspect", {}, []
        )

        self.assertEqual(len(pending["graphState"]["pending_tool_calls"]), 2)

    def test_graph_can_resume_from_persisted_state(self):
        with __import__("tempfile").TemporaryDirectory() as directory:
            store = SQLiteCheckpointStore(Path(directory) / "state.sqlite3")
            first_agent = FakeAgent()
            first_graph = NotebookAgentGraph(first_agent, use_langgraph=False, checkpoint_store=store)
            pending = first_graph.start("inspect", {}, [])

            restarted_graph = NotebookAgentGraph(FakeAgent(), use_langgraph=False, checkpoint_store=store)
            complete = restarted_graph.resume(
                pending["graphState"]["thread_id"],
                [{"ok": True, "cells": []}],
            )

            self.assertEqual(complete["status"], "complete")
            self.assertEqual(complete["text"], "done")


if __name__ == "__main__":
    unittest.main()
