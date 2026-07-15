import * as vscode from 'vscode';
import { registerHelloCommand } from './commands/hello';
import { registerNotebookToolCommands } from './commands/notebookTools';
import { registerNotebookAgent } from './commands/notebookAgent';
import { NotebookPilotViewProvider } from './ui/notebookPilotView';

export function activate(context: vscode.ExtensionContext) {

    console.log("Notebook Capability Probe activated.");

	const notebookPilotView = new NotebookPilotViewProvider();
	context.subscriptions.push(
		registerHelloCommand(),
		...registerNotebookToolCommands(),
		registerNotebookAgent(),
		vscode.window.registerWebviewViewProvider('notebookPilot.dashboard', notebookPilotView),
		vscode.window.onDidChangeActiveNotebookEditor(() => notebookPilotView.refresh())
	);

}

export function deactivate() {}
