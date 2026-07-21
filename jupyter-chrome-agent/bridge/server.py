import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from notebook_parser import build_context as build_notebook_context, discover_server_root, find_notebooks, parse_notebook


class BridgeError(RuntimeError):
    def __init__(self, message, status=500, **details):
        super().__init__(message)
        self.status = status
        self.details = details


class BridgeHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        try:
            parsed = urlparse(self.path)
            query = parse_qs(parsed.query)
            if parsed.path == "/health":
                self.respond({"ok": True, "service": "jupyter-notebook-bridge"})
                return
            if parsed.path == "/api/notebook":
                self.handle_notebook(query.get("name", [""])[0])
                return
            if parsed.path == "/api/context":
                self.handle_context(query.get("name", [""])[0])
                return
            self.respond({"ok": False, "error": "Not found"}, 404)
        except BridgeError as error:
            self.respond({"ok": False, "error": str(error), **error.details}, error.status)
        except Exception as error:
            self.respond({"ok": False, "error": f"Bridge failure: {error}"}, 503)

    def handle_notebook(self, notebook_name: str):
        self.handle_resolved_notebook(notebook_name, use_context=False)

    def handle_context(self, notebook_name: str):
        self.handle_resolved_notebook(notebook_name, use_context=True)

    def handle_resolved_notebook(self, notebook_name: str, use_context: bool):
        if not notebook_name.lower().endswith(".ipynb"):
            self.respond({"ok": False, "error": "A .ipynb notebook name is required."}, 400)
            return

        try:
            root = discover_server_root()
        except Exception as error:
            raise BridgeError(f"Unable to discover the Jupyter server root: {error}", 503) from error
        matches = find_notebooks(root, Path(notebook_name).name)
        if not matches:
            raise BridgeError(f"Notebook not found under {root}.", 404)
        if len(matches) > 1:
            raise BridgeError(
                "Notebook name is ambiguous.",
                409,
                candidates=[str(path) for path in matches],
            )

        try:
            parsed = build_notebook_context(matches[0]) if use_context else parse_notebook(matches[0])
        except (OSError, ValueError) as error:
            raise BridgeError(f"Notebook could not be parsed: {error}", 422) from error
        self.respond({"ok": True, "notebook": parsed})

    def respond(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        print(format % args)


if __name__ == "__main__":
    print("Jupyter notebook bridge listening on http://127.0.0.1:8765")
    server = ThreadingHTTPServer(("127.0.0.1", 8765), BridgeHandler)
    server.daemon_threads = True
    server.allow_reuse_address = True
    try:
        server.serve_forever()
    finally:
        server.server_close()
