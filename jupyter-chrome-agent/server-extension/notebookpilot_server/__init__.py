from .extension import _load_jupyter_server_extension


def _jupyter_server_extension_points():
    return [{"module": "notebookpilot_server"}]

__all__ = ["_jupyter_server_extension_points", "_load_jupyter_server_extension"]
