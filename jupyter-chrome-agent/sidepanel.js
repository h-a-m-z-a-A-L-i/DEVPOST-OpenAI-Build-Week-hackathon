const statusElement = document.querySelector('#status');
const notebookNameElement = document.querySelector('#notebook-name');
const detailsElement = document.querySelector('#notebook-details');
const messagesElement = document.querySelector('#messages');
const form = document.querySelector('#chat-form');
const promptElement = document.querySelector('#prompt');
const sendButton = form.querySelector('button');
let activeTarget;
let busy = false;

refreshTarget();

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  const prompt = promptElement.value.trim();
  if (!prompt) return;

  addMessage(prompt, 'user');
  promptElement.value = '';
  setBusy(true, 'Thinking');
  const response = await chrome.runtime.sendMessage({ type: 'agent-start', prompt });
  if (response?.ok) {
    addMessage(response.result?.text || 'The agent completed without a final response.', 'assistant');
  } else {
    addMessage(response?.error || 'The agent failed to respond.', 'assistant error');
  }
  setBusy(false, 'Ready');
});

chrome.runtime.onMessage.addListener(message => {
  if (message?.type !== 'agent-status') return;
  const label = message.status === 'tool_call'
    ? `Using ${message.tool}`
    : message.status === 'thinking'
      ? 'Thinking'
      : message.status === 'error'
        ? (message.message || 'Error')
        : 'Ready';
  setBusy(message.status === 'thinking' || message.status === 'tool_call', label);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'session' || !changes.activeJupyterTarget) return;
  activeTarget = changes.activeJupyterTarget.newValue ?? null;
  renderTarget(activeTarget);
  if (activeTarget) void restoreConversation(activeTarget);
});

async function refreshTarget() {
  const response = await chrome.runtime.sendMessage({ type: 'get-target' });
  activeTarget = response?.target ?? null;
  renderTarget(activeTarget);
  if (!activeTarget?.notebookPath) return;
  await restoreConversation(activeTarget);
  const contextResponse = await chrome.runtime.sendMessage({ type: 'get-notebook-context' });
  if (contextResponse?.ok) {
    detailsElement.textContent = `${activeTarget.origin} · ${contextResponse.context.path} · ${contextResponse.context.cellCount} cells`;
  }
}

function renderTarget(target) {
  const ready = Boolean(target?.isNotebook);
  statusElement.textContent = ready ? 'Ready' : 'Not detected';
  statusElement.classList.toggle('ready', ready && !busy);
  notebookNameElement.textContent = ready
    ? target.notebookPath.split('/').pop()
    : 'No JupyterLab notebook detected.';
  detailsElement.textContent = ready
    ? `${target.origin} · ${target.notebookPath}`
    : 'Open a notebook at localhost to begin.';
}

async function restoreConversation(target) {
  const response = await chrome.runtime.sendMessage({ type: 'get-conversation', target });
  if (!response?.ok || !Array.isArray(response.messages)) return;
  messagesElement.replaceChildren();
  response.messages.forEach(message => addMessage(message.text, message.role, false));
}

function addMessage(text, role, persist = true) {
  const message = document.createElement('div');
  message.className = `message ${role}`;
  message.textContent = text;
  messagesElement.append(message);
  message.scrollIntoView({ block: 'end' });
  if (persist && activeTarget) void saveConversation();
}

async function saveConversation() {
  const messages = Array.from(messagesElement.querySelectorAll('.message')).map(message => ({
    role: message.classList.contains('user') ? 'user' : 'assistant',
    text: message.textContent,
    createdAt: new Date().toISOString(),
  }));
  await chrome.runtime.sendMessage({ type: 'save-conversation', target: activeTarget, messages });
}

function setBusy(value, label) {
  busy = value;
  statusElement.textContent = label;
  statusElement.classList.toggle('ready', !value && Boolean(activeTarget?.isNotebook));
  promptElement.disabled = value;
  sendButton.disabled = value;
}
