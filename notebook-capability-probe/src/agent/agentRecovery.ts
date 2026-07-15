import * as vscode from 'vscode';

export class NotebookCheckpoint {
	private constructor(
		private readonly notebook: vscode.NotebookDocument,
		private readonly cells: vscode.NotebookCellData[],
	) {}

	static capture(notebook: vscode.NotebookDocument): NotebookCheckpoint {
		const cells = notebook.getCells().map(cell => {
			const data = new vscode.NotebookCellData(cell.kind, cell.document.getText(), cell.document.languageId);
			data.metadata = { ...cell.metadata };
			data.outputs = [...cell.outputs];
			data.executionSummary = cell.executionSummary;
			return data;
		});
		return new NotebookCheckpoint(notebook, cells);
	}

	async restore(): Promise<boolean> {
		const edit = new vscode.WorkspaceEdit();
		edit.set(this.notebook.uri, [vscode.NotebookEdit.replaceCells(
			new vscode.NotebookRange(0, this.notebook.cellCount),
			this.cells,
		)]);
		return vscode.workspace.applyEdit(edit);
	}
}

export function isRetryableExecutionFailure(value: unknown): boolean {
	const message = String(value).toLowerCase();
	return message.includes('busy');
}
