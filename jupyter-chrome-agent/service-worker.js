import { parseJupyterTab } from './tab-identity.js';

const TARGET_KEY = 'activeJupyterTarget';
const SETTINGS_KEY = 'extensionSettings';
const MAX_HISTORY_MESSAGES = 100;

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!changeInfo.url && tab.status !== 'complete') {
    return;
  }

  await updateTargetForTab(tabId, tab.url);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const current = await getTarget();
  if (current?.tabId === tabId) {
    await chrome.storage.session.remove(TARGET_KEY);
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId);
  await updateTargetForTab(tabId, tab.url);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'get-target') {
    getTarget().then(target => sendResponse({ target }));
    return true;
  }

  if (message?.type === 'set-panel-tab') {
    chrome.sidePanel.setOptions({ tabId: message.tabId, enabled: true })
      .then(() => sendResponse({ ok: true }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === 'notebook-tab-state') {
    const tabId = _sender.tab?.id;
    if (tabId === undefined) {
      sendResponse({ ok: false, error: 'Missing sender tab.' });
      return false;
    }

    updateTargetFromNotebookTab(tabId, message.notebookName)
      .then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message?.type === 'get-notebook-context') {
    getNotebookContext()
      .then(context => sendResponse({ ok: true, context }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === 'get-extension-settings') {
    chrome.storage.local.get(SETTINGS_KEY)
      .then(result => sendResponse({ ok: true, settings: result[SETTINGS_KEY] ?? {} }));
    return true;
  }

  if (message?.type === 'save-extension-settings') {
    const settings = sanitizeSettings(message.settings);
    chrome.storage.local.set({ [SETTINGS_KEY]: settings })
      .then(() => sendResponse({ ok: true, settings }));
    return true;
  }

  if (message?.type === 'get-conversation') {
    const key = conversationKey(message.target);
    chrome.storage.local.get(key)
      .then(result => sendResponse({ ok: true, messages: result[key] ?? [] }));
    return true;
  }

  if (message?.type === 'save-conversation') {
    const key = conversationKey(message.target);
    const messages = sanitizeMessages(message.messages);
    chrome.storage.local.set({ [key]: messages })
      .then(() => sendResponse({ ok: true }));
    return true;
  }

  return false;
});

async function updateTargetForTab(tabId, urlString) {
  const identity = parseJupyterTab(urlString);
  if (!identity) {
    const current = await getTarget();
    if (current?.tabId === tabId) {
      await chrome.storage.session.remove(TARGET_KEY);
    }
    return;
  }
}

async function updateTargetFromNotebookTab(tabId, notebookName) {
  if (!notebookName) {
    const current = await getTarget();
    if (current?.tabId === tabId) {
      await chrome.storage.session.remove(TARGET_KEY);
    }
    return;
  }

  const tab = await chrome.tabs.get(tabId);
  const identity = parseJupyterTab(tab.url);
  if (!identity) {
    return;
  }

  const current = await getTarget();
  if (current?.tabId === tabId && current.notebookName === notebookName) {
    return;
  }

  const target = {
    tabId,
    ...identity,
    notebookName,
    notebookPath: notebookName,
    isNotebook: true,
    resolveStatus: 'resolving',
    detectedAt: new Date().toISOString(),
  };
  await chrome.storage.session.set({ [TARGET_KEY]: target });
  await chrome.sidePanel.setOptions({ tabId, enabled: true });
  await resolveNotebookTarget(target);
}

async function getTarget() {
  const result = await chrome.storage.session.get(TARGET_KEY);
  return result[TARGET_KEY] ?? null;
}

async function getNotebookContext() {
  const target = await getTarget();
  const notebookName = target?.notebookName ?? target?.notebookPath;
  if (!notebookName) {
    throw new Error('No active notebook has been identified.');
  }

  const url = `http://127.0.0.1:8765/api/context?name=${encodeURIComponent(notebookName)}`;
  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `Bridge request failed with status ${response.status}.`);
  }
  return payload.notebook;
}

function conversationKey(target) {
  const notebookName = target?.notebookName ?? target?.notebookPath;
  if (!target?.tabId || !target?.origin || !notebookName) {
    throw new Error('A complete notebook target is required.');
  }
  return `conversation:${target.tabId}:${target.origin}:${notebookName}`;
}

async function resolveNotebookTarget(target) {
  const notebookName = target.notebookName;
  const url = `http://127.0.0.1:8765/api/context?name=${encodeURIComponent(notebookName)}`;
  try {
    const response = await fetch(url);
    const payload = await response.json();
    const current = await getTarget();
    if (current?.tabId !== target.tabId || current.notebookName !== notebookName) {
      return;
    }

    const nextTarget = {
      ...current,
      localPath: payload.ok ? payload.notebook.path : undefined,
      resolveStatus: payload.ok
        ? 'resolved'
        : response.status === 409
          ? 'ambiguous'
          : 'not-found',
      candidates: payload.candidates ?? undefined,
    };
    await chrome.storage.session.set({ [TARGET_KEY]: nextTarget });
  } catch {
    const current = await getTarget();
    if (current?.tabId === target.tabId && current.notebookName === notebookName) {
      await chrome.storage.session.set({
        [TARGET_KEY]: { ...current, resolveStatus: 'bridge-unavailable' },
      });
    }
  }
}

function sanitizeSettings(settings) {
  if (!settings || typeof settings !== 'object') {
    return {};
  }
  return {
    compactMode: settings.compactMode === true,
    showToolActivity: settings.showToolActivity !== false,
  };
}

function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) {
    throw new Error('Conversation messages must be an array.');
  }
  return messages
    .filter(message => message && (message.role === 'user' || message.role === 'assistant'))
    .map(message => ({
      role: message.role,
      text: String(message.text ?? '').slice(0, 12000),
      createdAt: String(message.createdAt ?? new Date().toISOString()),
    }))
    .slice(-MAX_HISTORY_MESSAGES);
}
