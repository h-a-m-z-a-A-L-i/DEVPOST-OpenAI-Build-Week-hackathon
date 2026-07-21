# Final Integration Sign-Off

NotebookPilot's automated release gate covers:

- Manifest V3 metadata and required extension files.
- Chrome archive contents and secret exclusion.
- Python parser, runtime, agent, and workflow tests.
- JupyterLab bridge type checking and build output.
- Demo notebook context size, cell counts, error cells, and parse timing.

Run the final audit from the repository root:

```powershell
python jupyter-chrome-agent/scripts/package_extension.py
python jupyter-chrome-agent/scripts/release_audit.py
python -m unittest discover -s jupyter-chrome-agent/tests -v
```

After starting JupyterLab, probe the local services with:

```powershell
python jupyter-chrome-agent/scripts/live_smoke_test.py --notebook Untitled.ipynb
python jupyter-chrome-agent/scripts/live_smoke_test.py --notebook Untitled.ipynb --agent
```

The `--agent` check consumes one model request and should only be used when
outbound model access is available.

The remaining release gate is manual browser validation: start JupyterLab,
reload the unpacked extension, exercise the tools in a real notebook, and
capture the demo evidence. The prepared demo notebook intentionally contains a
recorded error cell so error inspection and recovery can be demonstrated.

Never commit `.env`, Jupyter tokens, model keys, generated logs, or private
notebook output.
