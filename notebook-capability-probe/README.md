# notebook-capability-probe

This extension exposes basic notebook actions you can test manually from the Command Palette:

* `Notebook Capability Probe: Notebook: Run Cell`
* `Notebook Capability Probe: Notebook: Insert Cell`
* `Notebook Capability Probe: Notebook: Edit Cell`
* `Notebook Capability Probe: Notebook: Delete Cell`
* `Notebook Capability Probe: Notebook: Action Tool`

## How to test

1. Open any notebook file such as an `.ipynb` file.
2. Put the cursor in a cell or focus the notebook editor.
3. Run one of the commands above from the Command Palette.
4. For insert and edit, follow the input prompts.

## Behavior

* Run executes the active cell.
* Insert adds a new cell after the active cell, or appends to the end when there is no active cell.
* Edit replaces the current cell contents.
* Delete removes the current cell.

## Notes

* The commands are intended for local testing inside VS Code.
* The generic action command lets you choose the operation at runtime.
