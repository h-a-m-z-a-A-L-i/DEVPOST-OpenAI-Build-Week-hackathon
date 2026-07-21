# NotebookPilot Release Baseline

## Frozen Version

- Extension version: `0.3.0`
- Baseline commit: `d3355a3`
- Baseline tag: `notebookpilot-v0.3.0`
- Primary runtime: Gemini `gemini-3.1-flash-lite`
- Chrome target: local JupyterLab at `http://localhost:8888/lab`

## Validation

- Python unit tests: `19` passed
- Python syntax checks: passed
- Chrome JavaScript syntax checks: passed
- Extension packaging: passed
- Release audit: passed

## Rollback

To inspect or restore the frozen baseline:

```powershell
git checkout notebookpilot-v0.3.0
```

Future LangChain or LangGraph work must preserve the existing Chrome extension, JupyterLab bridge, local parser, tool contracts, and runtime API behavior until migration validation is complete.
