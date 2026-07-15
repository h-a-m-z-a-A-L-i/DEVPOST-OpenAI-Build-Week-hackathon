import * as vscode from 'vscode';
import { agentLanguageModelTools } from './agentContracts';

export interface NotebookAgentModel {
	send(messages: vscode.LanguageModelChatMessage[], token: vscode.CancellationToken): Thenable<vscode.LanguageModelChatResponse>;
}

export class VsCodeAgentModel implements NotebookAgentModel {
	constructor(private readonly model: vscode.LanguageModelChat) {}

	send(messages: vscode.LanguageModelChatMessage[], token: vscode.CancellationToken): Thenable<vscode.LanguageModelChatResponse> {
		return this.model.sendRequest(messages, {
			justification: 'Operate on the active notebook according to the user request.',
			tools: agentLanguageModelTools,
		}, token);
	}
}
