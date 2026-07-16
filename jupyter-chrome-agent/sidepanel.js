const statusElement = document.querySelector('#status');
const notebookNameElement = document.querySelector('#notebook-name');
const detailsElement = document.querySelector('#notebook-details');
const messagesElement = document.querySelector('#messages');
const form = document.querySelector('#chat-form');
const promptElement = document.querySelector('#prompt');

refreshTarget();

form.addEventListener('submit', event => {
  event.preventDefault();
  const prompt = promptElement.value.trim();
  if (!prompt) return;

  addMessage(prompt, 'user');
  addMessage('The Gemini and notebook tools will connect here next.', 'assistant');
  promptElement.value = '';
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'session' && changes.activeJupyterTarget) {
    renderTarget(changes.activeJupyterTarget.newValue ?? null);
  }
});

async function refreshTarget() {
  const response = await chrome.runtime.sendMessage({ type: 'get-target' });
  renderTarget(response?.target ?? null);
  if (response?.target?.notebookPath) {
    const contextResponse = await chrome.runtime.sendMessage({ type: 'get-notebook-context' });
    if (contextResponse?.ok) {
      detailsElement.textContent = `${response.target.origin} · ${contextResponse.context.path} · ${contextResponse.context.cellCount} cells`;
    }
  }
}

function renderTarget(target) {
  const ready = Boolean(target?.isNotebook);
  statusElement.textContent = ready ? 'Ready' : 'Not detected';
  statusElement.classList.toggle('ready', ready);
  notebookNameElement.textContent = ready
    ? target.notebookPath.split('/').pop()
    : 'No JupyterLab notebook detected.';
  detailsElement.textContent = ready
    ? `${target.origin} · ${target.notebookPath}`
    : 'Open a notebook at localhost to begin.';
}

function addMessage(text, role) {
  const message = document.createElement('div');
  message.className = `message ${role}`;
  message.textContent = text;
  messagesElement.append(message);
  message.scrollIntoView({ block: 'end' });
}
