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
			fileName: notebook ? notebook.uri.path.split('/').pop() : null,
			cellCount: notebook?.cellCount ?? 0,
		});
	}

	private getHtml(webview: vscode.Webview): string {
		const nonce = createNonce();
		return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style nonce="${nonce}">
* { box-sizing: border-box; }
body {
	padding: 0;
	margin: 0;
	color: var(--vscode-foreground);
	background: var(--vscode-sideBar-background);
	font-family: var(--vscode-font-family);
	font-size: 13px;
}
.shell { display: flex; flex-direction: column; gap: 14px; padding: 14px; }
.hero { display: flex; align-items: center; gap: 10px; padding-bottom: 4px; }
.mark {
	display: grid;
	place-items: center;
	width: 32px;
	height: 32px;
	border-radius: 8px;
	color: var(--vscode-button-foreground);
	background: var(--vscode-button-background);
	font-weight: 700;
}
h1 { font-size: 16px; line-height: 1.2; margin: 0; }
.subtitle { margin-top: 2px; color: var(--vscode-descriptionForeground); font-size: 12px; }
.panel {
	border: 1px solid var(--vscode-widget-border);
	background: var(--vscode-editorWidget-background);
	border-radius: 8px;
	padding: 12px;
}
.panel-title {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	margin-bottom: 10px;
	font-size: 11px;
	font-weight: 700;
	letter-spacing: .04em;
	text-transform: uppercase;
	color: var(--vscode-descriptionForeground);
}
.pill {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	min-height: 20px;
	padding: 2px 7px;
	border-radius: 999px;
	border: 1px solid var(--vscode-widget-border);
	color: var(--vscode-descriptionForeground);
	font-size: 11px;
	text-transform: none;
	letter-spacing: 0;
	white-space: nowrap;
}
.dot { width: 7px; height: 7px; border-radius: 50%; background: var(--vscode-testing-iconQueued); }
.dot.ready { background: var(--vscode-testing-iconPassed); }
.notebook-name { margin: 0 0 6px; font-weight: 600; word-break: break-word; }
.notebook-meta { color: var(--vscode-descriptionForeground); font-size: 12px; word-break: break-word; }
.stats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; }
.stat {
	min-width: 0;
	padding: 9px;
	border-radius: 6px;
	background: var(--vscode-editor-background);
	border: 1px solid var(--vscode-widget-border);
}
.stat-value { font-size: 18px; font-weight: 700; }
.stat-label { margin-top: 2px; color: var(--vscode-descriptionForeground); font-size: 11px; }
.actions { display: grid; gap: 8px; }
button {
	display: flex;
	align-items: center;
	justify-content: space-between;
	width: 100%;
	min-height: 34px;
	padding: 7px 9px;
	color: var(--vscode-button-foreground);
	background: var(--vscode-button-background);
	border: 1px solid transparent;
	border-radius: 6px;
	font: inherit;
	cursor: pointer;
	text-align: left;
}
button:hover { background: var(--vscode-button-hoverBackground); }
button.secondary {
	color: var(--vscode-foreground);
	background: var(--vscode-editor-background);
	border-color: var(--vscode-widget-border);
}
button.secondary:hover { background: var(--vscode-list-hoverBackground); }
.icon { color: inherit; opacity: .9; font-size: 14px; }
.timeline { display: grid; gap: 10px; }
.step { display: grid; grid-template-columns: 18px 1fr; gap: 8px; align-items: start; }
.step-marker {
	width: 18px;
	height: 18px;
	border-radius: 50%;
	border: 1px solid var(--vscode-widget-border);
	background: var(--vscode-editor-background);
}
.step.active .step-marker {
	border-color: var(--vscode-progressBar-background);
	box-shadow: 0 0 0 3px color-mix(in srgb, var(--vscode-progressBar-background) 22%, transparent);
}
.step-title { font-weight: 600; line-height: 18px; }
.step-copy { color: var(--vscode-descriptionForeground); font-size: 12px; line-height: 1.4; }
.hint { color: var(--vscode-descriptionForeground); font-size: 12px; line-height: 1.45; }
.empty { display: none; }
.is-empty .connected { display: none; }
.is-empty .empty { display: block; }
.recent-panel { gap: 2px; }
.recent-item { display: flex; align-items: center; justify-content: space-between; min-height: 28px; padding: 0 7px; border-radius: 4px; color: var(--vscode-foreground); }
.recent-item:hover { background: var(--vscode-list-hoverBackground); }
.recent-item span:last-child { color: var(--vscode-descriptionForeground); font-size: 11px; }
.actions button { min-height: 42px; }
.actions button.secondary { padding-left: 11px; }
</style>
</head>
<body class="is-empty">
<main class="shell">
	<header class="hero">
		<div class="mark">NP</div>
		<div>
			<h1>Hello! &#128075;</h1>
			<div class="subtitle">Autonomous AI for your notebooks</div>
		</div>
	</header>

	<button data-command="workbench.action.chat.open"><span>+ New Chat</span><span class="icon">Chat</span></button>

	<section class="panel">
		<div class="panel-title">
			<span>Notebook</span>
			<span class="pill"><span class="dot" id="statusDot"></span><span id="statusLabel">Not connected</span></span>
		</div>
		<div class="empty">
			<p class="notebook-name">Open a notebook to begin.</p>
			<div class="hint">NotebookPilot will show the active file, cell count, and available actions here.</div>
		</div>
		<div class="connected">
			<p class="notebook-name" id="notebookName">Notebook</p>
			<div class="notebook-meta" id="notebookUri"></div>
			<div class="stats">
				<div class="stat">
					<div class="stat-value" id="cellCount">0</div>
					<div class="stat-label">Cells</div>
				</div>
				<div class="stat">
					<div class="stat-value">Ready</div>
					<div class="stat-label">Agent state</div>
				</div>
			</div>
		</div>
	</section>

	<section class="panel recent-panel">
		<div class="panel-title">Recent Chats</div>
		<div class="recent-item"><span>Data analysis help</span><span>Now</span></div>
		<div class="recent-item"><span>Plotly graph issue</span><span>1h ago</span></div>
		<div class="recent-item"><span>Model evaluation</span><span>Yesterday</span></div>
	</section>

	<section class="panel">
		<div class="panel-title">Features</div>
		<div class="actions">
			<button data-command="notebook-capability-probe.notebookAction"><span>Explain Code</span><span class="icon">&gt;</span></button>
			<button class="secondary" data-command="notebook-capability-probe.runNotebookCell"><span>Analyze Output</span><span class="icon">Run</span></button>
			<button class="secondary" data-command="notebook-capability-probe.insertNotebookCell"><span>Generate Code</span><span class="icon">+</span></button>
			<button class="secondary" data-command="notebook-capability-probe.editNotebookCell"><span>Fix Errors</span><span class="icon">Edit</span></button>
			<button class="secondary" data-command="notebook-capability-probe.deleteNotebookCell"><span>Delete cell</span><span class="icon">Del</span></button>
			<button class="secondary" id="refresh"><span>Refresh status</span><span class="icon">Refresh</span></button>
		</div>
	</section>

	<section class="panel">
		<div class="panel-title">Agent Timeline</div>
		<div class="timeline">
			<div class="step active">
				<div class="step-marker"></div>
				<div>
					<div class="step-title">Plan</div>
					<div class="step-copy">The agent reads the active notebook before taking action.</div>
				</div>
			</div>
			<div class="step">
				<div class="step-marker"></div>
				<div>
					<div class="step-title">Execute</div>
					<div class="step-copy">Cell edits and runs are shown through VS Code progress.</div>
				</div>
			</div>
			<div class="step">
				<div class="step-marker"></div>
				<div>
					<div class="step-title">Verify</div>
					<div class="step-copy">NotebookPilot checks the notebook again after every change.</div>
				</div>
			</div>
		</div>
	</section>

	<section class="panel">
		<div class="panel-title">Chat</div>
		<div class="hint">Open VS Code Chat and mention <strong>@notebook</strong> with a notebook task, for example: inspect this notebook and summarize errors.</div>
	</section>
</main>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
const body = document.body;
const statusDot = document.getElementById('statusDot');
const statusLabel = document.getElementById('statusLabel');
const notebookName = document.getElementById('notebookName');
const notebookUri = document.getElementById('notebookUri');
const cellCount = document.getElementById('cellCount');
document.querySelectorAll('[data-command]').forEach(button => button.addEventListener('click', () => {
  vscode.postMessage({ command: button.dataset.command });
}));
document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ command: 'refresh' }));
window.addEventListener('message', event => {
  const value = event.data;
  const connected = Boolean(value.uri);
  body.classList.toggle('is-empty', !connected);
  statusDot.classList.toggle('ready', connected);
  statusLabel.textContent = connected ? 'Connected' : 'Not connected';
  if (connected) {
    notebookName.textContent = value.fileName || 'Active notebook';
    notebookUri.textContent = value.uri;
    cellCount.textContent = String(value.cellCount ?? 0);
  }
});
</script>
</body>
</html>`;
	}
}

function createNonce(): string {
	return Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}
