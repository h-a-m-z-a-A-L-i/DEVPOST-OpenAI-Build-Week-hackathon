# NotebookPilot Message Protocol

## Request Envelope

All bridge requests use this shape:

```json
{
  "type": "notebook-tool-request",
  "requestId": "np-unique-request-id",
  "origin": "http://localhost:8888",
  "tabId": 123,
  "notebookName": "Untitled.ipynb",
  "tool": "read_cell",
  "arguments": {
    "index": 2
  }
}
```

Required fields:

- `type`: protocol message type.
- `requestId`: unique ID used to match the response.
- `origin`: expected JupyterLab origin.
- `tabId`: Chrome tab target.
- `notebookName`: notebook selected by the JupyterLab dock tab watcher.
- `tool`: declared operation name.
- `arguments`: validated tool arguments.

## Success Response

```json
{
  "type": "notebook-tool-result",
  "requestId": "np-unique-request-id",
  "ok": true,
  "result": {
    "index": 2,
    "type": "code",
    "source": "print('hello')",
    "outputs": []
  }
}
```

## Error Response

```json
{
  "type": "notebook-tool-result",
  "requestId": "np-unique-request-id",
  "ok": false,
  "error": {
    "code": "INVALID_CELL_INDEX",
    "message": "Cell index 9 is outside the active notebook.",
    "retryable": false
  }
}
```

## Standard Error Codes

| Code | Meaning | Retryable |
| --- | --- | --- |
| `INVALID_MESSAGE` | Envelope is malformed. | No |
| `ORIGIN_REJECTED` | Message came from an unexpected origin. | No |
| `TAB_MISMATCH` | Request targets a different Chrome tab. | No |
| `NO_ACTIVE_NOTEBOOK` | No active notebook model exists. | No |
| `NOTEBOOK_MISMATCH` | Requested notebook differs from the active model. | No |
| `INVALID_TOOL` | Tool is not declared or enabled. | No |
| `INVALID_ARGUMENT` | Tool arguments failed validation. | No |
| `INVALID_CELL_INDEX` | Cell index is outside the notebook. | No |
| `STALE_NOTEBOOK` | Notebook state changed before the operation. | Yes |
| `KERNEL_BUSY` | Kernel cannot accept execution yet. | Yes |
| `EXECUTION_TIMEOUT` | Cell execution exceeded the timeout. | Yes |
| `EXECUTION_ERROR` | Kernel returned an error. | No |
| `BRIDGE_UNAVAILABLE` | Required bridge is not reachable. | Yes |
| `AMBIGUOUS_NOTEBOOK` | Local name maps to multiple files. | No |

## Tool Contract

Initial tool names:

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

Mutation requests must include the active notebook identity and an expected revision when available. The frontend bridge must verify the identity immediately before applying the operation.

## Identity Contract

The Chrome content script observes:

```css
#jp-main-dock-panel .lm-DockPanel-tabBar
```

It selects the active tab using `.lm-mod-current` or `aria-selected="true"` and reads the label from `.lm-TabBar-tabLabel`.

The browser target is represented as:

```json
{
  "tabId": 123,
  "origin": "http://localhost:8888",
  "notebookName": "Untitled.ipynb"
}
```

The notebook name is a discovery hint. The JupyterLab frontend bridge must resolve the authoritative path through `INotebookTracker.currentWidget.context.path` before a write.

The URL may be checked for page scope, but it must not be used to infer notebook identity.

## Request Lifecycle

1. Generate a cryptographically random `requestId`.
2. Capture the active tab and notebook identity.
3. Validate the tool and arguments locally.
4. Send the request to the frontend bridge.
5. Match the response by `requestId`.
6. Reject responses with the wrong origin, tab, or notebook.
7. Return the structured result to the Gemini runtime.
8. Record duration, result status, and error code without recording secrets.

## Timeouts and Limits

- Every request has a finite timeout.
- Kernel execution has a separate execution timeout.
- The agent has a maximum number of rounds.
- Source and output payloads have maximum sizes.
- Gemini requests are sequential and respect the configured 15 requests/minute limit.
- A timeout may be retried only when the error is marked retryable.
