# NotebookPilot Prototype Baseline

Date: 2026-07-15

Reference commit: `a669368c257cdfa3f48a569239a949b455c073a8`

## Working capabilities

- The VS Code extension can run, insert, edit, and delete notebook cells.
- Commands operate on the selected cell or offer a cell picker when no cell is selected.
- The `@notebook` participant can read cell source, execution state, and text/JSON outputs.
- The agent can request notebook mutations through bounded tool calls and re-read notebook state.
- Agent actions are limited to the active notebook and stop on errors or cancellation.

## Verified checks

Run from `notebook-capability-probe`:

- `npm run check-types` — passed.
- `npm run lint` — passed.
- `npm run compile` — passed.
- Manual testing of the four notebook commands — passed.

The full `npm test` command has not been accepted as a baseline because the VS Code integration runner did not finish in the current environment.

## Current boundaries

- Notebook operations are coupled to `notebookTools.ts` and are not yet a standalone SDK.
- The agent uses the VS Code-provided language model; there is no separate GPT/Codex backend adapter yet.
- The agent operates on the active notebook only.
- Output serialization currently focuses on text and JSON and truncates large values.
- There is no persistent plan history, checkpoint store, rollback layer, or execution timeline yet.

## Change-control rule

Phase 2 must preserve the existing command IDs and manual behavior. SDK extraction should be additive first, followed by agent migration and focused validation.
