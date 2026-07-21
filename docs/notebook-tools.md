# Notebook Tool Contracts

The frontend bridge owns the initial notebook tools. Tool definitions are maintained in:

```text
jupyter-chrome-agent/jupyterlab-bridge/src/tools.ts
```

The same definitions are intended to be adapted to Gemini function declarations later.

## Tools

| Tool | Purpose | Mutation |
| --- | --- | --- |
| `get_active_notebook` | Read active notebook metadata and cells. | No |
| `list_cells` | List active notebook cell summaries. | No |
| `read_cell` | Read one cell source and outputs. | No |
| `read_cell_output` | Read one cell's outputs. | No |
| `find_cells` | Find cells by source text and optional type. | No |
| `inspect_error` | Return error outputs for one cell. | No |
| `get_kernel_status` | Read kernel readiness and busy status. | No |
| `insert_cell` | Insert a code or markdown cell. | Yes |
| `edit_cell` | Replace one cell's source. | Yes |
| `delete_cell` | Delete one cell. | Yes |
| `clear_cell_output` | Clear one cell's outputs. | Yes |
| `run_cell` | Execute one cell and return its state. | Yes |

## Validation

The bridge validates:

- Tool name.
- Required arguments.
- Integer cell indexes.
- Insert indexes from `0` through `cellCount`.
- Existing-cell indexes for read, edit, delete, and run.
- Non-empty source for insert and edit.
- Source length limits.
- Active notebook identity before execution.
- Stable `cellId` resolution when available, with index compatibility.
- Kernel-busy checks before execution.
- Post-mutation state checks for source, cell count, cell identity, and outputs.

## Result Rules

- Read tools return structured notebook or cell snapshots.
- Mutation tools return the updated cell or notebook snapshot.
- Run returns execution state and outputs.
- Invalid requests return a stable error code and do not mutate the notebook.
- The frontend model remains the write authority.
