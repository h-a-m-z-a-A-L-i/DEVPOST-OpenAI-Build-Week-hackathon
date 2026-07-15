import * as vscode from 'vscode';
import type { NotebookToolAction } from './notebookTools';

const maxToolSteps = 12;
const maxTextLength = 12000;

type AgentToolInput = {
	index?: number;
	text?: string;
	language?: string;
	kind?: 'code' | 'markdown';
	includeOutputs?: boolean;
};

type ToolResult = {
	ok: boolean;
	data: unknown;
};

const tools: vscode.LanguageModelChatTool[] = [
	{
		name: 'read_notebook',
		description: 'Read the active notebook, one cell, and optionally its outputs. Cell indexes are zero-based.',
		inputSchema: {
			type: 'object',
			properties: {
				index: { type: 'integer', minimum: 0, description: 'Zero-based cell index. Omit to list all cells.' },
				includeOutputs: { type: 'boolean', description: 'Include cell outputs when reading one cell.' },
			},
		},
	},
	{
		name: 'run_cell',
		description: 'Run one active notebook cell by zero-based index and return its execution result and outputs.',
		inputSchema: {
			type: 'object',
			properties: { index: { type: 'integer', minimum: 0 } },
			required: ['index'],
		},
	},
	{
		name: 'insert_cell',
		description: 'Insert a code or markdown cell at a zero-based position in the active notebook.',
		inputSchema: {
			type: 'object',
			properties: {
				index: { type: 'integer', minimum: 0 },
				text: { type: 'string' },
				language: { type: 'string' },
				kind: { type: 'string', enum: ['code', 'markdown'] },
			},
			required: ['index', 'text'],
		},
	},
	{
		name: 'edit_cell',
		description: 'Replace the content of one active notebook cell by zero-based index.',
		inputSchema: {
			type: 'object',
			properties: {
				index: { type: 'integer', minimum: 0 },
				text: { type: 'string' },
				language: { type: 'string' },
				kind: { type: 'string', enum: ['code', 'markdown'] },
			},
			required: ['index', 'text'],
		},
	},
	{
		name: 'delete_cell',
		description: 'Delete one active notebook cell by zero-based index.',
		inputSchema: {
			type: 'object',
			properties: { index: { type: 'integer', minimum: 0 } },
			required: ['index'],
		},
	},
];

export function registerNotebookAgent(): vscode.Disposable {
	return vscode.chat.createChatParticipant('notebook-capability-probe.agent', handleAgentRequest);
}

async function handleAgentRequest(
	request: vscode.ChatRequest,
	_context: vscode.ChatContext,
	response: vscode.ChatResponseStream,
	token: vscode.CancellationToken,
): Promise<void> {
	const notebook = getActiveNotebook();
	if (!notebook) {
		response.markdown('Open the `.ipynb` notebook you want me to operate on, then try again.');
		return;
	}

	const notebookDescription = `Active notebook: ${notebook.uri.toString()}\nCell count: ${notebook.getCells().length}`;
	const systemInstruction = [
		'You are a fault-tolerant notebook operator.',
		notebookDescription,
		'Use tools for every notebook fact and every mutation; never invent cell content or outputs.',
		'Cell indexes are zero-based. Read before changing a cell unless the user supplied exact content and index.',
		'After insert, edit, delete, or run, read the affected cell to verify the result.',
		'Stop and report the error if a tool fails. Do not retry a mutation blindly.',
		'Only operate on this active notebook. Do not run shell commands, access files, or make network requests.',
		`Use at most ${maxToolSteps} tool calls for this request.`,
	].join('\n');

	const messages: vscode.LanguageModelChatMessage[] = [
		vscode.LanguageModelChatMessage.User(systemInstruction),
		vscode.LanguageModelChatMessage.User(request.prompt),
	];

	try {
		for (let step = 0; step < maxToolSteps; step += 1) {
			if (token.isCancellationRequested) {
				response.markdown('\n\nOperation cancelled.');
				return;
			}

			const result = await request.model.sendRequest(messages, {
				justification: 'Operate on the active notebook according to the user request.',
				tools,
			}, token);
			const assistantParts: Array<vscode.LanguageModelTextPart | vscode.LanguageModelToolCallPart> = [];
			const toolCalls: vscode.LanguageModelToolCallPart[] = [];
			let text = '';

			for await (const part of result.stream) {
				if (part instanceof vscode.LanguageModelTextPart) {
					text += part.value;
					assistantParts.push(part);
				} else if (part instanceof vscode.LanguageModelToolCallPart) {
					toolCalls.push(part);
					assistantParts.push(part);
				}
			}

			if (toolCalls.length === 0) {
				response.markdown(text || 'The notebook task completed.');
				return;
			}

			messages.push(vscode.LanguageModelChatMessage.Assistant(assistantParts));
			const toolResults: vscode.LanguageModelToolResultPart[] = [];
			for (const call of toolCalls) {
				response.progress(`Running ${call.name}...`);
				const toolResult = await executeTool(notebook, call.name, call.input as AgentToolInput, token);
				toolResults.push(new vscode.LanguageModelToolResultPart(
					call.callId,
					[new vscode.LanguageModelTextPart(JSON.stringify(toolResult))],
				));
				if (!toolResult.ok) {
					messages.push(vscode.LanguageModelChatMessage.User(toolResults));
					response.markdown(`\n\nStopped safely: ${String(toolResult.data)}.`);
					return;
				}
			}
			messages.push(vscode.LanguageModelChatMessage.User(toolResults));
		}

		response.markdown(`Stopped after ${maxToolSteps} tool calls to avoid an unbounded automation loop.`);
	} catch (error) {
		response.markdown(`Notebook agent failed safely: ${error instanceof Error ? error.message : String(error)}`);
	}
}

function getActiveNotebook(): vscode.NotebookDocument | undefined {
		const editor = vscode.window.activeNotebookEditor;
		if (editor) {
			return editor.notebook;
		}

		const textEditor = vscode.window.activeTextEditor;
		return vscode.workspace.notebookDocuments.find(notebook =>
			notebook.getCells().some(cell => cell.document.uri.toString() === textEditor?.document.uri.toString()),
		);
}

async function executeTool(
	notebook: vscode.NotebookDocument,
	name: string,
	input: AgentToolInput,
	token: vscode.CancellationToken,
): Promise<ToolResult> {
	try {
		switch (name) {
			case 'read_notebook':
				return { ok: true, data: readNotebook(notebook, input) };
			case 'run_cell':
				return await runAgentCell(notebook, input.index, token);
			case 'insert_cell':
				return await mutateNotebook('insert', notebook, input);
			case 'edit_cell':
				return await mutateNotebook('edit', notebook, input);
			case 'delete_cell':
				return await mutateNotebook('delete', notebook, input);
			default:
				return { ok: false, data: `Unknown tool: ${name}` };
		}
	} catch (error) {
		return { ok: false, data: error instanceof Error ? error.message : String(error) };
	}
}

function readNotebook(notebook: vscode.NotebookDocument, input: AgentToolInput): unknown {
	if (input.index !== undefined) {
		const cell = getCell(notebook, input.index);
		return {
			index: input.index,
			kind: cell.kind === vscode.NotebookCellKind.Markup ? 'markdown' : 'code',
			language: cell.document.languageId,
			text: truncate(cell.document.getText()),
			outputs: input.includeOutputs === false ? [] : readOutputs(cell),
			execution: cell.executionSummary ?? null,
		};
	}

	return {
		uri: notebook.uri.toString(),
		cells: notebook.getCells().map((cell, index) => ({
			index,
			kind: cell.kind === vscode.NotebookCellKind.Markup ? 'markdown' : 'code',
			language: cell.document.languageId,
			preview: truncate(cell.document.getText().split(/\r?\n/, 1)[0], 240),
			outputCount: cell.outputs.length,
		})),
	};
}

function readOutputs(cell: vscode.NotebookCell): unknown[] {
	return cell.outputs.flatMap(output => output.items.map(item => {
		const value = new TextDecoder().decode(item.data);
		let data: unknown = truncate(value);
		if (item.mime.includes('json')) {
			try {
				data = JSON.parse(value);
			} catch {
				data = truncate(value);
			}
		}
		return { mime: item.mime, data };
	}));
}

async function runAgentCell(
	notebook: vscode.NotebookDocument,
	index: number | undefined,
	token: vscode.CancellationToken,
): Promise<ToolResult> {
	if (index === undefined) {
		return { ok: false, data: 'A cell index is required.' };
	}
	const cell = getCell(notebook, index);
	const previousEndTime = cell.executionSummary?.timing?.endTime;
	await vscode.commands.executeCommand('notebook.cell.execute', {
		document: notebook.uri,
		ranges: [{ start: index, end: index + 1 }],
		autoReveal: true,
	});
	await waitForNotebookUpdate(notebook, cell, previousEndTime, token);
	return {
		ok: true,
		data: { index, execution: cell.executionSummary ?? null, outputs: readOutputs(cell) },
	};
}

async function mutateNotebook(action: NotebookToolAction, notebook: vscode.NotebookDocument, input: AgentToolInput): Promise<ToolResult> {
	if (input.index === undefined || !Number.isInteger(input.index) || input.index < 0) {
		return { ok: false, data: 'A non-negative integer cell index is required.' };
	}
	if ((action === 'insert' || action === 'edit') && input.text === undefined) {
		return { ok: false, data: 'Cell text is required.' };
	}
	if (action === 'insert' && input.index > notebook.getCells().length) {
		return { ok: false, data: `Insert index must be between 0 and ${notebook.getCells().length}.` };
	}
	if (action !== 'insert' && input.index >= notebook.getCells().length) {
		return { ok: false, data: `Cell index must be between 0 and ${notebook.getCells().length - 1}.` };
	}

	await vscode.commands.executeCommand('notebook-capability-probe.notebookAction', {
		action,
		index: input.index,
		text: input.text,
		language: input.language,
		kind: input.kind,
	});
	return { ok: true, data: readNotebook(notebook, {}) };
}

function getCell(notebook: vscode.NotebookDocument, index: number | undefined): vscode.NotebookCell {
	if (index === undefined || !Number.isInteger(index) || index < 0 || index >= notebook.getCells().length) {
		throw new Error(`Cell index must be between 0 and ${Math.max(0, notebook.getCells().length - 1)}.`);
	}
	return notebook.cellAt(index);
}

async function waitForNotebookUpdate(
	notebook: vscode.NotebookDocument,
	cell: vscode.NotebookCell,
	previousEndTime: number | undefined,
	token: vscode.CancellationToken,
): Promise<void> {
	if (cell.executionSummary?.timing?.endTime !== undefined && cell.executionSummary.timing.endTime !== previousEndTime) {
		return;
	}

	await new Promise<void>(resolve => {
		let timer: ReturnType<typeof setTimeout>;
		const disposable = vscode.workspace.onDidChangeNotebookDocument(event => {
			if (event.notebook.uri.toString() === notebook.uri.toString()
				&& cell.executionSummary?.timing?.endTime !== undefined
				&& cell.executionSummary.timing.endTime !== previousEndTime) {
				cleanup();
			}
		});
		const cancellation = token.onCancellationRequested(() => cleanup());
		timer = setTimeout(cleanup, 30000);
		function cleanup() {
			clearTimeout(timer);
			disposable.dispose();
			cancellation.dispose();
			resolve();
		}
	});
}

function truncate(value: string, limit = maxTextLength): string {
	return value.length <= limit ? value : `${value.slice(0, limit)}\n...[truncated]`;
}
