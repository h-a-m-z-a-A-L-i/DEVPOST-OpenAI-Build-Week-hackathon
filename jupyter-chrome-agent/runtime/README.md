# NotebookPilot Gemini Runtime

This local service keeps the Gemini API key outside Chrome and manages the agent's tool-calling session.

## Start

```powershell
cd jupyter-chrome-agent/runtime
python server.py
```

The runtime listens on `http://127.0.0.1:8766`.

## Endpoints

- `GET /health`
- `POST /api/chat/start`
- `POST /api/chat/continue`

The start endpoint returns either a final response or a pending Gemini function call. The extension executes the tool through the JupyterLab frontend bridge, then sends the structured result to `/api/chat/continue`.

Gemini is the default provider. Set `LLM_PROVIDER=codex`, `CODEX_API_KEY`, and
optionally `CODEX_MODEL` and `CODEX_BASE_URL` to use an OpenAI-compatible
Codex gateway. Credentials remain local to the Python runtime.

Set `LLM_PROVIDER=langchain` to use the optional LangChain Gemini adapter. Install
`runtime/requirements.txt` first. The adapter preserves the existing tool and
streaming contracts; the default provider remains the direct Gemini client.

The dependency-light `graph_state.py` module defines the Phase 2 LangGraph state
contract and creates a stable thread ID from the notebook path and conversation
ID. The graph does not replace the existing agent loop until later phases; this
keeps the current runtime behavior unchanged while the state contract is tested.

`agent_graph.py` now adapts the existing ReAct loop to that state contract. Each
graph invocation either completes the response or pauses at a frontend tool
boundary; the next invocation resumes with the tool results. If LangGraph is not
installed, the adapter uses the same node function directly so local development
does not lose the existing behavior.

`tool_planner.py` validates every model call against the tools exposed by the
runtime, rejects malformed or duplicate calls, and classifies batches as
read-only or ordered mutation work before they reach the frontend bridge.

`workflow_graph.py` provides the notebook workflow layer: stages are validated
for unique IDs, missing dependencies, and cycles; only dependency-ready stages
can run; and each result can be marked completed or failed for safe resumption.

`checkpoint_store.py` provides optional atomic SQLite persistence for graph state.
`NotebookAgentGraph` can save each pause/result and resume a pending tool round
after a runtime restart without persisting callbacks or response-only objects.
