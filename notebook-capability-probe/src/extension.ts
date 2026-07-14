import * as vscode from 'vscode';
import { registerHelloCommand } from './commands/hello';
import { registerNotebookToolCommands } from './commands/notebookTools';

export function activate(context: vscode.ExtensionContext) {

    console.log("Notebook Capability Probe activated.");

    context.subscriptions.push(
        registerHelloCommand(),
        ...registerNotebookToolCommands()
    );

}

export function deactivate() {}