# NotebookPilot — OpenAI Build Week

NotebookPilot is an autonomous AI assistant for local JupyterLab notebooks. It
adds a Chrome Manifest V3 assistant panel directly inside an active notebook and
can read, explain, edit, insert, delete, search, clear, and execute cells.

## Built with Codex and GPT-5.6

This project was designed and implemented with **OpenAI Codex powered by
GPT-5.6**. Codex was used as the primary engineering agent to:

- Design the end-to-end Chrome extension, JupyterLab bridge, Python services, and AI-agent architecture.
- Implement Manifest V3 service-worker orchestration, injected UI, notebook detection, conversation history, and frontend messaging.
- Build the JupyterLab `INotebookTracker` bridge for live notebook-model operations.
- Implement Gemini tool calling, streaming, prompt engineering, LangChain/LangGraph integration, quotas, validation, and checkpoint recovery.
- Debug real Windows/JupyterLab integration issues, including notebook resolution, stale services, Gemini thought signatures, and automatic service startup.
- Create automated tests, packaging checks, release audits, documentation, and GitHub-ready project phases.

Codex handled the iterative engineering workflow: inspect the repository, plan a
focused change, implement it, run tests and audits, diagnose failures, refine
the implementation, and push verified changes to GitHub.

## What We Built

```text
Chrome MV3 extension
        │
        ├── Injected NotebookPilot panel
        ├── Service worker and tool orchestration
        └── Conversation history per notebook
                │
                ▼
JupyterLab frontend bridge
        │
        └── Live NotebookPanel / INotebookTracker operations
                │
                ├── Local notebook context bridge :8765
                └── Gemini agent runtime :8766
```

The system uses Gemini for notebook reasoning and tool calling while Codex with
GPT-5.6 was used to engineer the complete platform.

## Key Capabilities

- Detects the active notebook from JupyterLab’s dock tabs.
- Keeps separate conversations for each notebook.
- Reads live cells and outputs through official JupyterLab APIs.
- Executes validated tools for notebook editing and execution.
- Streams responses with simple `Thinking` and `Working` indicators.
- Formats answers with structured Markdown, code blocks, headings, and bullets.
- Splits large data-science workflows into ordered working cells.
- Enforces Gemini rate limits and preserves tool-call signatures.
- Supports LangChain, LangGraph state, workflow planning, and SQLite recovery.
- Automatically starts local services when Jupyter Server launches.

## Repository

- `jupyter-chrome-agent/` — complete NotebookPilot implementation.
- `jupyter-chrome-agent/bridge/` — read-only local notebook parser and context API.
- `jupyter-chrome-agent/runtime/` — Gemini/LangChain agent runtime and graph orchestration.
- `jupyter-chrome-agent/jupyterlab-bridge/` — live JupyterLab frontend bridge.
- `jupyter-chrome-agent/server-extension/` — automatic background service startup.
- `NOTEBOOKPILOT_PLAN.md` — project ownership and architecture plan.

For complete installation, configuration, API, testing, and troubleshooting
instructions, see [`jupyter-chrome-agent/README.md`](jupyter-chrome-agent/README.md).
