import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from notebook_parser import build_context as build_notebook_context, discover_server_root, find_notebooks, parse_notebook


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
        except Exception as error:
            self.respond({"ok": False, "error": str(error)}, 500)

    def handle_notebook(self, notebook_name: str):
        self.handle_resolved_notebook(notebook_name, use_context=False)

    def handle_context(self, notebook_name: str):
        self.handle_resolved_notebook(notebook_name, use_context=True)

    def handle_resolved_notebook(self, notebook_name: str, use_context: bool):
        if not notebook_name.lower().endswith(".ipynb"):
            self.respond({"ok": False, "error": "A .ipynb notebook name is required."}, 400)
            return

        root = discover_server_root()
        matches = find_notebooks(root, Path(notebook_name).name)
        if not matches:
            self.respond({"ok": False, "error": f"Notebook not found under {root}."}, 404)
            return
        if len(matches) > 1:
            self.respond({
                "ok": False,
                "error": "Notebook name is ambiguous.",
                "candidates": [str(path) for path in matches],
            }, 409)
            return

        parsed = build_notebook_context(matches[0]) if use_context else parse_notebook(matches[0])
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
    ThreadingHTTPServer(("127.0.0.1", 8765), BridgeHandler).serve_forever()
