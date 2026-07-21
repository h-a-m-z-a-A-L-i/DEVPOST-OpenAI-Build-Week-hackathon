# NotebookPilot Validation

Phase 5 uses two layers of validation:

- Automated parser and agent tests run without a browser or network.
- The notebook validator reports cell counts, error cells, context size, truncation, and parse time for real `.ipynb` files.

Run the automated suite:

```powershell
cd jupyter-chrome-agent
python -m unittest discover -s tests -v
```

Validate a demonstration notebook or directory:

```powershell
python scripts/validate_notebooks.py "..\Test notebook" --json
```

The workflow fixture covers exploratory analysis, feature engineering, model
training, visualization, and a visible `NameError` recovery case. The runner
does not execute notebook code; kernel execution must be tested separately in
JupyterLab using the frontend bridge.

Additional offline checks from the repository root:

```powershell
python -m py_compile jupyter-chrome-agent/bridge/*.py jupyter-chrome-agent/runtime/*.py
node --check jupyter-chrome-agent/service-worker.js
node --check jupyter-chrome-agent/inpage-panel.js
```

For live testing:

1. Start JupyterLab at `http://localhost:8888/lab`.
2. Reload the unpacked Chrome extension.
3. Open a notebook and confirm the floating panel identifies it.
4. Ask the agent to list cells, inspect errors, and run a small cell.
5. Confirm outputs appear without refreshing JupyterLab.

Live testing consumes Gemini quota and should be run only after offline checks pass.
