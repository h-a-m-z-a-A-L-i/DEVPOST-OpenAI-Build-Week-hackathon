import sys
import tempfile
import unittest
from pathlib import Path


RUNTIME_PATH = Path(__file__).parents[1] / "runtime"
sys.path.insert(0, str(RUNTIME_PATH))

from checkpoint_store import CheckpointError, SQLiteCheckpointStore  # noqa: E402


class CheckpointStoreTests(unittest.TestCase):
    def test_save_load_update_and_delete(self):
        with tempfile.TemporaryDirectory() as directory:
            store = SQLiteCheckpointStore(Path(directory) / "state.sqlite3")
            store.save("thread-1", {"status": "waiting", "round": 1})
            self.assertEqual(store.load("thread-1")["round"], 1)

            store.save("thread-1", {"status": "complete", "round": 2})
            self.assertEqual(store.load("thread-1")["status"], "complete")
            store.delete("thread-1")
            self.assertIsNone(store.load("thread-1"))

    def test_runtime_only_fields_are_not_persisted(self):
        with tempfile.TemporaryDirectory() as directory:
            store = SQLiteCheckpointStore(Path(directory) / "state.sqlite3")
            store.save("thread-1", {"on_text": lambda value: value, "result": {"secret": True}, "status": "ready"})

            self.assertEqual(store.load("thread-1"), {"status": "ready"})

    def test_rejects_invalid_state_and_thread_ids(self):
        with tempfile.TemporaryDirectory() as directory:
            store = SQLiteCheckpointStore(Path(directory) / "state.sqlite3")
            with self.assertRaises(CheckpointError):
                store.save("", {})
            with self.assertRaises(CheckpointError):
                store.save("thread-1", {"bad": object()})
            with self.assertRaises(CheckpointError):
                store.prune(-1)

    def test_persists_across_store_instances(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "state.sqlite3"
            SQLiteCheckpointStore(path).save("thread-1", {"status": "waiting"})

            restored = SQLiteCheckpointStore(path)
            self.assertEqual(restored.load("thread-1")["status"], "waiting")


if __name__ == "__main__":
    unittest.main()
