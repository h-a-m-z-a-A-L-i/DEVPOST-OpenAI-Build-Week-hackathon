export type NotebookToolName =
  | 'get_active_notebook'
  | 'list_cells'
  | 'read_cell'
  | 'read_cell_output'
  | 'find_cells'
  | 'clear_cell_output'
  | 'inspect_error'
  | 'get_kernel_status'
  | 'insert_cell'
  | 'edit_cell'
  | 'delete_cell'
  | 'run_cell';

export const NOTEBOOK_TOOL_DEFINITIONS = [
  definition('get_active_notebook', 'Read the active notebook and its cells.', {}),
  definition('list_cells', 'List the active notebook cells without full outputs.', {}),
  definition('read_cell', 'Read one active notebook cell.', {
    index: { type: 'integer', minimum: 0 },
    cellId: { type: 'string', minLength: 1 }
  }),
  definition('read_cell_output', 'Read one active notebook cell output.', {
    index: { type: 'integer', minimum: 0 },
    cellId: { type: 'string', minLength: 1 }
  }),
  definition('find_cells', 'Find active notebook cells by source text.', {
    query: { type: 'string', minLength: 1 },
    type: { type: 'string', enum: ['code', 'markdown'] }
  }),
  definition('insert_cell', 'Insert a new cell into the active notebook.', {
    index: { type: 'integer', minimum: 0 },
    type: { type: 'string', enum: ['code', 'markdown'] },
    source: { type: 'string', minLength: 1 }
  }),
  definition('edit_cell', 'Replace the source of an active notebook cell.', {
    index: { type: 'integer', minimum: 0 },
    cellId: { type: 'string', minLength: 1 },
    source: { type: 'string', minLength: 1 }
  }),
  definition('delete_cell', 'Delete one active notebook cell.', {
    index: { type: 'integer', minimum: 0 },
    cellId: { type: 'string', minLength: 1 }
  }),
  definition('run_cell', 'Execute one active notebook cell and return its result.', {
    index: { type: 'integer', minimum: 0 },
    cellId: { type: 'string', minLength: 1 }
  }),
  definition('clear_cell_output', 'Clear one active notebook cell output.', {
    index: { type: 'integer', minimum: 0 },
    cellId: { type: 'string', minLength: 1 }
  }),
  definition('inspect_error', 'Inspect errors from one active notebook cell.', {
    index: { type: 'integer', minimum: 0 },
    cellId: { type: 'string', minLength: 1 }
  }),
  definition('get_kernel_status', 'Read the active notebook kernel status.', {})
] as const;

export function assertToolArguments(
  tool: string,
  args: Record<string, unknown>,
  cellCount: number
): asserts tool is NotebookToolName {
  if (!NOTEBOOK_TOOL_DEFINITIONS.some(definitionItem => definitionItem.name === tool)) {
    throw toolError('INVALID_TOOL', `Unknown tool: ${tool}.`);
  }

  if (tool === 'get_active_notebook' || tool === 'list_cells' || tool === 'get_kernel_status') {
    return;
  }

  if (tool === 'find_cells') {
    if (typeof args.query !== 'string' || !args.query.trim()) {
      throw toolError('INVALID_ARGUMENT', 'A non-empty query is required.');
    }
    if (args.type !== undefined && args.type !== 'code' && args.type !== 'markdown') {
      throw toolError('INVALID_ARGUMENT', 'Cell type must be code or markdown.');
    }
    return;
  }

  const isInsert = tool === 'insert_cell';
  if (isInsert && args.index === undefined) {
    validateSource(args);
    validateCellType(args);
    return;
  }

  if (args.cellId !== undefined && (typeof args.cellId !== 'string' || !args.cellId.trim())) {
    throw toolError('INVALID_ARGUMENT', 'cellId must be a non-empty string.');
  }
  if (args.cellId === undefined && !Number.isInteger(args.index)) {
    throw toolError('INVALID_ARGUMENT', 'A numeric cell index or cellId is required.');
  }

  const index = args.index as number | undefined;
  if (index !== undefined && (index < 0 || index > cellCount || (!isInsert && index === cellCount))) {
    throw toolError('INVALID_CELL_INDEX', `Cell index ${index} is outside the active notebook.`);
  }

  if (tool === 'insert_cell' || tool === 'edit_cell') {
    validateSource(args);
  }
  if (isInsert) {
    validateCellType(args);
  }
}

function validateSource(args: Record<string, unknown>) {
  if (typeof args.source !== 'string' || !args.source.trim()) {
    throw toolError('INVALID_ARGUMENT', 'Non-empty source is required.');
  }
}

function validateCellType(args: Record<string, unknown>) {
  if (args.type !== undefined && args.type !== 'code' && args.type !== 'markdown') {
    throw toolError('INVALID_ARGUMENT', 'Cell type must be code or markdown.');
  }
}

function definition(name: NotebookToolName, description: string, properties: Record<string, unknown>) {
  return {
    name,
    description,
    parameters: {
      type: 'object',
      properties,
      additionalProperties: false
    }
  };
}

function toolError(code: string, message: string) {
  return Object.assign(new Error(message), { code, retryable: false });
}
