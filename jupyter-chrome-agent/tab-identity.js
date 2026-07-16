export function parseJupyterTab(urlString) {
  if (!urlString) {
    return null;
  }

  let url;
  try {
    url = new URL(urlString);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' || url.hostname !== 'localhost' || url.port !== '8888') {
    return null;
  }

  const segments = url.pathname.split('/').filter(Boolean);
  if (segments[0] !== 'lab') {
    return null;
  }

  return {
    origin: url.origin,
    labPath: '/lab',
    notebookPath: null,
    isNotebook: false,
    url: `${url.origin}${url.pathname}`,
  };
}

export function isJupyterTab(urlString) {
  return parseJupyterTab(urlString) !== null;
}
