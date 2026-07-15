import * as vscode from 'vscode';
import type { AgentToolInput, AgentToolName } from './agentContracts';

const maxCellTextLength = 100_000;

export type SafetyDecision = {
	allowed: boolean;
	reason?: string;
};

export function validateToolInput(name: AgentToolName, input: AgentToolInput, notebook: vscode.NotebookDocument): SafetyDecision {
	if (input.index !== undefined && (!Number.isInteger(input.index) || input.index < 0)) {
		return { allowed: false, reason: 'Cell indexes must be non-negative integers.' };
	}

	if (input.text !== undefined && input.text.length > maxCellTextLength) {
		return { allowed: false, reason: `Cell text exceeds the ${maxCellTextLength}-character safety limit.` };
	}

	if ((name === 'run_cell' || name === 'edit_cell' || name === 'delete_cell')
		&& (input.index === undefined || input.index >= notebook.cellCount)) {
		return { allowed: false, reason: `Cell index must be between 0 and ${Math.max(0, notebook.cellCount - 1)}.` };
	}

	if (name === 'insert_cell' && (input.index === undefined || input.index > notebook.cellCount)) {
		return { allowed: false, reason: `Insert index must be between 0 and ${notebook.cellCount}.` };
	}

	if ((name === 'insert_cell' || name === 'edit_cell') && input.text === undefined) {
		return { allowed: false, reason: 'Cell text is required.' };
	}

	return { allowed: true };
}

export async function confirmDestructiveAction(notebook: vscode.NotebookDocument, index: number): Promise<boolean> {
	const choice = await vscode.window.showWarningMessage(
		`Notebook agent wants to delete cell ${index} from ${notebook.uri.path}.`,
		{ modal: true },
		'Allow deletion',
	);
	return choice === 'Allow deletion';
}
