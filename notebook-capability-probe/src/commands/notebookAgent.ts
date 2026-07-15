import * as vscode from 'vscode';
import type { NotebookToolAction } from './notebookTools';
import { NotebookSdk } from '../notebook/notebookSdk';
import { AgentWorkflow } from '../agent/agentWorkflow';
import { type AgentToolInput, type AgentToolName, type AgentToolResult } from '../agent/agentContracts';
import { VsCodeAgentModel } from '../agent/agentModel';

const maxToolSteps = 12;

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
	const workflow = new AgentWorkflow(message => response.progress(message));
	const model = new VsCodeAgentModel(request.model);
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
				workflow.cancel();
				response.markdown('\n\nOperation cancelled.');
				return;
			}

			const result = await model.send(messages, token);
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
				if (!workflow.canComplete()) {
					const message = 'The agent did not complete the required read and verification steps.';
					workflow.fail(message);
					response.markdown(`\n\nStopped safely: ${message}`);
					return;
				}
				workflow.complete();
				response.markdown(text || 'The notebook task completed.');
				return;
			}

			messages.push(vscode.LanguageModelChatMessage.Assistant(assistantParts));
			const toolResults: vscode.LanguageModelToolResultPart[] = [];
			for (const call of toolCalls) {
				response.progress(`Running ${call.name}...`);
				const workflowError = workflow.beforeTool(call.name);
				const toolResult = workflowError
					? { ok: false, data: workflowError }
					: await executeTool(notebook, call.name as AgentToolName, call.input as AgentToolInput, token);
				toolResults.push(new vscode.LanguageModelToolResultPart(
					call.callId,
					[new vscode.LanguageModelTextPart(JSON.stringify(toolResult))],
				));
				if (!toolResult.ok) {
					workflow.fail(String(toolResult.data));
					messages.push(vscode.LanguageModelChatMessage.User(toolResults));
					response.markdown(`\n\nStopped safely: ${String(toolResult.data)}.`);
					return;
				}
				workflow.afterTool(call.name);
			}
			messages.push(vscode.LanguageModelChatMessage.User(toolResults));
		}

		const message = `Stopped after ${maxToolSteps} tool calls to avoid an unbounded automation loop.`;
		workflow.fail(message);
		response.markdown(message);
	} catch (error) {
		workflow.fail(error instanceof Error ? error.message : String(error));
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
	name: AgentToolName,
	input: AgentToolInput,
	token: vscode.CancellationToken,
): Promise<AgentToolResult> {
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
	const sdk = new NotebookSdk(notebook);
	if (input.index !== undefined) {
		return sdk.readCell(input.index, input.includeOutputs !== false);
	}

	return {
		uri: notebook.uri.toString(),
		cells: sdk.listCells(),
	};
}

async function runAgentCell(
	notebook: vscode.NotebookDocument,
	index: number | undefined,
	token: vscode.CancellationToken,
): Promise<AgentToolResult> {
	if (index === undefined) {
		return { ok: false, data: 'A cell index is required.' };
	}
	return { ok: true, data: await new NotebookSdk(notebook).runCell(index, token) };
}

async function mutateNotebook(action: NotebookToolAction, notebook: vscode.NotebookDocument, input: AgentToolInput): Promise<AgentToolResult> {
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

	const sdk = new NotebookSdk(notebook);
	if (action === 'insert') {
		return { ok: true, data: await sdk.insertCell({ index: input.index, text: input.text!, language: input.language, kind: input.kind }) };
	}
	if (action === 'edit') {
		return { ok: true, data: await sdk.editCell({ index: input.index, text: input.text!, language: input.language, kind: input.kind }) };
	}
	return { ok: true, data: { cells: await sdk.deleteCell(input.index) } };
}
