# NotebookPilot Benchmark Plan

The benchmark measures task success and recovery rather than model text quality alone.

## Scenarios

| Scenario | Notebook state | Expected agent behavior |
| --- | --- | --- |
| Inspect | Source cells with successful outputs | Read cells and summarize findings without mutation |
| Repair | A cell with an execution error | Read source/output, edit the cell, run it, verify output |
| Insert | A notebook requiring an explanation | Insert a markdown cell at the requested position |
| Refactor | Several dependent code cells | Read dependencies, edit the requested cell, run and verify |
| Delete | An explicitly requested obsolete cell | Ask for deletion confirmation and verify the new cell list |
| Recovery | A busy or unavailable kernel | Stop safely, retry only the allowed transient case, report failure |

## Metrics

- Task success rate: completed requests divided by total requests.
- Verification rate: mutations followed by a successful read-back.
- Recovery rate: failed executions that end in a safe, reported state.
- Tool steps: number of model tool calls per task.
- Latency: request start to verified completion.

Record the model, notebook, prompt, result, tool steps, errors, and timestamps for every run. Do not count a task as successful when the agent only generates an explanation without verifying the notebook state.
