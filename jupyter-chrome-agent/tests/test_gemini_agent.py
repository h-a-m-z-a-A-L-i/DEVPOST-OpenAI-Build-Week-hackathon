import sys
import unittest
from pathlib import Path


RUNTIME_PATH = Path(__file__).parents[1] / "runtime"
sys.path.insert(0, str(RUNTIME_PATH))

from gemini_agent import NotebookAgent, build_prompt, compress_context, normalize_codex_response  # noqa: E402
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


class FailingToolClient:
    def generate(self, contents, tools):
        return {
            "candidates": [{"content": {"role": "model", "parts": [{
                "functionCall": {"name": "run_cell", "args": {"index": 0}}
            }]}}]
        }


class RepeatingToolClient:
    def generate(self, contents, tools):
        return {
            "candidates": [{"content": {"role": "model", "parts": [{
                "functionCall": {"name": "list_cells", "args": {}},
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

    def test_context_compression_reports_omitted_cells(self):
        context = {"cells": [{"index": index, "source": "x" * 8000, "outputs": []} for index in range(30)]}
        compressed = compress_context(context)

        self.assertTrue(compressed["contextSummary"]["truncated"])
        self.assertLess(len(compressed["cells"]), 30)

    def test_agent_stops_after_repeated_tool_failures(self):
        agent = NotebookAgent(FailingToolClient())
        pending = agent.start("Run the cell.", {"cells": []}, NOTEBOOK_TOOLS)

        with self.assertRaisesRegex(RuntimeError, "repeated notebook tool failures"):
            for _ in range(4):
                pending = agent.continue_session(pending["sessionId"], {
                    "ok": False,
                    "error": {"code": "KERNEL_BUSY", "message": "busy"},
                })

    def test_prompt_prefers_supplied_context_for_read_questions(self):
        prompt = build_prompt("Can you read the current code?", {"cells": []})

        self.assertIn("context is authoritative", prompt)
        self.assertIn("do not call read tools", prompt)

    def test_prompt_requires_structured_cells_for_large_workflows(self):
        prompt = build_prompt("Build a complete machine learning workflow.", {"cells": []})

        self.assertIn("never place a large workflow or large code answer in one cell", prompt)
        self.assertIn("one working stage per cell", prompt)
        self.assertIn("run affected cells in order", prompt)

    def test_prompt_places_notebook_context_before_dynamic_history(self):
        prompt = build_prompt("What is this?", {"cells": []}, [{"role": "user", "text": "Earlier"}])

        self.assertLess(prompt.index("Notebook context:"), prompt.index("Recent conversation:"))

    def test_agent_stops_after_repeating_same_tool_call(self):
        agent = NotebookAgent(RepeatingToolClient())
        pending = agent.start("Summarize the notebook.", {"cells": []}, NOTEBOOK_TOOLS)

        with self.assertRaisesRegex(RuntimeError, "repeating the list_cells tool call"):
            for _ in range(2):
                pending = agent.continue_session(pending["sessionId"], {"ok": True, "cells": []})


if __name__ == "__main__":
    unittest.main()
