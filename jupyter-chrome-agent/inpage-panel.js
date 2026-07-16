(() => {
  if (window.top !== window) {
    return;
  }

  let host;
  let shadowRoot;
  let targetPath;
  let conversation = [];
  let conversationTarget;
  let conversationTargetKey;

  const observer = new MutationObserver(() => updateActiveNotebook());
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'aria-selected'] });
  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== window.location.origin) {
      return;
    }
    if (event.data?.type === 'notebook-tool-result' && event.data.source === 'notebookpilot-jupyterlab') {
      chrome.runtime.sendMessage({ type: 'frontend-tool-result', result: event.data }).catch(() => {});
    }
  });

  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === 'frontend-tool-request') {
      window.postMessage(message.request, window.location.origin);
    }
    if (message?.type === 'agent-status') {
      renderAgentStatus(message);
    }
  });
  document.addEventListener('click', event => {
    if (event.target.closest('.lm-TabBar-tab')) {
      window.setTimeout(updateActiveNotebook, 0);
    }
  }, true);

  updateActiveNotebook();

  async function updateActiveNotebook() {
    const notebookName = findActiveNotebookName();
    chrome.runtime.sendMessage({ type: 'notebook-tab-state', notebookName }).catch(() => {});

    if (notebookName) {
      ensurePanel();
      targetPath.textContent = notebookName;
      const nextTarget = await getCurrentTarget();
      const nextTargetKey = getTargetKey(nextTarget);
      if (nextTarget && nextTargetKey !== conversationTargetKey) {
        conversationTargetKey = nextTargetKey;
        conversationTarget = nextTarget;
        conversation = [];
        await restoreConversation();
      }
    } else {
      host?.remove();
      host = undefined;
      shadowRoot = undefined;
      targetPath = undefined;
      conversation = [];
      conversationTarget = undefined;
      conversationTargetKey = undefined;
    }
  }

  function findActiveNotebookName() {
    const tabBar = document.querySelector('#jp-main-dock-panel .lm-DockPanel-tabBar');
    if (!tabBar) {
      return null;
    }

    const activeTab = Array.from(tabBar.querySelectorAll('.lm-TabBar-tab'))
      .find(tab => tab.classList.contains('lm-mod-current') || tab.getAttribute('aria-selected') === 'true');
    const label = activeTab?.querySelector('.lm-TabBar-tabLabel')?.textContent?.trim();
    return label && label.toLowerCase().endsWith('.ipynb') ? label : null;
  }

  function ensurePanel() {
    if (host) {
      return;
    }

    host = document.createElement('div');
    host.id = 'jupyter-agent-host';
    host.style.cssText = 'all:initial; position:fixed; inset:0; z-index:2147483647; pointer-events:none;';
    document.documentElement.append(host);
    shadowRoot = host.attachShadow({ mode: 'open' });
    shadowRoot.innerHTML = `
      <style>
        * { box-sizing: border-box; }
        .toggle, .panel { position: fixed; right: 22px; bottom: 22px; color: #eef4ff; background: #172131; border: 1px solid #3b4c67; box-shadow: 0 12px 35px rgba(0,0,0,.3); font-family: system-ui,sans-serif; pointer-events: auto; }
        .toggle { display: grid; place-items: center; width: 48px; height: 48px; padding: 0; border-radius: 50%; color: #07110b; background: #65d391; border: 0; font-size: 20px; font-weight: 800; cursor: pointer; }
        .panel { display: none; width: 320px; height: 410px; overflow: hidden; border-radius: 14px; flex-direction: column; }
        .panel.open { display: flex; } .toggle.hidden { display: none; }
        .header { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 14px; color: #d9e4f5; background: #202d40; cursor: move; user-select: none; }
        .title { font-size: 13px; font-weight: 700; } .subtitle { margin-top: 2px; color: #9badc4; font-size: 10px; }
        .close { padding: 2px 6px; color: #d9e4f5; background: transparent; border: 0; font-size: 18px; cursor: pointer; }
        .body { display: flex; flex: 1; flex-direction: column; gap: 10px; padding: 12px; }
        .target { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px; overflow-wrap: anywhere; color: #9badc4; background: #101722; border-radius: 8px; font-size: 11px; }
        .agent-status { flex: none; color: #65d391; font-size: 10px; font-weight: 700; }
        .messages { display: flex; flex: 1; flex-direction: column; gap: 8px; overflow: auto; } .message { padding: 8px 9px; border-radius: 8px; color: #dce7f7; background: #26344a; font-size: 12px; line-height: 1.4; }
        form { display: flex; gap: 7px; } textarea { min-width: 0; flex: 1; resize: none; padding: 8px; color: #eef4ff; background: #101722; border: 1px solid #3b4c67; border-radius: 7px; font: 12px system-ui,sans-serif; }
        button.send { padding: 7px 9px; align-self: end; color: #07110b; background: #65d391; border: 0; border-radius: 7px; font-size: 11px; font-weight: 700; cursor: pointer; }
      </style>
      <button class="toggle" title="Open Jupyter Notebook Agent">NP</button>
      <section class="panel"><header class="header"><div><div class="title">NotebookPilot</div><div class="subtitle">Local JupyterLab assistant</div></div><button class="close" title="Close">×</button></header><div class="body"><div class="target">Active notebook: <span class="target-path"></span><span class="agent-status">Ready</span></div><div class="messages"><div class="message">I’m connected to this notebook. Tools will appear here next.</div></div><form><textarea rows="2" placeholder="Ask about this notebook..."></textarea><button class="send" type="submit">Send</button></form></div></section>
    `;

    const toggle = shadowRoot.querySelector('.toggle');
    const panel = shadowRoot.querySelector('.panel');
    const close = shadowRoot.querySelector('.close');
    const header = shadowRoot.querySelector('.header');
    targetPath = shadowRoot.querySelector('.target-path');
    const form = shadowRoot.querySelector('form');
    const textarea = shadowRoot.querySelector('textarea');
    const messages = shadowRoot.querySelector('.messages');

    toggle.addEventListener('click', () => { panel.classList.add('open'); toggle.classList.add('hidden'); });
    close.addEventListener('click', () => { panel.classList.remove('open'); toggle.classList.remove('hidden'); });
    form.addEventListener('submit', event => {
      event.preventDefault();
      const text = textarea.value.trim();
      if (!text) return;
      addMessage(text, 'user');
      addMessage('Working on the notebook...', 'assistant');
      textarea.value = '';
      void runAgent(text);
    });

    let dragState;
    header.addEventListener('pointerdown', event => {
      const rect = panel.getBoundingClientRect();
      dragState = { offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
      header.setPointerCapture(event.pointerId);
    });
    header.addEventListener('pointermove', event => {
      if (!dragState) return;
      panel.style.left = `${Math.max(8, Math.min(window.innerWidth - panel.offsetWidth - 8, event.clientX - dragState.offsetX))}px`;
      panel.style.top = `${Math.max(8, Math.min(window.innerHeight - panel.offsetHeight - 8, event.clientY - dragState.offsetY))}px`;
      panel.style.right = 'auto'; panel.style.bottom = 'auto';
    });
    header.addEventListener('pointerup', () => { dragState = undefined; });

    function addMessage(text, role) {
      const message = document.createElement('div');
      message.className = `message ${role}`;
      message.textContent = text;
      messages.append(message);
      messages.scrollTop = messages.scrollHeight;
      conversation.push({ role, text, createdAt: new Date().toISOString() });
      void saveConversation();
    }
  }

  function renderAgentStatus(status) {
    const element = shadowRoot?.querySelector('.agent-status');
    if (!element) return;
    if (status.status === 'tool_call') {
      element.textContent = `Using ${status.tool}`;
    } else if (status.status === 'thinking') {
      element.textContent = 'Thinking';
    } else if (status.status === 'complete') {
      element.textContent = 'Ready';
    } else {
      element.textContent = status.message || 'Error';
    }
  }

  async function restoreConversation() {
    if (!conversationTarget || !shadowRoot) return;
    const response = await chrome.runtime.sendMessage({ type: 'get-conversation', target: conversationTarget });
    if (!response?.ok || !Array.isArray(response.messages)) return;

    conversation = response.messages;
    const messages = shadowRoot.querySelector('.messages');
    messages.replaceChildren();
    conversation.forEach(item => {
      const message = document.createElement('div');
      message.className = `message ${item.role}`;
      message.textContent = item.text;
      messages.append(message);
    });
    messages.scrollTop = messages.scrollHeight;
  }

  async function saveConversation() {
    if (!conversationTarget) return;
    await chrome.runtime.sendMessage({ type: 'save-conversation', target: conversationTarget, messages: conversation });
  }

  async function getCurrentTarget() {
    const response = await chrome.runtime.sendMessage({ type: 'get-target' });
    return response?.target ?? null;
  }

  function getTargetKey(target) {
    if (!target) return undefined;
    return `${target.tabId}:${target.origin}:${target.notebookPath}`;
  }

  async function runAgent(prompt) {
    const response = await chrome.runtime.sendMessage({ type: 'agent-start', prompt });
    if (!response?.ok) {
      addPanelMessage(response?.error ?? 'The agent failed to respond.', 'assistant');
      return;
    }
    const text = response.result?.text || 'The agent completed without a final response.';
    addPanelMessage(text, 'assistant');
  }

  function addPanelMessage(text, role) {
    if (!shadowRoot) return;
    const messages = shadowRoot.querySelector('.messages');
    const message = document.createElement('div');
    message.className = `message ${role}`;
    message.textContent = text;
    messages.append(message);
    messages.scrollTop = messages.scrollHeight;
    conversation.push({ role, text, createdAt: new Date().toISOString() });
    void saveConversation();
  }
})();
