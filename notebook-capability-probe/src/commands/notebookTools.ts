import * as vscode from 'vscode';
import { NotebookSdk } from '../notebook/notebookSdk';

export type NotebookToolAction = 'run' | 'insert' | 'edit' | 'delete';

export interface NotebookToolArguments {
	action: NotebookToolAction;
	index?: number;
	text?: string;
	language?: string;
	kind?: 'code' | 'markdown';
}

type ActiveCellContext = {
	notebook: vscode.NotebookDocument;
	cell?: vscode.NotebookCell;
	index?: number;
};

export function registerNotebookToolCommands(): vscode.Disposable[] {
	return [
		vscode.commands.registerCommand('notebook-capability-probe.notebookAction', runNotebookAction),
		vscode.commands.registerCommand('notebook-capability-probe.runNotebookCell', () => runNotebookAction({ action: 'run' })),
		vscode.commands.registerCommand('notebook-capability-probe.insertNotebookCell', () => runNotebookAction({ action: 'insert' })),
		vscode.commands.registerCommand('notebook-capability-probe.editNotebookCell', () => runNotebookAction({ action: 'edit' })),
		vscode.commands.registerCommand('notebook-capability-probe.deleteNotebookCell', () => runNotebookAction({ action: 'delete' })),
	];
}

async function runNotebookAction(args?: Partial<NotebookToolArguments>) {
	const action = args?.action ?? await pickAction();
	if (!action) {
		return;
	}

	const notebookContext = getNotebookContext();
	if (!notebookContext) {
		vscode.window.showWarningMessage('Open a notebook or notebook cell first.');
		return;
	}

	const { notebook } = notebookContext;
	const currentCellIndex = await resolveCellIndex(notebook, args?.index, notebookContext.index, action === 'insert');
	if (currentCellIndex === undefined) {
		return;
	}

	switch (action) {
		case 'run':
			await runCell(notebook, currentCellIndex);
			return;
		case 'delete':
			await deleteCell(notebook, currentCellIndex);
			return;
		case 'edit':
			await editCell(notebook, currentCellIndex, args);
			return;
		case 'insert':
				await insertCell(notebook, currentCellIndex, notebookContext.index !== undefined, args);
			return;
	}
}

async function pickAction(): Promise<NotebookToolAction | undefined> {
	const picked = await vscode.window.showQuickPick([
		{ label: 'Run cell', action: 'run' as const },
		{ label: 'Insert cell', action: 'insert' as const },
		{ label: 'Edit cell', action: 'edit' as const },
		{ label: 'Delete cell', action: 'delete' as const },
	], {
		placeHolder: 'Choose a notebook action'
	});

	return picked?.action;
}

function getNotebookContext(): ActiveCellContext | undefined {
	const activeTextEditor = vscode.window.activeTextEditor;
	if (activeTextEditor) {
		for (const notebook of vscode.workspace.notebookDocuments) {
			const cellIndex = notebook.getCells().findIndex(cell => cell.document.uri.toString() === activeTextEditor.document.uri.toString());
			if (cellIndex !== -1) {
				return {
					notebook,
					cell: notebook.getCells()[cellIndex],
					index: cellIndex,
				};
			}
		}
	}

	const activeNotebookEditor = vscode.window.activeNotebookEditor;
	if (activeNotebookEditor) {
		return {
			notebook: activeNotebookEditor.notebook,
			index: activeNotebookEditor.selection.start < activeNotebookEditor.notebook.getCells().length
				? activeNotebookEditor.selection.start
				: undefined,
		};
	}

	return undefined;
}

async function resolveCellIndex(
	notebook: vscode.NotebookDocument,
	requestedIndex: number | undefined,
	activeIndex: number | undefined,
	isInsert: boolean,
): Promise<number | undefined> {
	if (notebook.getCells().length === 0) {
		return 0;
	}

	if (requestedIndex !== undefined) {
		return clampIndex(requestedIndex, notebook.getCells().length);
	}

	if (activeIndex !== undefined) {
		return clampIndex(activeIndex, notebook.getCells().length);
	}

	if (isInsert) {
		return notebook.getCells().length;
	}

	return pickCellIndex(notebook);
}

async function pickCellIndex(notebook: vscode.NotebookDocument): Promise<number | undefined> {
	if (!notebook.getCells().length) {
		return undefined;
	}

	const picked = await vscode.window.showQuickPick(
		notebook.getCells().map((cell, index) => ({
			label: `${index + 1}. ${cell.kind === vscode.NotebookCellKind.Markup ? 'Markdown' : 'Code'} cell`,
			description: cell.document.getText().split(/\r?\n/, 1)[0].slice(0, 80),
			index,
		})),
		{ placeHolder: 'Choose the notebook cell to modify' },
	);

	return picked?.index;
}

function clampIndex(index: number, cellCount: number): number {
	if (cellCount === 0) {
		return 0;
	}

	return Math.max(0, Math.min(index, cellCount - 1));
}

async function runCell(notebook: vscode.NotebookDocument, index: number): Promise<void> {
	if (!notebook.getCells().length) {
		vscode.window.showWarningMessage('This notebook has no cells to run.');
		return;
	}

	await new NotebookSdk(notebook).runCell(index);
}

async function deleteCell(notebook: vscode.NotebookDocument, index: number): Promise<void> {
	if (!notebook.getCells().length) {
		vscode.window.showWarningMessage('This notebook has no cells to delete.');
		return;
	}

	await new NotebookSdk(notebook).deleteCell(index);
	vscode.window.showInformationMessage('Notebook cell deleted.');
}

async function editCell(notebook: vscode.NotebookDocument, index: number, args?: Partial<NotebookToolArguments>): Promise<void> {
	if (!notebook.getCells().length) {
		vscode.window.showWarningMessage('This notebook has no cells to edit.');
		return;
	}

	const currentCell = notebook.cellAt(index);
	const text = args?.text ?? await vscode.window.showInputBox({
		prompt: 'New cell content',
		value: currentCell.document.getText(),
	});

	if (text === undefined) {
		return;
	}

	await new NotebookSdk(notebook).editCell({
		index,
		text,
		language: args?.language,
		kind: args?.kind,
	});
	vscode.window.showInformationMessage('Notebook cell edited.');
}

async function insertCell(notebook: vscode.NotebookDocument, index: number, hasActiveCell: boolean, args?: Partial<NotebookToolArguments>): Promise<void> {
	const cells = notebook.getCells();
	const text = args?.text ?? await vscode.window.showInputBox({
		prompt: 'Cell content to insert',
		value: '',
	});

	if (text === undefined) {
		return;
	}

	const insertIndex = Math.min(Math.max(args?.index ?? (hasActiveCell ? index + 1 : cells.length), 0), cells.length);
	await new NotebookSdk(notebook).insertCell({
		index: insertIndex,
		text,
		language: args?.language,
		kind: args?.kind,
	});
	vscode.window.showInformationMessage('Notebook cell inserted.');
}
