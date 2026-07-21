import atexit
import os
import socket
import subprocess
import sys
import time
from pathlib import Path


PROCESSES = []
STARTED = False
BRIDGE_PORT = 8765
RUNTIME_PORT = 8766


def _load_jupyter_server_extension(server_app):
    global STARTED
    if STARTED:
        return

    configured_root = os.getenv("NOTEBOOKPILOT_ROOT")
    project_root = (
        Path(configured_root).expanduser()
        if configured_root
        else Path(__file__).resolve().parents[2]
    )

    services = [
        (project_root / "bridge" / "server.py", BRIDGE_PORT),
        (project_root / "runtime" / "server.py", RUNTIME_PORT),
    ]
    for script, port in services:
        start_service(script, port, project_root)

    atexit.register(stop_services)
    STARTED = True
    server_app.log.info("NotebookPilot services initialized.")


def start_service(script: Path, port: int, project_root: Path):
    if is_port_open(port):
        return
    if not script.is_file():
        raise FileNotFoundError(f"NotebookPilot service was not found: {script}")

    log_directory = Path(os.getenv("TEMP", ".")) / "notebookpilot"
    log_directory.mkdir(parents=True, exist_ok=True)
    stdout = (log_directory / f"service-{port}.out.log").open("a", encoding="utf-8")
    stderr = (log_directory / f"service-{port}.err.log").open("a", encoding="utf-8")
    creation_flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    process = subprocess.Popen(
        [sys.executable, "-u", str(script)],
        cwd=str(project_root),
        stdout=stdout,
        stderr=stderr,
        creationflags=creation_flags,
    )
    PROCESSES.append((process, stdout, stderr))
    if not wait_for_port(port, process):
        stop_process(process, stdout, stderr)
        raise RuntimeError(f"NotebookPilot service failed to start on port {port}: {script}")


def is_port_open(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as connection:
        connection.settimeout(0.2)
        return connection.connect_ex(("127.0.0.1", port)) == 0


def wait_for_port(port: int, process, timeout: float = 5.0) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if is_port_open(port):
            return True
        if process.poll() is not None:
            return False
        time.sleep(0.1)
    return is_port_open(port)


def stop_services():
    for process, stdout, stderr in PROCESSES:
        stop_process(process, stdout, stderr)
    PROCESSES.clear()


def stop_process(process, stdout, stderr):
    try:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=3)
    finally:
        stdout.close()
        stderr.close()
