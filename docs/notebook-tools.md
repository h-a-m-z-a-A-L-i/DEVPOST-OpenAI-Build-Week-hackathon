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
| `insert_cell` | Insert a code or markdown cell. | Yes |
| `edit_cell` | Replace one cell's source. | Yes |
| `delete_cell` | Delete one cell. | Yes |
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

## Result Rules

- Read tools return structured notebook or cell snapshots.
- Mutation tools return the updated cell or notebook snapshot.
- Run returns execution state and outputs.
- Invalid requests return a stable error code and do not mutate the notebook.
- The frontend model remains the write authority.
