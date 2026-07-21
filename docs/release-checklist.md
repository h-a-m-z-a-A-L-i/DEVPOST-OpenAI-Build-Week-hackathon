# NotebookPilot Release Checklist

## Automated checks

- [ ] `python -m unittest discover -s jupyter-chrome-agent/tests -v`
- [ ] Python compilation passes for bridge, runtime, and server extension.
- [ ] `node --check` passes for extension scripts.
- [ ] JupyterLab bridge `npm run check-types` and `npm run build` pass.
- [ ] `python jupyter-chrome-agent/scripts/validate_notebooks.py "Test notebook" --json` passes.
- [ ] `python jupyter-chrome-agent/scripts/package_extension.py` creates the archive.
- [ ] The archive contains no `.env`, token, API key, `node_modules`, or generated logs.

## Manual smoke test

- [ ] Start JupyterLab at `http://localhost:8888/lab`.
- [ ] Confirm the server extension starts ports `8765` and `8766`.
- [ ] Reload the unpacked Chrome extension and open a `.ipynb` notebook.
- [ ] Confirm the floating panel appears only for notebook tabs.
- [ ] Ask the agent to inspect cells and outputs.
- [ ] Test insert, edit, delete, search, clear output, inspect error, and run-cell tools.
- [ ] Confirm kernel-busy and failed-cell errors are visible and recoverable.
- [ ] Confirm changes appear in JupyterLab without a page refresh.

## Submission evidence

- [ ] Capture architecture and workflow screenshots.
- [ ] Record execution traces and validation metrics.
- [ ] Record the final demonstration video.
- [ ] Finalize Devpost description, installation steps, and limitations.
- [ ] Push only focused commits to `main`.
