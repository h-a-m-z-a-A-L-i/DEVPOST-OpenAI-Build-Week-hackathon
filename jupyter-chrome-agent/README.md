# NotebookPilot

NotebookPilot is a local-first AI assistant for JupyterLab. It runs as a Chrome
Manifest V3 extension with an in-page assistant panel and uses the live
JupyterLab notebook model to read, edit, insert, delete, and execute cells.

The project is designed for local notebooks: the Gemini API key stays in the
local Python runtime, notebook operations are validated before execution, and
the Chrome extension never contains API credentials.

## Features

- Injects a movable `NP` toggle and fixed right-side assistant panel into local JupyterLab notebook tabs.
- Detects the active notebook from JupyterLab's dock tab bar rather than trusting the URL filename.
- Maintains separate conversations and history for each notebook.
- Reads live notebook cells through the official JupyterLab `INotebookTracker` API.
- Supports cell reading, output inspection, search, insertion, editing, deletion, execution, output clearing, error inspection, and kernel status.
- Streams assistant responses into the panel with `Thinking` and `Working` indicators.
- Renders assistant Markdown with headings, bold labels, bullets, inline code, and fenced code blocks.
- Splits substantial data-science workflows into ordered, logically complete cells.
- Validates model tool calls against an allowlist before forwarding them to JupyterLab.
- Preserves Gemini tool-call thought signatures for reliable tool continuations.
- Enforces Gemini quota defaults of `28 RPM` and `1,400 RPD`.
- Persists optional graph checkpoints in SQLite for restart recovery.
- Automatically starts the local bridge and runtime when Jupyter Server starts.

## Architecture

```text
Chrome extension
  ├─ service-worker.js       Target tracking, chat orchestration, tool routing
  ├─ inpage-panel.js         Injected panel, conversation UI, Markdown rendering
  └─ tab-identity.js         JupyterLab tab validation and notebook identity
             │
             │ localhost HTTP + window.postMessage
             ▼
JupyterLab frontend bridge  Live NotebookPanel and INotebookTracker operations
             │
             ├─ 127.0.0.1:8765  Python notebook parser/context bridge
             └─ 127.0.0.1:8766  Gemini/LangChain agent runtime
                                  │
                                  ▼
                           Gemini or optional Codex gateway
```

### Request flow

1. The content script confirms the page is local JupyterLab at
   `http://localhost:8888/lab`.
2. It watches `#jp-main-dock-panel .lm-DockPanel-tabBar` and reads the active
   `.lm-TabBar-tabLabel` ending in `.ipynb`.
3. The service worker stores the active target and conversation identity.
4. Notebook context is read from the live JupyterLab model when the frontend
   bridge is available. The Python bridge is the read-only fallback.
5. The service worker sends the request and context to the graph streaming API.
6. The model either returns Markdown or requests one or more validated tools.
7. The extension executes tools through the JupyterLab frontend bridge and
   sends the results back to the graph.
8. The final Markdown response is rendered in the injected panel and saved to
   that notebook's conversation history.

## Requirements

- Windows 10/11 for the current automatic-start setup.
- Google Chrome with Manifest V3 support.
- Python 3.11 recommended.
- JupyterLab `4.6.1` recommended.
- Node.js and npm for building the JupyterLab bridge.
- A Gemini API key for the default provider.

## Configuration

Create a `.env` file outside the extension bundle. Never commit it.

```dotenv
GEMINI_API_KEY=your-key
GEMINI_MODEL=gemini-3.1-flash-lite

# Local notebook resolution
JUPYTER_ROOT_DIR=C:\Users\Admin

# Provider and quota controls
LLM_PROVIDER=gemini
GEMINI_RPM=28
GEMINI_RPD=1400
GEMINI_MAX_OUTPUT_TOKENS=65536

# Context and agent controls
LLM_CONTEXT_MAX_CHARS=3500000
LLM_REACT_MAX_ROUNDS=15
LLM_MAX_TOOL_FAILURES=3
LLM_SESSION_TTL_SEC=900

# Optional graph checkpoint database
# NOTEBOOKPILOT_CHECKPOINT_DB=C:\Users\Admin\.notebookpilot\checkpoints.sqlite3
```

Optional providers:

- `LLM_PROVIDER=gemini` uses the direct Gemini HTTP client and is the default.
- `LLM_PROVIDER=langchain` uses `langchain-google-genai` with the same tool and
  quota contract.
- `LLM_PROVIDER=codex` or `LLM_PROVIDER=openai` uses an OpenAI-compatible
  gateway configured with `CODEX_API_KEY`, `CODEX_MODEL`, and `CODEX_BASE_URL`.

## One-Time Installation

Run these commands from the project root.

### 1. Install Python runtime dependencies

```powershell
python -m pip install -r runtime\requirements.txt
```

The requirements include `requests`, `langchain-core`,
`langchain-google-genai`, and `langgraph`.

### 2. Enable automatic Python services

The Jupyter Server extension starts the notebook bridge on port `8765` and the
AI runtime on port `8766` in the background.

```powershell
python -m pip install -e server-extension
python -m jupyter server extension enable --py notebookpilot_server --user
```

Restart JupyterLab once after enabling the extension. No manual `server.py`
commands are needed during normal use.

### 3. Build and install the JupyterLab frontend bridge

```powershell
cd jupyterlab-bridge
npm install
npm run check-types
npm run build
python -m jupyter labextension install . --no-build
cd ..
```

Restart JupyterLab once after installing the frontend bridge. Confirm it is
enabled with:

```powershell
python -m jupyter labextension list
```

The output should include `notebookpilot-jupyterlab-bridge`.

### 4. Load the Chrome extension

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose this project folder.
5. Open JupyterLab at `http://localhost:8888/lab`.
6. Open a notebook ending in `.ipynb`.
7. Reload the extension after source changes, then refresh the JupyterLab tab.

The green `NP` toggle appears only inside an active notebook tab.

## Normal Usage

After the one-time installation:

1. Start JupyterLab normally.
2. Open a notebook.
3. Reload the Chrome extension only when extension source changes.
4. Open the `NP` panel and send a request.

The Jupyter Server extension starts the Python services automatically. If the
runtime was already running before a code update, restart JupyterLab or restart
the affected service once so it loads the new code.

## Supported Tools

| Tool | Purpose |
| --- | --- |
| `get_active_notebook` | Read the active notebook and normalized cells. |
| `list_cells` | List active cells without full source/output detail. |
| `read_cell` | Read one cell by stable `cellId` or index. |
| `read_cell_output` | Read one cell's outputs. |
| `find_cells` | Find cells by source text and optional type. |
| `insert_cell` | Insert a code or Markdown cell. |
| `edit_cell` | Replace a cell's source. |
| `delete_cell` | Delete a cell. |
| `run_cell` | Execute a cell and return its updated result. |
| `clear_cell_output` | Clear a cell's outputs. |
| `inspect_error` | Inspect execution errors from a cell. |
| `get_kernel_status` | Read kernel readiness and status. |

Cell IDs are preferred because indexes can change after insertion or deletion.
Mutation calls are kept ordered, and the frontend verifies that the active tab
and notebook have not changed before executing a request.

## Response Formatting

The runtime prompt uses explicit response schemas and few-shot examples.

For a single-cell read, the assistant returns a structure like:

````markdown
## Cell 0

**Type:** Code
**Purpose:** Loads the Iris dataset.
**Status:** Present; execution result not requested.

**Code:**
```python
from sklearn.datasets import load_iris
iris = load_iris()
```

**Key details:**
- Loads the Iris dataset.
````

For notebook analysis, the assistant uses `Summary`, `Cell Findings`, `Errors`,
and `Next Steps` sections when appropriate. Hidden chain-of-thought and Gemini
thought signatures are never shown in the UI; the panel only displays
`Thinking` and `Working` status indicators.

## Context Construction

The model receives:

1. A fixed system instruction and response contract.
2. Normalized notebook metadata and cells.
3. A compact recent conversation history.
4. The current user request.

Context behavior:

- Notebook context is authoritative for read-only questions.
- Source is limited to approximately `24,000` characters per cell.
- Outputs are compacted and limited to relevant output records.
- Overall context defaults to `3,500,000` characters.
- Large contexts are truncated at cell boundaries and include a truncation
  summary so the model knows which cells were omitted.
- Recent conversation history is limited to the latest relevant messages.

## Runtime APIs

The Python runtime listens on `http://127.0.0.1:8766`.

### Health

```text
GET /health
```

### Graph API

```text
POST /api/graph/start
POST /api/graph/continue
POST /api/graph/resume
POST /api/graph/start-stream
POST /api/graph/continue-stream
```

The Chrome extension uses the streaming start/continue routes. A graph response
contains either a final `text` response or a tool call plus `graphState`. The
next request sends the graph state and frontend `toolResults`.

Set `NOTEBOOKPILOT_CHECKPOINT_DB` to enable persisted `/api/graph/resume`
recovery after a runtime restart.

### Legacy API

The original routes remain available for compatibility:

```text
POST /api/chat/start
POST /api/chat/continue
POST /api/chat/start-stream
POST /api/chat/continue-stream
```

The extension uses the graph API first and falls back to the legacy streaming
API only when the graph start route returns `404` during a runtime rollout.

### Read-only notebook bridge

The Python bridge listens on `http://127.0.0.1:8765`.

```text
GET /health
GET /api/notebook?name=Untitled.ipynb
GET /api/context?name=Untitled.ipynb
GET /api/context?name=Untitled.ipynb&path=subfolder/Untitled.ipynb
```

If a filename is duplicated, the bridge returns `409` with candidates rather
than selecting an unsafe match. If the exact notebook is at the configured
Jupyter root, it is returned without recursively scanning the whole home
directory.

## Project Structure

```text
bridge/
  server.py                 Read-only local notebook HTTP bridge
  notebook_parser.py        Root discovery, path resolution, JSON context

runtime/
  server.py                 Gemini runtime HTTP/SSE API
  gemini_agent.py           Direct provider, prompt, ReAct session loop
  langchain_client.py       Optional LangChain Gemini adapter
  agent_graph.py            LangGraph-compatible agent boundary
  graph_state.py            Typed graph state and stable thread IDs
  workflow_graph.py         Dependency-aware notebook workflow stages
  tool_planner.py           Tool allowlist and batch validation
  quota_manager.py          RPM/RPD pacing and accounting
  checkpoint_store.py       Optional SQLite graph checkpoints
  tool_contracts.py         Model-visible notebook tool definitions

jupyterlab-bridge/
  src/index.ts              INotebookTracker frontend bridge
  src/tools.ts              TypeScript tool validation

server-extension/
  notebookpilot_server/     Jupyter Server automatic service launcher

service-worker.js            MV3 orchestration and frontend tool routing
inpage-panel.js              Injected panel, conversations, Markdown UI
tab-identity.js              JupyterLab target identification
manifest.json                Chrome Manifest V3 configuration
scripts/                     Packaging, smoke tests, audits, validation
tests/                       Python unit and integration tests
```

## Development and Testing

Run the complete Python test suite:

```powershell
python -m unittest discover -s tests -v
```

Check the JupyterLab bridge:

```powershell
cd jupyterlab-bridge
npm run check-types
npm run build
cd ..
```

Run syntax, packaging, and release checks:

```powershell
node --check service-worker.js
node --check inpage-panel.js
python scripts/package_extension.py
python scripts/release_audit.py
git diff --check
```

Run the local service smoke test:

```powershell
python scripts/live_smoke_test.py --notebook Untitled.ipynb
```

Package the Chrome extension:

```powershell
python scripts/package_extension.py
```

The generated archive is written to `dist/`.

## Troubleshooting

### Panel does not appear

- Confirm the URL starts with `http://localhost:8888/lab`.
- Open a notebook tab ending in `.ipynb`.
- Reload the extension and refresh the JupyterLab tab.
- Inspect the extension service worker console from `chrome://extensions`.

### `Not found` or context timeout

- Confirm the bridge health endpoint returns `ok: true`.
- Confirm `JUPYTER_ROOT_DIR` points to the root shown by
  `python -m jupyter server list`.
- Restart JupyterLab once after installing or updating the server extension.
- Test `http://127.0.0.1:8765/api/context?name=YourNotebook.ipynb`.

### Cell tools do not work

- Confirm `notebookpilot-jupyterlab-bridge` appears in
  `python -m jupyter labextension list`.
- Refresh JupyterLab after installing the frontend bridge.
- Ensure the active dock tab label exactly matches the notebook filename.

### Gemini returns a 400 tool-call error

- Restart the runtime after updating Python code.
- Confirm the runtime is using the current `runtime/gemini_agent.py`.
- Do not manually remove or transform Gemini `thoughtSignature` fields.

### API key errors

- Put `GEMINI_API_KEY` in the local `.env` file.
- Keep `.env` out of the Chrome extension archive and Git.
- Restart the runtime after changing environment variables.

## Security and Privacy

- The extension is restricted to the configured local JupyterLab and local
  service origins.
- API keys and Jupyter tokens stay outside the extension bundle.
- Tool calls are validated against an explicit allowlist.
- The active tab and notebook identity are rechecked before frontend tools run.
- Notebook mutations happen through the live JupyterLab model.
- The Python bridge is read-only with path traversal protection.
- Checkpoint persistence excludes callbacks and transient UI objects.
- The UI does not display hidden model reasoning or thought signatures.

This project is intended for local development and testing. Review generated
code and notebook mutations before using it with important data.

## Current Limitations

- The current target is Chrome on local JupyterLab at `localhost:8888`.
- The automatic service launcher is currently implemented as a Jupyter Server
  extension and is intended for the local Windows development setup.
- The frontend bridge must be installed once into the active JupyterLab
  environment.
- LangChain and LangGraph are installed and supported, but direct Gemini remains
  the default provider unless `LLM_PROVIDER=langchain` is set.
- The current quota counters are process-local; they are not a shared account
  quota across multiple machines or API keys.
- The extension is autonomous by design and does not require confirmation before
  notebook mutations.

## License

No license file is currently included in this repository.
