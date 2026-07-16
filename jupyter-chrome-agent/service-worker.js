import { parseJupyterTab } from './tab-identity.js';

const TARGET_KEY = 'activeJupyterTarget';

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

  const target = {
    tabId,
    ...identity,
    notebookPath: notebookName,
    isNotebook: true,
    detectedAt: new Date().toISOString(),
  };
  await chrome.storage.session.set({ [TARGET_KEY]: target });
  await chrome.sidePanel.setOptions({ tabId, enabled: true });
}

async function getTarget() {
  const result = await chrome.storage.session.get(TARGET_KEY);
  return result[TARGET_KEY] ?? null;
}

async function getNotebookContext() {
  const target = await getTarget();
  if (!target?.notebookPath) {
    throw new Error('No active notebook has been identified.');
  }

  const url = `http://127.0.0.1:8765/api/notebook?name=${encodeURIComponent(target.notebookPath)}`;
  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `Bridge request failed with status ${response.status}.`);
  }
  return payload.notebook;
}
