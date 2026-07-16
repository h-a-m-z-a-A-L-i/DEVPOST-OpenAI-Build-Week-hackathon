import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';
import { INotebookTracker, NotebookActions, NotebookPanel } from '@jupyterlab/notebook';
import { assertToolArguments } from './tools';

const PLUGIN_ID = 'notebookpilot:frontend-bridge';
const REQUEST_TYPE = 'notebook-tool-request';
const RESULT_TYPE = 'notebook-tool-result';
const EXTENSION_SOURCE = 'notebookpilot-extension';
const BRIDGE_SOURCE = 'notebookpilot-jupyterlab';
const MAX_SOURCE_LENGTH = 12000;

type ToolRequest = {
  type: typeof REQUEST_TYPE;
  source: typeof EXTENSION_SOURCE;
  requestId: string;
  origin: string;
  tabId: number;
  notebookName: string;
  tool: string;
  arguments?: Record<string, unknown>;
};

type ToolResult = {
  type: typeof RESULT_TYPE;
  source: typeof BRIDGE_SOURCE;
  requestId: string;
  ok: boolean;
  result?: unknown;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
};

const plugin: JupyterFrontEndPlugin<void> = {
  id: PLUGIN_ID,
  autoStart: true,
  requires: [INotebookTracker],
  activate: (_app: JupyterFrontEnd, tracker: INotebookTracker) => {
    window.addEventListener('message', event => {
      if (event.source !== window || event.origin !== window.location.origin) {
        return;
      }

      const request = event.data as Partial<ToolRequest>;
      if (request?.type !== REQUEST_TYPE || request.source !== EXTENSION_SOURCE) {
        return;
      }

      void handleRequest(request, tracker).then(response => {
        window.postMessage(response, window.location.origin);
      });
    });
  }
};

async function handleRequest(
  request: Partial<ToolRequest>,
  tracker: INotebookTracker
): Promise<ToolResult> {
  const requestId = typeof request.requestId === 'string' ? request.requestId : '';
  try {
    validateRequest(request);
    const panel = tracker.currentWidget;
    if (!panel) {
      throw bridgeError('NO_ACTIVE_NOTEBOOK', 'No active notebook is open.', false);
    }

    if (panel.context.path.split('/').pop() !== request.notebookName) {
      throw bridgeError('NOTEBOOK_MISMATCH', 'The requested notebook is not active.', false);
    }

    const result = await executeTool(panel, request.tool!, request.arguments ?? {});
    return { type: RESULT_TYPE, source: BRIDGE_SOURCE, requestId, ok: true, result };
  } catch (error) {
    const normalized = normalizeError(error);
    return {
      type: RESULT_TYPE,
      source: BRIDGE_SOURCE,
      requestId,
      ok: false,
      error: normalized
    };
  }
}

function validateRequest(request: Partial<ToolRequest>): asserts request is ToolRequest {
  if (!request.requestId || typeof request.requestId !== 'string') {
    throw bridgeError('INVALID_MESSAGE', 'A requestId is required.', false);
  }
  if (request.origin !== window.location.origin) {
    throw bridgeError('ORIGIN_REJECTED', 'The request origin is not trusted.', false);
  }
  if (!Number.isInteger(request.tabId) || request.tabId < 0) {
    throw bridgeError('INVALID_MESSAGE', 'A valid tabId is required.', false);
  }
  if (!request.notebookName?.toLowerCase().endsWith('.ipynb')) {
    throw bridgeError('INVALID_MESSAGE', 'A notebook name is required.', false);
  }
  if (!request.tool) {
    throw bridgeError('INVALID_TOOL', 'A tool name is required.', false);
  }
}

async function executeTool(
  panel: NotebookPanel,
  tool: string,
  args: Record<string, unknown>
): Promise<unknown> {
  assertToolArguments(tool, args, panel.content.widgets.length);
  switch (tool) {
    case 'get_active_notebook':
      return snapshotNotebook(panel);
    case 'list_cells':
      return snapshotNotebook(panel, false).cells;
    case 'read_cell':
      return snapshotCell(panel, requireIndex(args));
    case 'read_cell_output':
      return snapshotCell(panel, requireIndex(args), true).outputs;
    case 'insert_cell':
      return insertCell(panel, args);
    case 'edit_cell':
      return editCell(panel, args);
    case 'delete_cell':
      return deleteCell(panel, requireIndex(args));
    case 'run_cell':
      return runCell(panel, requireIndex(args));
    default:
      throw bridgeError('INVALID_TOOL', `Unknown tool: ${tool}.`, false);
  }
}

function snapshotNotebook(panel: NotebookPanel, includeSource = true) {
  return {
    path: panel.context.path,
    name: panel.context.path.split('/').pop(),
    cellCount: panel.content.widgets.length,
    cells: panel.content.widgets.map((_, index) => snapshotCell(panel, index, false, includeSource))
  };
}

function snapshotCell(panel: NotebookPanel, index: number, outputsOnly = false, includeSource = true) {
  const cell = cellAt(panel, index);
  const json = cell.model.toJSON() as Record<string, unknown>;
  const outputs = Array.isArray(json.outputs) ? json.outputs : [];
  return {
    index,
    type: cell.model.type,
    source: outputsOnly || !includeSource ? undefined : truncate(String(json.source ?? '')),
    executionCount: json.execution_count ?? null,
    outputs: outputs.map(output => compactOutput(output))
  };
}

function insertCell(panel: NotebookPanel, args: Record<string, unknown>) {
  const index = requireInsertIndex(panel, args);
  const source = requireSource(args);
  const type = args.type === 'markdown' ? 'markdown' : 'code';
  const sharedModel = panel.content.model.sharedModel as any;
  sharedModel.insertCell(index, { cell_type: type, source, metadata: {} });
  return snapshotCell(panel, index);
}

function editCell(panel: NotebookPanel, args: Record<string, unknown>) {
  const index = requireIndex(args);
  const source = requireSource(args);
  const cell = cellAt(panel, index);
  (cell.model.sharedModel as any).setSource(source);
  return snapshotCell(panel, index);
}

function deleteCell(panel: NotebookPanel, index: number) {
  cellAt(panel, index);
  (panel.content.model.sharedModel as any).deleteCell(index);
  return snapshotNotebook(panel, false);
}

async function runCell(panel: NotebookPanel, index: number) {
  cellAt(panel, index);
  await NotebookActions.run(panel.content, panel.context.sessionContext);
  return snapshotCell(panel, index);
}

function cellAt(panel: NotebookPanel, index: number) {
  if (!Number.isInteger(index) || index < 0 || index >= panel.content.widgets.length) {
    throw bridgeError('INVALID_CELL_INDEX', `Cell index ${index} is outside the active notebook.`, false);
  }
  return panel.content.widgets[index];
}

function requireIndex(args: Record<string, unknown>) {
  if (!Number.isInteger(args.index)) {
    throw bridgeError('INVALID_ARGUMENT', 'A numeric cell index is required.', false);
  }
  return args.index as number;
}

function requireInsertIndex(panel: NotebookPanel, args: Record<string, unknown>) {
  const index = args.index === undefined ? panel.content.widgets.length : requireIndex(args);
  if (index < 0 || index > panel.content.widgets.length) {
    throw bridgeError('INVALID_CELL_INDEX', `Insert index ${index} is outside the notebook.`, false);
  }
  return index;
}

function requireSource(args: Record<string, unknown>) {
  if (typeof args.source !== 'string' || !args.source.trim()) {
    throw bridgeError('INVALID_ARGUMENT', 'Non-empty source is required.', false);
  }
  if (args.source.length > MAX_SOURCE_LENGTH) {
    throw bridgeError('INVALID_ARGUMENT', 'Cell source exceeds the size limit.', false);
  }
  return args.source;
}

function compactOutput(output: unknown) {
  const serialized = JSON.stringify(output) ?? '';
  return serialized.length > MAX_SOURCE_LENGTH
    ? { omitted: true, reason: 'output exceeded size limit', preview: serialized.slice(0, MAX_SOURCE_LENGTH) }
    : output;
}

function truncate(value: string) {
  return value.length > MAX_SOURCE_LENGTH ? `${value.slice(0, MAX_SOURCE_LENGTH)}\n...[truncated]` : value;
}

function bridgeError(code: string, message: string, retryable: boolean) {
  return Object.assign(new Error(message), { code, retryable });
}

function normalizeError(error: unknown) {
  const value = error as Partial<Error> & { code?: string; retryable?: boolean };
  return {
    code: value.code ?? 'BRIDGE_ERROR',
    message: value.message ?? 'The frontend bridge failed.',
    retryable: value.retryable === true
  };
}

export default plugin;
