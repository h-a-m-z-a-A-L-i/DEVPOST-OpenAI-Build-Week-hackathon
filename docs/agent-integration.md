# Agent Integration

The floating panel now connects to the local Gemini runtime through the service worker.

## Request flow

```text
Panel prompt
  ↓
Service worker /api/chat/start
  ↓
Gemini function call
  ↓
Service worker → content script → JupyterLab bridge
  ↓
Tool result
  ↓
Service worker /api/chat/continue
  ↓
Final response in panel
```

The service worker continues the loop until Gemini returns text or the maximum agent round limit is reached.

The floating panel receives status events for `thinking`, `tool_call`, `complete`, and `error` states.

## Local services

Start both services before testing:

```powershell
cd jupyter-chrome-agent/bridge
python server.py
```

```powershell
cd jupyter-chrome-agent/runtime
python server.py
```

The bridge uses port `8765`; the Gemini runtime uses port `8766`.
