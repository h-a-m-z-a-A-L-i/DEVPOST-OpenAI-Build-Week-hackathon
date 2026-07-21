"""Probe the running local services before manual Chrome validation."""

import argparse
import json
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen


def request(url: str, method: str = "GET", payload: dict | None = None) -> tuple[int, dict]:
    body = json.dumps(payload).encode() if payload is not None else None
    request_data = Request(url, data=body, method=method, headers={"Content-Type": "application/json"})
    try:
        with urlopen(request_data, timeout=15) as response:
            return response.status, json.loads(response.read())
    except HTTPError as error:
        return error.code, json.loads(error.read())
    except URLError as error:
        return 0, {"ok": False, "error": str(error.reason)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--notebook", help="Active notebook filename to resolve through the bridge")
    parser.add_argument("--agent", action="store_true", help="Send a minimal request to the configured model")
    args = parser.parse_args()
    failures = []

    bridge_status, bridge_health = request("http://127.0.0.1:8765/health")
    runtime_status, runtime_health = request("http://127.0.0.1:8766/health")
    print(f"bridge health: HTTP {bridge_status} {bridge_health}")
    print(f"runtime health: HTTP {runtime_status} {runtime_health}")
    if bridge_status != 200 or not bridge_health.get("ok"):
        failures.append("bridge is unavailable")
    if runtime_status != 200 or not runtime_health.get("ok"):
        failures.append("runtime is unavailable")

    if args.notebook:
        status, payload = request(
            "http://127.0.0.1:8765/api/context?name=" + quote(args.notebook),
        )
        print(f"notebook context: HTTP {status} {payload.get('error', payload.get('notebook', {}).get('name'))}")
        if status != 200 or not payload.get("ok"):
            failures.append(f"notebook context failed with HTTP {status}")

    if args.agent and not failures:
        status, payload = request(
            "http://127.0.0.1:8766/api/chat/start",
            method="POST",
            payload={"prompt": "Reply with exactly: SMOKE_OK", "context": {"cells": []}, "history": []},
        )
        print(f"agent request: HTTP {status} {payload.get('text', payload.get('error', payload.get('status')))}")
        if status != 200 or payload.get("status") not in {"complete", "tool_call"}:
            failures.append(f"agent request failed with HTTP {status}")

    if failures:
        print("LIVE SMOKE FAILED")
        for failure in failures:
            print(f"- {failure}")
        return 1
    print("LIVE SMOKE PASSED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
