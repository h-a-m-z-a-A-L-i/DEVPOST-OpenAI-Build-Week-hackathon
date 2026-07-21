"""Small SQLite checkpoint store for resumable notebook graph sessions."""

from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator


class CheckpointError(RuntimeError):
    pass


RUNTIME_ONLY_FIELDS = frozenset({"on_text", "result"})


class SQLiteCheckpointStore:
    def __init__(self, path: str | os.PathLike[str]) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._initialize()

    def save(self, thread_id: str, state: dict[str, Any]) -> None:
        thread_id = _required_thread_id(thread_id)
        if not isinstance(state, dict):
            raise CheckpointError("Checkpoint state must be an object.")
        payload = _serialize_state(state)
        now = time.time()
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO checkpoints(thread_id, updated_at, state_json)
                VALUES (?, ?, ?)
                ON CONFLICT(thread_id) DO UPDATE SET
                    updated_at = excluded.updated_at,
                    state_json = excluded.state_json
                """,
                (thread_id, now, payload),
            )

    def load(self, thread_id: str) -> dict[str, Any] | None:
        thread_id = _required_thread_id(thread_id)
        with self._connect() as connection:
            row = connection.execute(
                "SELECT state_json FROM checkpoints WHERE thread_id = ?",
                (thread_id,),
            ).fetchone()
        if row is None:
            return None
        try:
            state = json.loads(row[0])
        except (TypeError, json.JSONDecodeError) as error:
            raise CheckpointError("Stored checkpoint is invalid JSON.") from error
        if not isinstance(state, dict):
            raise CheckpointError("Stored checkpoint is not an object.")
        return state

    def delete(self, thread_id: str) -> None:
        thread_id = _required_thread_id(thread_id)
        with self._connect() as connection:
            connection.execute("DELETE FROM checkpoints WHERE thread_id = ?", (thread_id,))

    def prune(self, max_age_seconds: float) -> int:
        if max_age_seconds < 0:
            raise CheckpointError("Checkpoint age must not be negative.")
        cutoff = time.time() - max_age_seconds
        with self._connect() as connection:
            cursor = connection.execute("DELETE FROM checkpoints WHERE updated_at < ?", (cutoff,))
            return cursor.rowcount

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS checkpoints (
                    thread_id TEXT PRIMARY KEY,
                    updated_at REAL NOT NULL,
                    state_json TEXT NOT NULL
                )
                """
            )

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.path, timeout=5, isolation_level="IMMEDIATE")
        connection.row_factory = sqlite3.Row
        try:
            with connection:
                yield connection
        finally:
            connection.close()


def _required_thread_id(thread_id: str) -> str:
    if not isinstance(thread_id, str) or not thread_id.strip():
        raise CheckpointError("thread_id must be a non-empty string.")
    return thread_id.strip()


def _serialize_state(state: dict[str, Any]) -> str:
    persisted = {key: value for key, value in state.items() if key not in RUNTIME_ONLY_FIELDS}
    try:
        return json.dumps(persisted, ensure_ascii=False, separators=(",", ":"))
    except (TypeError, ValueError) as error:
        raise CheckpointError(f"Checkpoint state is not JSON serializable: {error}") from error
