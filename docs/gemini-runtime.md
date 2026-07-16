# Gemini Runtime

The Gemini runtime is a local Python service. Chrome never receives `GEMINI_API_KEY`.

## Agent lifecycle

1. Chrome sends the user prompt and normalized notebook context to `/api/chat/start`.
2. Gemini returns either text or a function call.
3. Chrome forwards the function call to the JupyterLab frontend bridge.
4. Chrome sends the structured tool result to `/api/chat/continue`.
5. The runtime resumes the same session until Gemini returns final text.

## Limits

- Model comes from `GEMINI_MODEL`.
- Minimum request spacing comes from `GEMINI_REACT_MIN_INTERVAL_SEC`.
- Output size comes from `GEMINI_MAX_OUTPUT_TOKENS`.
- Agent rounds come from `LLM_REACT_MAX_ROUNDS`.
- The runtime performs sequential calls.

## Security

- API keys load only from local `.env`.
- Runtime binds to `127.0.0.1`.
- Tool declarations are fixed server-side.
- Tool results are supplied by the frontend bridge.
