# Notebook Capability Probe

This extension exposes notebook cell operations from the VS Code Command Palette:

* `Notebook Capability Probe: Notebook: Run Cell`
* `Notebook Capability Probe: Notebook: Insert Cell`
* `Notebook Capability Probe: Notebook: Edit Cell`
* `Notebook Capability Probe: Notebook: Delete Cell`
* `Notebook Capability Probe: Notebook: Action Tool`

It also contributes the `@notebook` chat participant. Use it in VS Code Chat with requests such as:

* `@notebook inspect the notebook and summarize cells with errors`
* `@notebook run cell 3 and tell me what the output means`
* `@notebook insert a markdown cell after cell 2 with a short explanation`
* `@notebook fix cell 4 using its current output, then run it again`

## How to test

### One-time setup

1. Install the recommended VS Code extensions for Python and Jupyter.
2. In this project, open `notebook-capability-probe` in VS Code.
3. Open the integrated terminal and run `npm install`.
4. Press `F5` and choose the Extension Development Host launch option.

### Test against a real notebook

1. In the Extension Development Host, open a copy of `Test notebook/pakistan-housing.ipynb`.
2. Select a code cell and run `Notebook Capability Probe: Notebook: Run Cell`.
3. Select a cell, run `Notebook Capability Probe: Notebook: Insert Cell`, enter test code such as `print("inserted")`, and verify that a new cell appears after the selected cell.
4. Select that new cell, run `Notebook Capability Probe: Notebook: Edit Cell`, change the content, and verify the cell text changes.
5. Select the edited cell, run `Notebook Capability Probe: Notebook: Delete Cell`, and verify it is removed. Use `Ctrl+Z` if you want to restore it.
6. Run `Notebook Capability Probe: Notebook: Action Tool` to test the same operations through one action picker.
7. Open VS Code Chat, type `@notebook`, and give a plain-language notebook task.

If no cell is selected, edit, delete, and run show a cell picker. Insert appends to the notebook. To test execution, select a Python kernel when VS Code prompts for one.

For a non-destructive test, always copy the notebook first because cell edits are saved by the notebook editor.

### Validate the extension code

From `notebook-capability-probe`, run:

```text
npm run check-types
npm run lint
npm test
```

## Behavior

* Run executes the selected cell.
* Insert adds a new cell after the selected cell, or appends to the end when there is no selected cell.
* Edit replaces the selected cell contents.
* Delete removes the selected cell.
* The generic action command can target any cell through the cell picker.
* The `@notebook` agent reads cell source, execution status, and text/JSON outputs before deciding what to do.
* Agent actions are limited to the active notebook and are capped at 12 tool calls per request.
* Agent mutations are verified by reading the notebook again; invalid indexes and tool failures stop the run safely.

## Notes

* The commands are intended for local testing inside VS Code.
* The notebook must be opened in the Extension Development Host for `F5` testing.
* Run requires a notebook kernel; insert, edit, and delete do not.
* The agent uses a VS Code-provided language model, such as GitHub Copilot Chat. If no model is available, VS Code Chat reports that the participant cannot run.
