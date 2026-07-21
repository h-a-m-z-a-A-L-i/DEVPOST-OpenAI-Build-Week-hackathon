# Notebook Context Contract

## Context Endpoint

The Chrome extension requests normalized LLM context from the local bridge:

```text
GET http://127.0.0.1:8765/api/context?name=Untitled.ipynb
```

The existing `/api/notebook` endpoint remains available for direct notebook parsing. `/api/context` applies context limits and metadata intended for model input.

## Normalized Cell Shape

```json
{
  "index": 0,
  "type": "code",
  "language": "python",
  "source": "print('hello')",
  "executionCount": 1,
  "outputs": []
}
```

## Context Limits

- Cell source is limited to 24,000 characters.
- Text output is limited to 16,000 characters during notebook parsing.
- The runtime may further compact output before sending it to Gemini.
- The context target is approximately 3,500,000 characters, leaving room within the 1,048,576-token model window.
- Omitted content is marked with `...[truncated]` or an `omitted` object.

The response includes:

```json
{
  "context": {
    "maxChars": 3500000,
    "truncated": false
  }
}
```

## Context Rules

- Preserve cell indexes after compaction.
- Keep execution counts and errors when available.
- Do not include environment variables, tokens, or arbitrary files.
- Do not modify the notebook while building context.
- Refuse ambiguous notebook names before reading a candidate.
