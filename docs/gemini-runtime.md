# Gemini Runtime

The Gemini runtime is a local Python service. Chrome never receives `GEMINI_API_KEY`.

## Agent lifecycle

1. Chrome sends the user prompt and normalized notebook context to `/api/chat/start-stream`.
2. Gemini returns either text or a function call.
3. Chrome forwards the function call to the JupyterLab frontend bridge.
4. Chrome sends the structured tool result to `/api/chat/continue-stream`.
5. The runtime resumes the same session until Gemini returns final text.

## Limits

- Model comes from `GEMINI_MODEL`.
- The runtime uses a 2.5-second minimum request interval, staying safely below the 30 RPM limit.
- The runtime enforces a process-local 1,500 RPD budget from `GEMINI_RPD`.
- Output size defaults to 65,536 tokens and is capped by `GEMINI_MAX_OUTPUT_TOKENS`.
- Notebook context supports an approximately 3.5-million-character budget from `LLM_CONTEXT_MAX_CHARS`.
- Agent rounds come from `LLM_REACT_MAX_ROUNDS`.
- Independent tool calls can be batched; dependent mutations remain sequential.
- Notebook context is compressed with a cell-count summary before prompting.
- The last bounded conversation messages are included for continuity.
- Sessions expire automatically and repeated tool failures stop the agent safely.

## Security

- API keys load only from local `.env`.
- Runtime binds to `127.0.0.1`.
- Tool declarations are fixed server-side.
- Tool results are supplied by the frontend bridge.
