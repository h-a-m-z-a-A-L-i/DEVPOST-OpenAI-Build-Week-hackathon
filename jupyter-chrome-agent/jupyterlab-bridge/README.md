# NotebookPilot JupyterLab Frontend Bridge

This JupyterLab 4 frontend plugin owns live notebook operations. It uses `INotebookTracker` to access the active `NotebookPanel` and listens for validated `window.postMessage()` requests from the Chrome content script.

## Supported tools

```text
get_active_notebook
list_cells
read_cell
read_cell_output
find_cells
inspect_error
get_kernel_status
insert_cell
edit_cell
delete_cell
clear_cell_output
run_cell
```

Writes and execution use the JupyterLab frontend model. The local Python bridge remains read-only.

## Message requirements

Requests must use `type: "notebook-tool-request"`, `source: "notebookpilot-extension"`, the current JupyterLab origin, a numeric Chrome `tabId`, the active notebook name, a unique `requestId`, and a declared tool.

The plugin returns `notebook-tool-result` messages with the same `requestId`.

## Development

Install the JupyterLab 4.6.1 development dependencies, then run:

```powershell
npm install
npm run build
npm run check-types
```

The package declares itself as a JupyterLab frontend extension. After building,
install it once with:

```powershell
npm install
npm run build
python -m jupyter labextension install . --no-build
```

JupyterLab 4.6.1 reports the extension as enabled after installation. It then
loads automatically whenever JupyterLab starts.
