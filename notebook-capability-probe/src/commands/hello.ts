import * as vscode from 'vscode';

export function registerHelloCommand() {

    return vscode.commands.registerCommand(
        'notebook-capability-probe.helloWorld',
        () => {

            vscode.window.showInformationMessage(
                "Notebook Capability Probe is running!"
            );

        }
    );

}