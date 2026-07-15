import * as vscode from 'vscode';

export type NotebookCellKindName = 'code' | 'markdown';

export interface NotebookCellSnapshot {
	index: number;
	kind: NotebookCellKindName;
	language: string;
	text: string;
	outputs: NotebookOutputSnapshot[];
	execution: vscode.NotebookCellExecutionSummary | null;
}

export interface NotebookCellSummary extends Omit<NotebookCellSnapshot, 'text' | 'outputs' | 'execution'> {
	preview: string;
	outputCount: number;
}

export interface NotebookOutputSnapshot {
	mime: string;
	data: unknown;
}

export interface InsertCellInput {
	index: number;
	text: string;
	kind?: NotebookCellKindName;
	language?: string;
}

export interface EditCellInput {
	index: number;
	text: string;
	kind?: NotebookCellKindName;
	language?: string;
}

export class NotebookSdkError extends Error {
	readonly code: 'invalid-index' | 'empty-notebook' | 'edit-failed' | 'execution-failed';

	constructor(code: NotebookSdkError['code'], message: string) {
		super(message);
		this.name = 'NotebookSdkError';
		this.code = code;
	}
}

export class NotebookSdk {
	constructor(readonly notebook: vscode.NotebookDocument) {}

	listCells(): NotebookCellSummary[] {
		return this.notebook.getCells().map((cell, index) => ({
			...this.toCellSnapshot(cell, index, false),
			preview: truncate(cell.document.getText().split(/\r?\n/, 1)[0], 240),
			outputCount: cell.outputs.length,
		}));
	}

	readCell(index: number, includeOutputs = true): NotebookCellSnapshot {
		const cell = this.cellAt(index);
		return this.toCellSnapshot(cell, index, includeOutputs);
	}

	async runCell(index: number, token?: vscode.CancellationToken): Promise<NotebookCellSnapshot> {
		const cell = this.cellAt(index);
		const previousEndTime = cell.executionSummary?.timing?.endTime;

		await vscode.commands.executeCommand('notebook.cell.execute', {
			document: this.notebook.uri,
			ranges: [{ start: index, end: index + 1 }],
			autoReveal: true,
		});

		await this.waitForExecution(cell, previousEndTime, token);
		return this.readCell(index);
	}

	async insertCell(input: InsertCellInput): Promise<NotebookCellSnapshot> {
		if (!Number.isInteger(input.index) || input.index < 0 || input.index > this.notebook.cellCount) {
			throw new NotebookSdkError('invalid-index', `Insert index must be between 0 and ${this.notebook.cellCount}.`);
		}

		const cell = this.toCellData(input.kind, input.language, input.text);
		await this.applyEdit(vscode.NotebookEdit.insertCells(input.index, [cell]));
		return this.readCell(input.index);
	}

	async editCell(input: EditCellInput): Promise<NotebookCellSnapshot> {
		this.cellAt(input.index);
		const cell = this.toCellData(input.kind, input.language, input.text, this.notebook.cellAt(input.index));
		await this.applyEdit(vscode.NotebookEdit.replaceCells(new vscode.NotebookRange(input.index, input.index + 1), [cell]));
		return this.readCell(input.index);
	}

	async deleteCell(index: number): Promise<NotebookCellSummary[]> {
		this.cellAt(index);
		await this.applyEdit(vscode.NotebookEdit.deleteCells(new vscode.NotebookRange(index, index + 1)));
		return this.listCells();
	}

	private cellAt(index: number): vscode.NotebookCell {
		if (!Number.isInteger(index) || index < 0 || index >= this.notebook.cellCount) {
			if (this.notebook.cellCount === 0) {
				throw new NotebookSdkError('empty-notebook', 'The notebook has no cells.');
			}
			throw new NotebookSdkError('invalid-index', `Cell index must be between 0 and ${this.notebook.cellCount - 1}.`);
		}

		return this.notebook.cellAt(index);
	}

	private toCellData(
		kind: NotebookCellKindName | undefined,
		language: string | undefined,
		text: string,
		currentCell?: vscode.NotebookCell,
	): vscode.NotebookCellData {
		const resolvedKind = kind === 'markdown'
			? vscode.NotebookCellKind.Markup
			: kind === 'code'
				? vscode.NotebookCellKind.Code
				: currentCell?.kind ?? vscode.NotebookCellKind.Code;
		const resolvedLanguage = language
			?? (resolvedKind === vscode.NotebookCellKind.Markup ? 'markdown' : currentCell?.document.languageId ?? 'plaintext');
		return new vscode.NotebookCellData(resolvedKind, text, resolvedLanguage);
	}

	private async applyEdit(edit: vscode.NotebookEdit): Promise<void> {
		const workspaceEdit = new vscode.WorkspaceEdit();
		workspaceEdit.set(this.notebook.uri, [edit]);
		if (!await vscode.workspace.applyEdit(workspaceEdit)) {
			throw new NotebookSdkError('edit-failed', 'VS Code rejected the notebook edit.');
		}
	}

	private async waitForExecution(
		cell: vscode.NotebookCell,
		previousEndTime: number | undefined,
		token?: vscode.CancellationToken,
	): Promise<void> {
		if (token?.isCancellationRequested) {
			throw new NotebookSdkError('execution-failed', 'Notebook execution was cancelled.');
		}
		if (cell.executionSummary?.timing?.endTime !== undefined
			&& cell.executionSummary.timing.endTime !== previousEndTime) {
			return;
		}

		await new Promise<void>((resolve, reject) => {
			let timer: ReturnType<typeof setTimeout>;
			const disposable = vscode.workspace.onDidChangeNotebookDocument(() => {
				const endTime = cell.executionSummary?.timing?.endTime;
				if (endTime !== undefined && endTime !== previousEndTime) {
					finish();
				}
			});
			const cancellation = token?.onCancellationRequested(() => {
				fail(new NotebookSdkError('execution-failed', 'Notebook execution was cancelled.'));
			});
			timer = setTimeout(() => {
				fail(new NotebookSdkError('execution-failed', 'Timed out waiting for notebook execution.'));
			}, 30000);

			function cleanup() {
				clearTimeout(timer);
				disposable.dispose();
				cancellation?.dispose();
			}
			function finish() {
				cleanup();
				resolve();
			}
			function fail(error: NotebookSdkError) {
				cleanup();
				reject(error);
			}
		});
	}

	private toCellSnapshot(cell: vscode.NotebookCell, index: number, includeOutputs: boolean): NotebookCellSnapshot {
		return {
			index,
			kind: cell.kind === vscode.NotebookCellKind.Markup ? 'markdown' : 'code',
			language: cell.document.languageId,
			text: truncate(cell.document.getText()),
			outputs: includeOutputs ? readOutputs(cell) : [],
			execution: cell.executionSummary ?? null,
		};
	}
}

export function readOutputs(cell: vscode.NotebookCell): NotebookOutputSnapshot[] {
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

export function truncate(value: string, limit = 12000): string {
	return value.length <= limit ? value : `${value.slice(0, limit)}\n...[truncated]`;
}
