# NotebookPilot Project Plan

## Project Goal

NotebookPilot is an autonomous AI assistant for local JupyterLab notebooks. Users interact with the assistant through a Chrome Manifest V3 floating panel. The assistant reads the currently active notebook, reasons over its contents, and performs notebook operations through JupyterLab's live frontend model.

## Product Workflow

```text
Chrome floating panel
        ↓
Chrome extension service worker
        ↓
Local Python bridge
        ↓
Gemini tool-calling agent
        ↓
JupyterLab frontend bridge
        ↓
Active notebook model and kernel
```

The browser URL is used only to confirm that the page is the configured local JupyterLab instance:

```text
http://localhost:8888/lab
```

The active notebook is identified from JupyterLab's dock tab bar, not from the URL. The watcher observes:

```css
#jp-main-dock-panel .lm-DockPanel-tabBar
```

and identifies the active notebook through:

```css
.lm-TabBar-tab.lm-mod-current .lm-TabBar-tabLabel
```

## Core Components

### Chrome Extension

The Chrome extension uses Manifest V3 and owns the user-facing experience.

Responsibilities:

- Detect the configured JupyterLab tab.
- Watch active notebook tabs.
- Track the Chrome tab ID and active notebook name.
- Render the movable floating assistant panel.
- Provide chat input, messages, status, progress, errors, and settings.
- Maintain conversation history locally.
- Communicate with the local bridge and JupyterLab frontend bridge.
- Never expose API keys or Jupyter tokens in committed extension files.

### Local Python Bridge

The local bridge runs on `127.0.0.1` and provides read-only notebook context.

Responsibilities:

- Discover the running Jupyter server.
- Determine the Jupyter server root directory.
- Resolve the active notebook name to a local `.ipynb` file.
- Detect duplicate notebook names and refuse ambiguous matches.
- Parse notebook JSON.
- Normalize cells, source, outputs, execution counts, and errors.
- Return structured JSON to the extension and agent runtime.

The bridge must not directly modify notebook files.

### JupyterLab Frontend Bridge

The frontend bridge is a JupyterLab plugin that operates inside JupyterLab.

Responsibilities:

- Use `INotebookTracker` to identify the active notebook panel.
- Access `panel.content.model` for the live notebook model.
- Access `panel.context.path` for the exact notebook path.
- Receive requests from the Chrome extension.
- Validate tool names, request IDs, notebook identity, and arguments.
- Read, insert, edit, delete, and run cells through official JupyterLab APIs.
- Return updated cell data, outputs, execution state, and errors.
- Keep the visible notebook synchronized without page refreshes.

Frontend communication will use request/response messages with unique request IDs. The browser content script will communicate with the page bridge through `window.postMessage()`.

## Notebook Context Model

The agent will receive normalized notebook data similar to:

```json
{
  "path": "C:\\Users\\Admin\\Untitled.ipynb",
  "name": "Untitled.ipynb",
  "cellCount": 4,
  "cells": [
    {
      "index": 0,
      "type": "code",
      "language": "python",
      "source": "print('hello')",
      "executionCount": 1,
      "outputs": []
    }
  ]
}
```

Context generation will include:

- Notebook path and name.
- Stable cell indexes and identifiers.
- Cell type and language.
- Cell source.
- Execution count and execution status.
- Text, JSON, image, and error outputs where useful.
- Tracebacks and failure details.
- Notebook revision or state information.

Large outputs and oversized source blocks will be truncated or summarized before being sent to the model.

## LLM Tools

The model will operate through validated tools rather than direct file or shell access.

Initial tools:

```text
get_active_notebook
list_cells
read_cell
read_cell_output
insert_cell
edit_cell
delete_cell
run_cell
```

Future tools:

```text
find_cells
clear_cell_output
restart_kernel
inspect_error
```

Every tool must:

- Validate all arguments.
- Validate cell indexes against the active notebook.
- Confirm the target notebook has not changed.
- Operate only on the active notebook.
- Return structured JSON.
- Return the updated state after mutations.
- Stop safely on invalid or stale requests.

## Autonomous Agent Workflow

1. The user sends a request through the floating panel.
2. The extension identifies the active JupyterLab notebook.
3. The local bridge builds the initial notebook context.
4. Gemini receives the user request, context, and tool definitions.
5. Gemini selects a tool when an action is required.
6. The extension validates and forwards the request.
7. The frontend bridge executes the operation on the live notebook model.
8. The result is returned to Gemini.
9. Gemini continues until the task is complete or a safe stopping condition is reached.
10. The final explanation and relevant results are shown in the panel.

The workflow is autonomous and does not require confirmation for normal operations. Automatic safety limits still apply.

## Safety and Reliability

- Restrict operation to the active notebook.
- Reject ambiguous notebook-name matches.
- Do not expose API keys in the Chrome extension.
- Keep Jupyter tokens outside committed files.
- Do not allow arbitrary shell commands.
- Do not allow unrestricted filesystem access.
- Enforce maximum source and output sizes.
- Enforce maximum agent rounds.
- Enforce Gemini rate limits and request spacing.
- Stop after repeated tool failures.
- Record tool requests, results, failures, and execution timing.
- Re-read or verify notebook state after mutations.
- Handle kernel busy, execution errors, and timeouts explicitly.

## Development Milestones

### Milestone 1: Project Foundation

- Maintain the Chrome extension as the active project.
- Keep the old VS Code extension discarded.
- Load the extension through Chrome developer mode.
- Start and test the local bridge.
- Protect `.env` and local secrets.

### Milestone 2: Notebook Identification

- Detect only the configured JupyterLab host.
- Watch the JupyterLab dock tab bar.
- Track opening, closing, and switching notebook tabs.
- Maintain the active Chrome tab and notebook identity.
- Validate behavior with multiple notebooks.

### Milestone 3: Notebook Context

- Resolve the notebook locally.
- Parse `.ipynb` files.
- Normalize cells and outputs.
- Handle duplicate names and missing files.
- Add context size limits and compression.

### Milestone 4: Frontend Bridge

- Create the JupyterLab plugin.
- Connect `INotebookTracker`.
- Implement authenticated request/response messaging.
- Read the live notebook model.
- Return active notebook and cell snapshots.

### Milestone 5: Notebook Tools

- Implement read-only tools first.
- Implement insert and edit.
- Implement delete.
- Implement run-cell and output collection.
- Verify real-time frontend updates.

### Milestone 6: Gemini Agent

- Add Gemini API integration through the local runtime.
- Add tool declarations and schemas.
- Add the agent loop.
- Add context packing and compression.
- Respect the configured 250k context and 15 RPM limit.
- Add conversation memory.

### Milestone 7: Product Experience

- Improve floating panel visuals.
- Add streaming responses.
- Add tool activity indicators.
- Add execution progress and error messages.
- Add notebook and kernel status.
- Add settings and conversation history.
- Add responsive behavior and branding.

### Milestone 8: Validation and Demo

- Test exploratory data analysis notebooks.
- Test machine learning pipelines.
- Test feature engineering workflows.
- Test visualization notebooks.
- Test failure and recovery cases.
- Measure task completion time and productivity.
- Capture screenshots, traces, and benchmark evidence.
- Prepare the final demo and Devpost submission.

## Team Assignments

### Umair — End-User Evaluation and Documentation

Umair's primary responsibility is to evaluate NotebookPilot from an end-user perspective and prepare supporting documentation and demonstration material.

Responsibilities:

- Create realistic notebook workflows for evaluation.
- Benchmark NotebookPilot against traditional notebook development.
- Collect screenshots, execution traces, timing comparisons, and productivity metrics.
- Gather evidence demonstrating the value of the system.
- Organize technical documentation.
- Contribute to the Devpost submission.
- Prepare architecture explanations and user documentation.
- Ensure implemented features are properly documented.
- Prepare and narrate the final demonstration video.
- Communicate the motivation, workflow, architecture, and capabilities clearly.

### Nouman — Notebook Workflow Engineering and Validation

Nouman's responsibility is to design, create, and validate the notebook workflows used throughout development.

Responsibilities:

- Build exploratory data analysis notebooks.
- Build machine learning pipelines.
- Build feature engineering workflows.
- Build visualization notebooks.
- Build realistic data science projects.
- Test the system against increasingly complex notebook scenarios.
- Verify generated code correctness.
- Identify failure cases.
- Report bugs and reproducible issues.
- Validate notebook behavior after AI operations.
- Ensure reliable behavior across practical data science tasks.
- Maintain notebooks as the testing environment and demonstration material.

### Rizo — Visual Design and User Experience

Rizo will lead the visual design and user experience of NotebookPilot inside JupyterLab.

Responsibilities:

- Design and implement the floating assistant panel.
- Improve the chat experience.
- Design execution progress indicators.
- Visualize tool activity.
- Add notifications and useful animations.
- Design icons, themes, and branding.
- Improve responsive layouts.
- Ensure interactions feel natural and understandable.
- Coordinate frontend improvements with the Chrome extension.
- Make every AI action visible and easy to follow.
- Maintain a polished experience for daily use and the final demo.

### Team Lead — AI Architecture, Core Platform, and Integration

The Team Lead owns the complete technical vision, architecture, implementation, and final integration of NotebookPilot.

Chrome extension responsibilities:

- Own the Manifest V3 architecture.
- Implement the service worker.
- Implement content scripts.
- Implement the floating assistant panel.
- Implement chat, settings, and conversation history.
- Implement the messaging framework.
- Maintain extension packaging and deployment.
- Maintain communication between Chrome and JupyterLab.
- Maintain notebook detection and tracking.

Local bridge responsibilities:

- Discover running Jupyter servers.
- Locate the server root directory.
- Resolve notebook paths.
- Parse notebook files into normalized context.
- Expose read-only notebook information securely.

Frontend bridge responsibilities:

- Develop the JupyterLab frontend bridge using official APIs.
- Use `INotebookTracker` to identify the live notebook model.
- Connect the frontend bridge to the Chrome extension.
- Implement all notebook interaction capabilities required by the AI.

AI and platform responsibilities:

- Own Gemini and Codex integration.
- Design prompts and tool schemas.
- Implement reasoning workflows.
- Implement autonomous agent orchestration.
- Generate and compress notebook context.
- Maintain stable cell identification.
- Maintain conversation memory.
- Implement execution safeguards.
- Implement security validation.
- Manage kernel execution and run-cell orchestration.
- Maintain the full communication pipeline between the extension, local bridge, frontend bridge, and AI runtime.

Leadership and delivery responsibilities:

- Plan the project and manage milestones.
- Make technical decisions.
- Administer the GitHub repository.
- Review code and approve pull requests.
- Resolve technical blockers.
- Integrate all subsystems into one product.
- Prepare the final Devpost submission.
- Coordinate the demonstration.
- Keep architecture consistent.
- Deliver a stable, production-ready autonomous notebook assistant.

## Definition of Done

NotebookPilot is complete when a user can:

1. Open a local JupyterLab notebook in Chrome.
2. See the NotebookPilot floating panel only for active notebook tabs.
3. Ask a natural-language notebook question.
4. Receive context-aware Gemini reasoning.
5. Allow the agent to inspect cells and outputs.
6. Allow the agent to insert, edit, delete, and run cells autonomously.
7. See changes and execution results immediately in JupyterLab.
8. Recover safely from invalid indexes, duplicate files, kernel errors, and stale notebook state.
9. Review useful tool activity and final explanations.
10. Use the system reliably in realistic data science notebooks.
