# NotebookPilot Demo Script

## Setup

1. Start local JupyterLab and open a prepared data-science notebook.
2. Reload the unpacked NotebookPilot extension.
3. Show the detected active notebook and the floating panel.

## Demonstration flow

1. Ask NotebookPilot to summarize the notebook structure.
2. Ask it to find cells containing the feature-engineering step.
3. Ask it to inspect the error cell and explain the traceback.
4. Ask it to insert a small diagnostic cell.
5. Ask it to run the diagnostic cell and show the output.
6. Ask it to edit or clear the cell output.
7. Switch notebooks and show target tracking without refreshing the page.

## Evidence to capture

- Active notebook detection and target path.
- Tool activity states during Gemini reasoning.
- Cell changes and execution output in JupyterLab.
- Error recovery behavior.
- Validation metrics from `scripts/validate_notebooks.py`.

Do not record API keys, Jupyter tokens, local filesystem credentials, or private notebook data.
