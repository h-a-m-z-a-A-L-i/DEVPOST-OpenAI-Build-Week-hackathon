# Local Notebook Bridge

This service reads notebooks from the active Jupyter server's root directory and returns normalized JSON for the agent. The Chrome content script supplies the active notebook name from JupyterLab's dock tab bar; the URL is not used to identify the notebook.

## Start

From the `jupyter-chrome-agent/bridge` directory:

```powershell
python server.py
```

The bridge listens on `http://127.0.0.1:8765`.

## Test

```text
http://127.0.0.1:8765/health
http://127.0.0.1:8765/api/notebook?name=Untitled.ipynb
http://127.0.0.1:8765/api/context?name=Untitled.ipynb
```

The notebook name is resolved below the root reported by `python -m jupyter server list`. If multiple notebooks have the same name, the bridge returns `409` with candidate paths instead of choosing incorrectly.

For a stable local setup, set `JUPYTER_ROOT_DIR` in `.env` to the root shown by `python -m jupyter server list`, for example `C:\Users\Admin`. This avoids delays caused by restricted Jupyter runtime metadata permissions.

The Chrome extension uses this endpoint to fetch the normalized notebook context before the Gemini tool layer is added.
