import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from gemini_agent import GeminiError, NotebookAgent
from tool_contracts import NOTEBOOK_TOOLS


def load_dotenv() -> None:
    for path in (Path.cwd() / ".env", Path(__file__).resolve().parents[2] / ".env"):
        if not path.is_file():
            continue
        for raw_line in path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            name, value = line.split("=", 1)
            os.environ.setdefault(name.strip().strip("'\""), value.strip().strip("'\""))
        return


load_dotenv()
agent = NotebookAgent()


class RuntimeHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            self.respond({"ok": True, "service": "notebookpilot-gemini-runtime"})
            return
        self.respond({"ok": False, "error": "Not found"}, 404)

    def do_POST(self):
        try:
            body = self.read_body()
            if self.path == "/api/chat/start-stream":
                self.stream_agent(lambda emit: agent.start(
                    body["prompt"],
                    body["context"],
                    NOTEBOOK_TOOLS,
                    body.get("history", []),
                    on_text=lambda text: emit({"type": "text_delta", "text": text}),
                ))
                return
            if self.path == "/api/chat/continue-stream":
                self.stream_agent(lambda emit: agent.continue_session(
                    body["sessionId"],
                    body["toolResult"],
                    on_text=lambda text: emit({"type": "text_delta", "text": text}),
                ))
                return
            if self.path == "/api/chat/start":
                self.respond(agent.start(
                    body["prompt"],
                    body["context"],
                    NOTEBOOK_TOOLS,
                    body.get("history", []),
                ))
                return
            if self.path == "/api/chat/continue":
                self.respond(agent.continue_session(body["sessionId"], body["toolResult"]))
                return
            self.respond({"ok": False, "error": "Not found"}, 404)
        except (KeyError, TypeError, ValueError) as error:
            self.respond({"ok": False, "error": f"Invalid request: {error}"}, 400)
        except GeminiError as error:
            self.respond({"ok": False, "error": str(error)}, 502)
        except Exception as error:
            self.respond({"ok": False, "error": str(error)}, 500)

    def stream_agent(self, operation):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "close")
        self.end_headers()

        def emit(payload):
            body = f"data: {json.dumps(payload, ensure_ascii=False)}\n\n".encode("utf-8")
            self.wfile.write(body)
            self.wfile.flush()

        try:
            result = operation(emit)
            emit({"type": "result", "result": result})
        except GeminiError as error:
            emit({"type": "error", "error": str(error)})
        except Exception as error:
            emit({"type": "error", "error": str(error)})

    def read_body(self):
        length = int(self.headers.get("Content-Length", "0"))
        return json.loads(self.rfile.read(length))

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
    print("NotebookPilot Gemini runtime listening on http://127.0.0.1:8766")
    server = ThreadingHTTPServer(("127.0.0.1", 8766), RuntimeHandler)
    server.daemon_threads = True
    server.allow_reuse_address = True
    try:
        server.serve_forever()
    finally:
        server.server_close()
