# JupyterLab Frontend Bridge

## Purpose

The frontend bridge runs inside JupyterLab and is the only component allowed to mutate or execute the live notebook model.

## Active Model

The bridge uses `INotebookTracker.currentWidget`:

```text
currentWidget.context.path  → authoritative notebook path
currentWidget.content.model → live notebook model
currentWidget.content.widgets → live notebook cells
```

## Browser Protocol

The Chrome content script forwards requests to the page using `window.postMessage()`:

```text
Chrome extension → content script → window.postMessage → JupyterLab bridge
```

The bridge responds with a message containing the same `requestId`. The content script forwards the response back to the extension runtime.

## Tools

The initial bridge implements:

```text
get_active_notebook
list_cells
read_cell
read_cell_output
insert_cell
edit_cell
delete_cell
run_cell
```

## Validation

Before executing a request, the bridge validates:

- Message source and origin.
- Request ID.
- Chrome tab ID format.
- Active notebook name.
- Active notebook path.
- Tool name.
- Cell index.
- Cell source size.

## Current Limitation

The package source and browser relay are implemented, but the JupyterLab package must be installed into the local JupyterLab environment before the live frontend tools become available. Gemini orchestration is not part of this phase.
