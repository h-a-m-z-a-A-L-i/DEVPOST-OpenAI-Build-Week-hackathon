import * as vscode from 'vscode';

export class NotebookPilotViewProvider implements vscode.WebviewViewProvider {
	private view?: vscode.WebviewView;

	resolveWebviewView(webviewView: vscode.WebviewView): void {
		this.view = webviewView;
		webviewView.webview.options = { enableScripts: true };
		webviewView.webview.html = this.getHtml(webviewView.webview);
		webviewView.webview.onDidReceiveMessage(message => {
			if (message.command === 'refresh') {
				this.refresh();
				return;
			}
			if (typeof message.command === 'string') {
				void vscode.commands.executeCommand(message.command);
			}
		});
		this.refresh();
	}

	refresh(): void {
		const notebook = vscode.window.activeNotebookEditor?.notebook;
		this.view?.webview.postMessage({
			type: 'status',
			uri: notebook?.uri.toString() ?? null,
			cellCount: notebook?.cellCount ?? 0,
		});
	}

	private getHtml(webview: vscode.Webview): string {
		const nonce = createNonce();
		return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
body { padding: 12px; color: var(--vscode-foreground); font-family: var(--vscode-font-family); font-size: 13px; }
h1 { font-size: 15px; margin: 0 0 12px; }
.status { color: var(--vscode-descriptionForeground); margin-bottom: 14px; word-break: break-word; }
button { width: 100%; margin: 4px 0; padding: 6px 8px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; cursor: pointer; }
button:hover { background: var(--vscode-button-hoverBackground); }
.secondary { color: var(--vscode-foreground); background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-widget-border); }
</style>
</head>
<body>
<h1>NotebookPilot</h1>
<div class="status" id="status">Open a notebook to begin.</div>
<button data-command="notebook-capability-probe.notebookAction">Choose an action</button>
<button data-command="notebook-capability-probe.runNotebookCell">Run selected cell</button>
<button data-command="notebook-capability-probe.insertNotebookCell">Insert cell</button>
<button data-command="notebook-capability-probe.editNotebookCell">Edit cell</button>
<button data-command="notebook-capability-probe.deleteNotebookCell">Delete cell</button>
<button class="secondary" id="refresh">Refresh status</button>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
const status = document.getElementById('status');
document.querySelectorAll('[data-command]').forEach(button => button.addEventListener('click', () => {
  vscode.postMessage({ command: button.dataset.command });
}));
document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ command: 'refresh' }));
window.addEventListener('message', event => {
  const value = event.data;
  status.textContent = value.uri ? value.uri + ' · ' + value.cellCount + ' cells' : 'Open a notebook to begin.';
});
</script>
</body>
</html>`;
	}
}

function createNonce(): string {
	return Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}
