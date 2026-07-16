# Validation Workflow

## Offline checks

Run from the repository root:

```powershell
python -m unittest discover -s jupyter-chrome-agent/tests -v
python -m py_compile jupyter-chrome-agent/bridge/*.py jupyter-chrome-agent/runtime/*.py
node --check jupyter-chrome-agent/service-worker.js
node --check jupyter-chrome-agent/inpage-panel.js
```

Run the JupyterLab bridge checks:

```powershell
cd jupyter-chrome-agent/jupyterlab-bridge
npm run check-types
npm run build
```

These checks do not call Gemini and do not modify the test notebook.

## Live smoke test

1. Start JupyterLab at `http://localhost:8888/lab`.
2. Start the local notebook bridge on port `8765`.
3. Start the Gemini runtime on port `8766`.
4. Reload the unpacked Chrome extension.
5. Open a notebook and confirm the floating panel identifies it.
6. Ask the agent to list cells.
7. Ask it to insert, edit, and run a small cell.
8. Confirm outputs appear without refreshing JupyterLab.

Live testing consumes Gemini quota and should be run only after the offline checks pass.
