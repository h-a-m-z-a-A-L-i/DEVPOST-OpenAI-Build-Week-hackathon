# Jupyter Notebook Agent

Base Chrome Manifest V3 extension for a local JupyterLab notebook agent.

## Current scope

- Detects open notebook tabs inside `http://localhost:8888/lab`.
- Tracks the active Chrome tab and notebook route.
- Extracts the active notebook name from JupyterLab's dock tab bar.
- Provides a draggable in-page toggle panel inside the JupyterLab tab.
- Injects the assistant UI directly into the active JupyterLab page.
- Persists chat history per Chrome tab and notebook target.
- Stores only validated extension settings through the service worker.
- Resolves the active notebook name to a local path through the bridge.
- Provides autonomous read, insert, edit, delete, search, execution, output, error, and kernel-status tools.
- Runs the Gemini agent locally and supports an optional OpenAI/Codex-compatible provider.

API keys and Jupyter tokens remain outside the extension bundle. The Chrome package contains no secrets.

## Load locally

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select this `jupyter-chrome-agent` folder.
5. Open JupyterLab at `http://localhost:8888/lab`.
6. Open a `.ipynb` notebook.
7. Click the green `NP` toggle at the bottom-right of the notebook page.

After changing extension files, click **Reload** on `chrome://extensions`, then refresh the JupyterLab tab.

## Start local services

Set `JUPYTER_ROOT_DIR` in the root `.env` to the directory printed by `python -m jupyter server list`.

```powershell
python -m pip install -e jupyter-chrome-agent/server-extension
python -m jupyter server extension enable --py notebookpilot_server
```

After restarting JupyterLab, the bridge and Gemini runtime start automatically.
Reload the unpacked extension after source changes. No bridge or runtime command is required during normal use.

## Package

From the repository root:

```powershell
python jupyter-chrome-agent/scripts/package_extension.py
```

The generated archive is written under `dist/` and contains only the Chrome
extension files.

## Target identity

The URL is used only to confirm that the page is the configured JupyterLab host. Notebook identity comes from the active `.lm-TabBar-tab` and `.lm-TabBar-tabLabel` elements in `#jp-main-dock-panel`. The extension stores the current target as `tabId + origin + notebookName`.
