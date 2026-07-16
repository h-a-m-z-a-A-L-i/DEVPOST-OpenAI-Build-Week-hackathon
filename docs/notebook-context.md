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

- Cell source is limited to 12,000 characters.
- Text output is limited to 8,000 characters.
- Structured output larger than 8,000 characters receives an omission marker and preview.
- The context target is 60,000 characters.
- Omitted content is marked with `...[truncated]` or an `omitted` object.

The response includes:

```json
{
  "context": {
    "maxChars": 60000,
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
