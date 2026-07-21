(() => {
  if (window.top !== window) {
    return;
  }

  let host;
  let shadowRoot;
  let targetPath;
  let conversation = [];
  let conversationId;
  let conversationSummaries = [];
  let conversationTarget;
  let conversationTargetKey;
  let activeActivityMessage;
  let activeComposer;

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
        conversationId = undefined;
        await restoreConversation();
      }
    } else {
      host?.remove();
      host = undefined;
      shadowRoot = undefined;
      targetPath = undefined;
      activeActivityMessage = undefined;
      activeComposer = undefined;
      conversation = [];
      conversationId = undefined;
      conversationSummaries = [];
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
        .header-actions { display: flex; align-items: center; gap: 6px; }
        .panel-action, .close { display: grid; place-items: center; width: 28px; height: 28px; padding: 0; color: #d9e4f5; background: transparent; border: 0; border-radius: 8px; font-size: 18px; cursor: pointer; }
        .panel-action:hover, .close:hover { background: rgba(255,255,255,.1); }
        .history { position: absolute; top: 61px; right: 12px; z-index: 2; display: none; width: 245px; max-height: 260px; overflow: auto; padding: 6px; background: #172131; border: 1px solid #3b4c67; border-radius: 10px; box-shadow: 0 12px 28px rgba(0,0,0,.35); }
        .history.open { display: block; } .history-item { display: block; width: 100%; padding: 8px; overflow: hidden; color: #dce7f7; background: transparent; border: 0; border-radius: 7px; text-align: left; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; font-size: 11px; } .history-item:hover, .history-item.active { background: #26344a; }
        .body { display: flex; flex: 1; flex-direction: column; gap: 10px; padding: 12px; }
        .target { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px; overflow-wrap: anywhere; color: #9badc4; background: #101722; border-radius: 8px; font-size: 11px; }
        .agent-status { flex: none; color: #65d391; font-size: 10px; font-weight: 700; }
        .messages { display: flex; flex: 1; flex-direction: column; gap: 8px; overflow: auto; } .message { padding: 8px 9px; border-radius: 8px; color: #dce7f7; background: #26344a; font-size: 12px; line-height: 1.4; } .activity { color: #a9c2e3; background: #1b2a3e; font-style: italic; } .message.error { color: #ffd0d0; background: #4c252d; }
        form { display: flex; gap: 7px; } textarea { min-width: 0; flex: 1; resize: none; padding: 8px; color: #eef4ff; background: #101722; border: 1px solid #3b4c67; border-radius: 7px; font: 12px system-ui,sans-serif; } textarea:disabled { opacity: .6; }
        button.send { padding: 7px 9px; align-self: end; color: #07110b; background: #65d391; border: 0; border-radius: 7px; font-size: 11px; font-weight: 700; cursor: pointer; }
      </style>
      <button class="toggle" title="Open Jupyter Notebook Agent">NP</button>
      <section class="panel"><header class="header"><div><div class="title">NotebookPilot</div><div class="subtitle">Local JupyterLab assistant</div></div><button class="close" title="Close">×</button></header><div class="body"><div class="target">Active notebook: <span class="target-path"></span><span class="agent-status">Ready</span></div><div class="messages"><div class="message">I’m connected to this notebook. Tools will appear here next.</div></div><form><textarea rows="2" placeholder="Ask about this notebook..."></textarea><button class="send" type="submit">Send</button></form></div></section>
    `;
    const polish = document.createElement('style');
    polish.textContent = `
      .toggle { width: 54px !important; height: 54px !important; border: 3px solid rgba(255,255,255,.78) !important; border-radius: 18px !important; background: linear-gradient(135deg, #8bf0b0, #40c879) !important; box-shadow: 0 10px 28px rgba(65,205,126,.35) !important; transition: transform .18s ease, box-shadow .18s ease; }
      .toggle:hover { transform: translateY(-3px) rotate(-2deg); box-shadow: 0 15px 34px rgba(65,205,126,.48) !important; }
      .panel { width: min(380px, calc(100vw - 28px)) !important; height: min(540px, calc(100vh - 28px)) !important; border-radius: 20px !important; background: linear-gradient(160deg, #172235 0%, #0d1420 100%) !important; box-shadow: 0 18px 48px rgba(0,0,0,.42) !important; }
      .header { padding: 16px 17px !important; background: rgba(35,51,74,.88) !important; border-bottom: 1px solid rgba(127,157,196,.18); }
      .title { font-size: 14px !important; font-weight: 800 !important; } .subtitle { color: #9badc4 !important; font-size: 10px !important; }
        .panel-action, .close { color: #a9bad1 !important; background: rgba(255,255,255,.06) !important; border: 1px solid rgba(255,255,255,.1) !important; }
      .body { gap: 12px !important; padding: 14px !important; min-height: 0 !important; } .target { flex-shrink: 0; padding: 11px 12px !important; border: 1px solid rgba(127,157,196,.14) !important; border-radius: 12px !important; background: rgba(10,18,30,.72) !important; }
      .messages { gap: 9px !important; padding: 2px !important; min-height: 0 !important; overflow-y: auto !important; overscroll-behavior: contain; } .message { flex-shrink: 0; padding: 10px 11px !important; border: 1px solid rgba(127,157,196,.1); border-radius: 12px !important; line-height: 1.48 !important; } .message.user { align-self: flex-end; max-width: 88%; color: #082014 !important; background: #73e59e !important; border-color: transparent !important; } .message.error { color: #ffd0d0 !important; background: #4c252d !important; }
      form { flex-shrink: 0; } textarea { padding: 10px 11px !important; background: rgba(10,18,30,.86) !important; border-radius: 10px !important; outline: none; } textarea:focus { border-color: #73e59e !important; box-shadow: 0 0 0 3px rgba(115,229,158,.12); }
      button.send { padding: 8px 12px !important; background: #73e59e !important; border-radius: 10px !important; font-weight: 800 !important; }
    `;
    shadowRoot.append(polish);

    const panelHeader = shadowRoot.querySelector('.header');
    const headerActions = document.createElement('div');
    headerActions.className = 'header-actions';
    const newChat = document.createElement('button');
    newChat.className = 'panel-action new-chat';
    newChat.type = 'button';
    newChat.title = 'New conversation';
    newChat.setAttribute('aria-label', 'New conversation');
    newChat.textContent = '+';
    const historyToggle = document.createElement('button');
    historyToggle.className = 'panel-action history-toggle';
    historyToggle.type = 'button';
    historyToggle.title = 'Conversation history';
    historyToggle.setAttribute('aria-label', 'Conversation history');
    historyToggle.textContent = '\u23f2';
    headerActions.append(newChat, historyToggle);
    panelHeader.append(headerActions);
    const closeButton = shadowRoot.querySelector('.close');
    headerActions.append(closeButton);
    const historyMenu = document.createElement('div');
    historyMenu.className = 'history';
    historyMenu.setAttribute('role', 'menu');
    shadowRoot.querySelector('.panel').prepend(historyMenu);

    const toggle = shadowRoot.querySelector('.toggle');
    const panel = shadowRoot.querySelector('.panel');
    const close = shadowRoot.querySelector('.close');
    const header = shadowRoot.querySelector('.header');
    targetPath = shadowRoot.querySelector('.target-path');
    const form = shadowRoot.querySelector('form');
    const textarea = shadowRoot.querySelector('textarea');
    const messages = shadowRoot.querySelector('.messages');
    activeComposer = textarea;
    shadowRoot.querySelector('.close').textContent = 'x';
    shadowRoot.querySelector('.subtitle').textContent = 'Your local JupyterLab copilot';
    shadowRoot.querySelector('.messages .message').textContent = 'Connected to this notebook. Ask me to inspect, edit, or run a cell.';

    toggle.addEventListener('click', () => { panel.classList.add('open'); toggle.classList.add('hidden'); });
    close.addEventListener('click', () => { historyMenu.classList.remove('open'); panel.classList.remove('open'); toggle.classList.remove('hidden'); });
    newChat.addEventListener('click', () => startNewConversation());
    historyToggle.addEventListener('click', () => {
      historyMenu.classList.toggle('open');
      if (historyMenu.classList.contains('open')) renderHistory();
    });
    textarea.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        form.requestSubmit();
      }
    });
    form.addEventListener('submit', event => {
      event.preventDefault();
      const text = textarea.value.trim();
      if (!text) return;
      addMessage(text, 'user');
      activeActivityMessage = addMessage('Working on the notebook...', 'activity');
      activeComposer.disabled = true;
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
      return message;
    }

    function startNewConversation() {
      conversationId = crypto.randomUUID();
      conversation = [];
      renderConversation();
      historyMenu.classList.remove('open');
      void saveConversation();
    }

    function renderHistory() {
      historyMenu.replaceChildren();
      if (!conversationSummaries.length) {
        const empty = document.createElement('div');
        empty.className = 'history-item';
        empty.textContent = 'No conversations yet';
        historyMenu.append(empty);
        return;
      }
      conversationSummaries.forEach(item => {
        const button = document.createElement('button');
        button.className = `history-item${item.id === conversationId ? ' active' : ''}`;
        button.type = 'button';
        button.textContent = item.title || 'New conversation';
        button.addEventListener('click', () => selectConversation(item.id));
        historyMenu.append(button);
      });
    }

    function renderConversation() {
      const list = shadowRoot.querySelector('.messages');
      list.replaceChildren();
      if (!conversation.length) {
        const welcome = document.createElement('div');
        welcome.className = 'message';
        welcome.textContent = 'Connected to this notebook. Start a conversation.';
        list.append(welcome);
      } else {
        conversation.forEach(item => {
          const message = document.createElement('div');
          message.className = `message ${item.role}`;
          message.textContent = item.text;
          list.append(message);
        });
      }
      list.scrollTop = list.scrollHeight;
    }

    async function selectConversation(id) {
      const response = await chrome.runtime.sendMessage({ type: 'get-conversation', target: conversationTarget, conversationId: id });
      if (!response?.ok || !response.conversation) return;
      conversationId = response.conversation.id;
      conversation = response.conversation.messages || [];
      renderConversation();
      historyMenu.classList.remove('open');
    }
  }

  function renderAgentStatus(status) {
    const element = shadowRoot?.querySelector('.agent-status');
    if (!element) return;
    element.dataset.state = status.status;
    if (status.status === 'tool_call') {
      element.textContent = `Using ${status.tool}`;
    } else if (status.status === 'thinking') {
      element.textContent = 'Thinking';
    } else if (status.status === 'complete') {
      element.textContent = 'Ready';
    } else {
      element.textContent = status.message || 'Error';
    }
    if (activeActivityMessage) {
      activeActivityMessage.textContent = status.status === 'tool_call'
        ? `Using ${status.tool}...`
        : status.status === 'thinking'
          ? 'Thinking...'
          : status.status === 'error'
            ? (status.message || 'The agent encountered an error.')
            : 'Completed.';
      activeActivityMessage.classList.toggle('error', status.status === 'error');
    }
  }

  async function restoreConversation() {
    if (!conversationTarget || !shadowRoot) return;
    const response = await chrome.runtime.sendMessage({ type: 'get-conversations', target: conversationTarget });
    if (!response?.ok || !response.store) return;
    conversationSummaries = response.store.conversations || [];
    const selected = conversationSummaries[0];
    conversationId = selected?.id || crypto.randomUUID();
    conversation = selected?.messages || [];
    shadowRoot.querySelector('.messages').replaceChildren();
    if (conversation.length) {
      conversation.forEach(item => {
        const message = document.createElement('div');
        message.className = `message ${item.role}`;
        message.textContent = item.text;
        shadowRoot.querySelector('.messages').append(message);
      });
    } else {
      const welcome = document.createElement('div');
      welcome.className = 'message';
      welcome.textContent = 'Connected to this notebook. Start a conversation.';
      shadowRoot.querySelector('.messages').append(welcome);
    }
  }

  async function saveConversation() {
    if (!conversationTarget) return;
    const response = await chrome.runtime.sendMessage({ type: 'save-conversation', target: conversationTarget, conversationId, messages: conversation });
    if (response?.conversation) {
      const index = conversationSummaries.findIndex(item => item.id === response.conversation.id);
      if (index >= 0) conversationSummaries[index] = response.conversation;
      else conversationSummaries.unshift(response.conversation);
    }
  }

  async function getCurrentTarget() {
    const response = await chrome.runtime.sendMessage({ type: 'get-target' });
    return response?.target ?? null;
  }

  function getTargetKey(target) {
    if (!target) return undefined;
    return `${target.tabId}:${target.origin}:${target.localPath || target.notebookPath}`;
  }

  async function runAgent(prompt) {
    let response;
    try {
      response = await chrome.runtime.sendMessage({ type: 'agent-start', prompt, conversationId });
    } catch (error) {
      if (activeComposer) activeComposer.disabled = false;
      if (activeActivityMessage) activeActivityMessage.classList.add('error');
      addPanelMessage(error?.message || 'The extension service worker did not respond.', 'assistant');
      return;
    }
    if (activeComposer) activeComposer.disabled = false;
    if (!response?.ok) {
      if (activeActivityMessage) activeActivityMessage.classList.add('error');
      addPanelMessage(response?.error ?? 'The agent failed to respond.', 'assistant');
      return;
    }
    activeActivityMessage?.remove();
    activeActivityMessage = undefined;
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
