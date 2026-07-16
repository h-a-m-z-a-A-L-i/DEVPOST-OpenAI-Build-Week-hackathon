# NotebookPilot Jupyter Server Extension

This extension automatically starts the local notebook bridge and Gemini runtime when Jupyter Server starts.

## One-time installation

From the repository root:

```powershell
python -m pip install -e jupyter-chrome-agent/server-extension
python -m jupyter server extension enable --py notebookpilot_server
```

If the enable command is unavailable in an older Jupyter installation, create
`%USERPROFILE%\.jupyter\jupyter_server_config.d\notebookpilot_server.json` with
the following contents, then restart JupyterLab:

```json
{
  "ServerApp": {
    "jpserver_extensions": {
      "notebookpilot_server": true
    }
  }
}
```

Restart JupyterLab after enabling it. The extension starts:

- Notebook bridge on `127.0.0.1:8765`
- Gemini runtime on `127.0.0.1:8766`

After this setup, no service commands are needed when JupyterLab starts.

Set `NOTEBOOKPILOT_ROOT` only if the extension is installed outside this repository. By default it resolves the sibling `bridge` and `runtime` directories in this project.
