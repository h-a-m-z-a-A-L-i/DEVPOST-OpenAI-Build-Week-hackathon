# NotebookPilot Gemini Runtime

This local service keeps the Gemini API key outside Chrome and manages the agent's tool-calling session.

## Start

```powershell
cd jupyter-chrome-agent/runtime
python server.py
```

The runtime listens on `http://127.0.0.1:8766`.

## Endpoints

- `GET /health`
- `POST /api/chat/start`
- `POST /api/chat/continue`

The start endpoint returns either a final response or a pending Gemini function call. The extension executes the tool through the JupyterLab frontend bridge, then sends the structured result to `/api/chat/continue`.
