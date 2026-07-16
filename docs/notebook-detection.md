# Notebook Detection Rules

## Page Scope

The extension accepts only the configured local JupyterLab page:

```text
http://localhost:8888/lab
```

The URL is a page-scope check. It is not used to identify the active notebook.

## Active Notebook Source

The content script watches the JupyterLab dock panel:

```css
#jp-main-dock-panel .lm-DockPanel-tabBar
```

It finds tabs using `.lm-TabBar-tab` and selects the active tab when it has either:

```text
lm-mod-current
```

or:

```text
aria-selected="true"
```

The notebook name is read from:

```css
.lm-TabBar-tabLabel
```

Only labels ending in `.ipynb` are accepted.

## Target State

The service worker stores:

```json
{
  "tabId": 123,
  "origin": "http://localhost:8888",
  "notebookName": "Untitled.ipynb",
  "localPath": "C:\\Users\\Admin\\Untitled.ipynb",
  "resolveStatus": "resolved"
}
```

Possible resolution states are:

- `resolving`
- `resolved`
- `not-found`
- `ambiguous`
- `bridge-unavailable`

The target is updated only when the active notebook name changes. Repeated DOM mutations for the same notebook do not trigger repeated resolution requests.

## Local Resolution

The local bridge searches below the root reported by the running Jupyter server. It matches the tab-bar notebook name and returns the exact local path.

If multiple files have the same basename, the bridge returns all candidates and the target is marked `ambiguous`. The agent must not choose between candidates automatically.

## Authority

The JupyterLab frontend bridge remains authoritative for the exact active notebook path through `INotebookTracker.currentWidget.context.path`. The local bridge path is used for read-only parsing and context preparation.
