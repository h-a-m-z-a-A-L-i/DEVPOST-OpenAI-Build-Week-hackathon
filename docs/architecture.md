# NotebookPilot Architecture

## Scope

NotebookPilot is a local-first autonomous assistant for JupyterLab 4.6.1 running at `http://localhost:8888/lab`.

The system has four runtime components:

```text
Chrome in-page panel
        ↓
Chrome extension runtime
        ↓
Local Python bridge ←→ Gemini runtime
        ↓
JupyterLab frontend bridge
        ↓
Live notebook model and kernel
```

## Component Ownership

### Chrome extension

The Manifest V3 extension owns the user interface and browser integration.

Responsibilities:

- Inject the floating panel only into the configured JupyterLab host.
- Watch JupyterLab's dock tab bar for the active notebook.
- Track the Chrome `tabId` and active notebook name.
- Send user requests and tool requests through the protocol.
- Render chat messages, tool activity, progress, errors, and results.
- Keep conversation state local to the extension.

The extension never stores Gemini API keys or Jupyter tokens.

### Local Python bridge

The local bridge owns read-only filesystem context.

Responsibilities:

- Discover the running Jupyter server and root directory.
- Resolve the active notebook name to a local path.
- Reject ambiguous notebook-name matches.
- Parse `.ipynb` JSON.
- Return normalized cells, outputs, execution counts, and errors.

The local bridge must not write notebook files. Notebook mutations belong to the JupyterLab frontend bridge.

### JupyterLab frontend bridge

The frontend bridge is a JupyterLab plugin running in the page.

Responsibilities:

- Use `INotebookTracker` to identify the active `NotebookPanel`.
- Use `panel.context.path` as the authoritative notebook path.
- Use `panel.content.model` as the authoritative live notebook state.
- Execute insert, edit, delete, and run operations through JupyterLab APIs.
- Return structured state and execution results.

The frontend model is authoritative for all writes. The local file parser is only a context and fallback reader.

### Gemini runtime

The Gemini runtime owns reasoning and tool selection.

Responsibilities:

- Receive normalized notebook context.
- Select only declared tools.
- Consume structured tool results.
- Continue the autonomous workflow until completion or a safety limit.

The Gemini API key remains in the local runtime environment and never enters Chrome extension code.

## Communication Boundaries

### Chrome to local bridge

The extension calls the local bridge over `http://127.0.0.1:8765`.

The initial bridge endpoint is:

```text
GET /api/notebook?name=Untitled.ipynb
```

### Chrome page to JupyterLab bridge

The content script and JupyterLab plugin communicate through `window.postMessage()` request/response envelopes. Every request includes a unique `requestId` and an expected target origin.

### Runtime to Gemini

The local runtime sends Gemini the user request, normalized notebook context, tool declarations, and previous tool results. Calls are sequential and rate-limited.

## Authority Rules

1. The Chrome tab bar identifies which notebook the user is viewing.
2. `INotebookTracker.currentWidget` identifies the active notebook model.
3. `panel.context.path` is the authoritative exact notebook path.
4. The JupyterLab model is authoritative after a frontend mutation.
5. The local `.ipynb` parser is read-only and must not overwrite frontend state.
6. The URL is only a host and page-scope check; it is not notebook identity.

## Secret Boundaries

- `.env` stays local and ignored by Git.
- Gemini credentials remain in the local runtime.
- Jupyter tokens remain in the local runtime or active browser session.
- Query strings containing tokens are never persisted as notebook identity.
- Tool responses must not include secrets, environment variables, or arbitrary filesystem contents.

## Phase 1 Exit Criteria

- Component ownership is documented.
- Write authority is assigned to the JupyterLab frontend model.
- Read authority is assigned to the local bridge.
- Chrome/JupyterLab communication uses request IDs.
- Notebook identity rules are explicit.
- Secret boundaries are explicit.
