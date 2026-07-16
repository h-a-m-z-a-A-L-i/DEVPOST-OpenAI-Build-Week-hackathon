# Jupyter Notebook Agent

Base Chrome Manifest V3 extension for a local JupyterLab notebook agent.

## Current scope

- Detects open notebook tabs inside `http://localhost:8888/lab`.
- Tracks the active Chrome tab and notebook route.
- Extracts the active notebook name from JupyterLab's dock tab bar.
- Provides a draggable in-page toggle panel inside the JupyterLab tab.
- Keeps the Chrome side panel available as a secondary shell.
- Persists chat history per Chrome tab and notebook target.
- Stores only validated extension settings through the service worker.
- Resolves the active notebook name to a local path through the bridge.

Gemini and notebook mutation tools are intentionally not included yet. API keys and Jupyter tokens must remain outside the extension bundle.

## Load locally

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select this `jupyter-chrome-agent` folder.
5. Open JupyterLab at `http://localhost:8888/lab`.
6. Open a `.ipynb` notebook and refresh the notebook page once so the content script loads.
7. Click the green `NP` toggle at the bottom-right of the notebook page.

After changing extension files, click **Reload** on `chrome://extensions`, then refresh the JupyterLab tab.

## Start local services

Set `JUPYTER_ROOT_DIR` in the root `.env` to the directory printed by `python -m jupyter server list`, then start both services in separate terminals:

```powershell
python jupyter-chrome-agent/bridge/server.py
python jupyter-chrome-agent/runtime/server.py
```

The panel reports a timeout or bridge error if either service is unavailable.

## Target identity

The URL is used only to confirm that the page is the configured JupyterLab host. Notebook identity comes from the active `.lm-TabBar-tab` and `.lm-TabBar-tabLabel` elements in `#jp-main-dock-panel`. The extension stores the current target as `tabId + origin + notebookName`.
