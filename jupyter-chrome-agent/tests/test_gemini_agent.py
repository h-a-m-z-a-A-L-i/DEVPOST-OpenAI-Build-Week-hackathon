import sys
import unittest
from pathlib import Path


RUNTIME_PATH = Path(__file__).parents[1] / "runtime"
sys.path.insert(0, str(RUNTIME_PATH))

from gemini_agent import NotebookAgent, normalize_codex_response  # noqa: E402
from tool_contracts import NOTEBOOK_TOOLS  # noqa: E402


class FakeGeminiClient:
    def __init__(self):
        self.calls = 0

    def generate(self, contents, tools):
        self.calls += 1
        if self.calls == 1:
            return {
                "candidates": [{"content": {"role": "model", "parts": [{
                    "functionCall": {"name": "list_cells", "args": {}}
                }]}}]
            }
        return {
            "candidates": [{"content": {"role": "model", "parts": [{
                "text": "The notebook contains one cell."
            }]}}]
        }


class GeminiAgentTests(unittest.TestCase):
    def test_agent_continues_after_tool_result(self):
        agent = NotebookAgent(FakeGeminiClient())
        pending = agent.start("Summarize the notebook.", {"cells": []}, NOTEBOOK_TOOLS)

        self.assertEqual(pending["status"], "tool_call")
        final = agent.continue_session(pending["sessionId"], {"cells": [{"index": 0}]})

        self.assertEqual(final["status"], "complete")
        self.assertIn("one cell", final["text"])

    def test_normalizes_codex_tool_call(self):
        response = normalize_codex_response({
            "choices": [{"message": {"content": None, "tool_calls": [{
                "function": {"name": "read_cell", "arguments": '{"cellId":"cell-a1b2"}'},
            }]}}]
        })

        self.assertEqual(response["candidates"][0]["content"]["parts"][0]["functionCall"]["name"], "read_cell")
        self.assertEqual(response["candidates"][0]["content"]["parts"][0]["functionCall"]["args"]["cellId"], "cell-a1b2")


if __name__ == "__main__":
    unittest.main()
