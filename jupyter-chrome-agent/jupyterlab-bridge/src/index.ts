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
  const tabId = request.tabId;
  if (typeof tabId !== 'number' || !Number.isInteger(tabId) || tabId < 0) {
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
      return snapshotCell(panel, resolveIndex(panel, args));
    case 'read_cell_output':
      return snapshotCell(panel, resolveIndex(panel, args), true).outputs;
    case 'find_cells':
      return findCells(panel, args);
    case 'insert_cell':
      return insertCell(panel, args);
    case 'edit_cell':
      return editCell(panel, args);
    case 'delete_cell':
      return deleteCell(panel, resolveIndex(panel, args));
    case 'run_cell':
      return runCell(panel, resolveIndex(panel, args));
    case 'clear_cell_output':
      return clearCellOutput(panel, resolveIndex(panel, args));
    case 'inspect_error':
      return inspectError(panel, resolveIndex(panel, args));
    case 'get_kernel_status':
      return getKernelStatus(panel);
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
    id: getCellId(cell),
    type: cell.model.type,
    source: outputsOnly || !includeSource ? undefined : truncate(String(json.source ?? '')),
    executionCount: json.execution_count ?? null,
    outputs: outputs.map(output => compactOutput(output))
  };
}

function findCells(panel: NotebookPanel, args: Record<string, unknown>) {
  const query = String(args.query).toLocaleLowerCase();
  const type = args.type as string | undefined;
  return panel.content.widgets
    .map((_, index) => snapshotCell(panel, index, false, true))
    .filter(cell => (!type || cell.type === type) && String(cell.source ?? '').toLocaleLowerCase().includes(query));
}

function insertCell(panel: NotebookPanel, args: Record<string, unknown>) {
  const index = requireInsertIndex(panel, args);
  const source = requireSource(args);
  const type = args.type === 'markdown' ? 'markdown' : 'code';
  const previousCount = panel.content.widgets.length;
  const sharedModel = requireNotebookModel(panel).sharedModel as any;
  sharedModel.insertCell(index, { cell_type: type, source, metadata: {} });
  if (panel.content.widgets.length !== previousCount + 1) {
    throw bridgeError('STATE_CHANGED', 'The notebook cell count did not update after insertion.', true);
  }
  return snapshotCell(panel, index);
}

function editCell(panel: NotebookPanel, args: Record<string, unknown>) {
  const index = resolveIndex(panel, args);
  const source = requireSource(args);
  const cell = cellAt(panel, index);
  const cellId = getCellId(cell);
  (cell.model.sharedModel as any).setSource(source);
  const updatedIndex = resolveIndex(panel, { cellId });
  const updated = snapshotCell(panel, updatedIndex);
  if (updated.source !== source) {
    throw bridgeError('STATE_CHANGED', 'The cell did not contain the requested source after editing.', true);
  }
  return updated;
}

function deleteCell(panel: NotebookPanel, index: number) {
  const cellId = getCellId(cellAt(panel, index));
  const previousCount = panel.content.widgets.length;
  (requireNotebookModel(panel).sharedModel as any).deleteCell(index);
  if (panel.content.widgets.length !== previousCount - 1) {
    throw bridgeError('STATE_CHANGED', 'The notebook cell count did not update after deletion.', true);
  }
  if (panel.content.widgets.some(cell => getCellId(cell) === cellId)) {
    throw bridgeError('STATE_CHANGED', 'The deleted cell is still present in the notebook.', true);
  }
  return snapshotNotebook(panel, false);
}

async function runCell(panel: NotebookPanel, index: number) {
  const cell = cellAt(panel, index);
  const cellId = getCellId(cell);
  const sessionContext = panel.context.sessionContext as any;
  if (sessionContext.status === 'busy') {
    throw bridgeError('KERNEL_BUSY', 'The notebook kernel is already busy.', true);
  }
  panel.content.deselectAll();
  panel.content.activeCellIndex = index;
  panel.content.select(cell);
  const ran = await NotebookActions.run(panel.content, panel.context.sessionContext);
  if (!ran) {
    throw bridgeError('EXECUTION_NOT_STARTED', 'JupyterLab did not start cell execution.', true);
  }
  return snapshotCell(panel, resolveIndex(panel, { cellId }));
}

function clearCellOutput(panel: NotebookPanel, index: number) {
  const cell = cellAt(panel, index);
  const cellId = getCellId(cell);
  (cell.model.sharedModel as any).setOutputs([]);
  const result = snapshotCell(panel, resolveIndex(panel, { cellId }), true);
  if (result.outputs.length !== 0) {
    throw bridgeError('STATE_CHANGED', 'Cell outputs were not cleared.', true);
  }
  return result;
}

function inspectError(panel: NotebookPanel, index: number) {
  const cell = snapshotCell(panel, index, true);
  return {
    index: cell.index,
    id: cell.id,
    errors: cell.outputs.filter((output: any) => output.output_type === 'error' || output.type === 'error')
  };
}

function getKernelStatus(panel: NotebookPanel) {
  const sessionContext = panel.context.sessionContext as any;
  return {
    status: sessionContext.status ?? 'unknown',
    isReady: sessionContext.isReady === true,
    kernelName: sessionContext.kernelDisplayName ?? sessionContext.session?.kernel?.name ?? null
  };
}

function cellAt(panel: NotebookPanel, index: number) {
  if (!Number.isInteger(index) || index < 0 || index >= panel.content.widgets.length) {
    throw bridgeError('INVALID_CELL_INDEX', `Cell index ${index} is outside the active notebook.`, false);
  }
  return panel.content.widgets[index];
}

function requireNotebookModel(panel: NotebookPanel) {
  if (!panel.content.model) {
    throw bridgeError('NO_ACTIVE_NOTEBOOK', 'The active notebook model is not ready.', true);
  }
  return panel.content.model;
}

function requireIndex(args: Record<string, unknown>) {
  if (!Number.isInteger(args.index)) {
    throw bridgeError('INVALID_ARGUMENT', 'A numeric cell index is required.', false);
  }
  return args.index as number;
}

function resolveIndex(panel: NotebookPanel, args: Record<string, unknown>) {
  if (typeof args.cellId === 'string' && args.cellId.trim()) {
    const index = panel.content.widgets.findIndex(cell => getCellId(cell) === args.cellId);
    if (index < 0) {
      throw bridgeError('STALE_CELL_ID', `Cell id ${args.cellId} is no longer present.`, false);
    }
    return index;
  }
  return requireIndex(args);
}

function getCellId(cell: any) {
  return String(cell.model.id ?? cell.model.sharedModel?.getId?.() ?? '');
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
