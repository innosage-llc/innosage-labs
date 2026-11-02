"""Durability and fail-closed tests for Arnold Explore-style state core."""
import json
from pathlib import Path
import tempfile
import unittest

from server.store import StateStore, CorruptState

class StoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.p = Path(self.tmp.name)
    def tearDown(self):
        self.tmp.cleanup()

    def test_commit_restart(self):
        s = StateStore(self.p)
        value = s.write("recordings","r1",{"id":"r1","bytes":101})
        self.assertEqual(value["bytes"],101)
        s.snapshot()
        s.close()
        b = StateStore(self.p)
        self.assertEqual(b.get("recordings","r1")["bytes"],101)
        self.assertEqual(b.seq,1)
        b.close()

    def test_corrupt_journal_fails_closed(self):
        s=StateStore(self.p);s.write("recordings","r1",{"id":"r1"});s.close()
        f=self.p/"transactions.wal"
        with f.open("ab") as h:h.write(b"\x00\x00")
        with self.assertRaises(CorruptState): StateStore(self.p)

    def test_corrupt_snapshot_recovers_from_log(self):
        s=StateStore(self.p);s.write("recordings","r1",{"id":"r1"})
        s.snapshot()
        s.close()
        (self.p/"snapshot.json").write_text("{partial")
        b=StateStore(self.p)
        self.assertEqual(b.get("recordings","r1")["id"],"r1")
        b.close()

    def test_atomic_previous_snapshot_survives(self):
        s=StateStore(self.p);s.write("recordings","r1",{"id":"r1"})
        s.snapshot()
        s.write("recordings","r2",{"id":"r2"})
        s.snapshot()
        s.close()
        (self.p/"snapshot.json").write_bytes(b"truncated")
        b=StateStore(self.p)
        self.assertEqual(len(b.items("recordings")),2)
        b.close()

    def test_snapshot_not_canonical_if_tampered(self):
        s=StateStore(self.p);s.write("recordings","r1",{"id":"r1"})
        s.snapshot()
        s.close()
        path=self.p/"snapshot.json"
        data=json.loads(path.read_text())
        data["payload"]["state"]["recordings"]["r1"]["id"]="WRONG"
        path.write_text(json.dumps(data))
        b=StateStore(self.p)
        self.assertEqual(b.get("recordings","r1")["id"],"r1")
        b.close()

    def test_crash_after_fsync_before_memory_update(self):
        s=StateStore(self.p)
        def injected(_):
            raise RuntimeError("injected crash after durable write")
        s._apply=injected
        with self.assertRaises(RuntimeError):
            s.write("recordings","r1",{"id":"r1"})
        s.close()
        b=StateStore(self.p)
        self.assertEqual(b.get("recordings","r1")["id"],"r1")
        b.close()

    def test_partial_wal_append_poisons_owner_and_blocks_further_ack(self):
        from unittest.mock import patch
        import os
        s = StateStore(self.p)
        normal_write = os.write
        calls = 0
        def partial_then_fail(fd, payload):
            nonlocal calls
            calls += 1
            if calls == 1:
                return normal_write(fd, payload[:5])
            raise OSError("injected disk failure")
        with patch("server.store.os.write", side_effect=partial_then_fail):
            with self.assertRaises(OSError):
                s.write("recordings", "uncertain", {"id":"uncertain"})
        self.assertTrue(s.failed)
        with self.assertRaises(CorruptState):
            s.write("recordings", "ack", {"id":"ack"})
        with self.assertRaises(CorruptState):
            s.snapshot()
        s.close()
        with self.assertRaises(CorruptState):
            StateStore(self.p)

    def test_fsync_failure_poisons_owner(self):
        from unittest.mock import patch
        s = StateStore(self.p)
        with patch("server.store.os.fsync", side_effect=OSError("fsync failed")):
            with self.assertRaises(OSError):
                s.write("recordings", "unknown", {"id":"unknown"})
        with self.assertRaises(CorruptState):
            s.write("recordings", "next", {"id":"next"})
        s.close()

    def test_prevent_two_writers(self):
        s=StateStore(self.p)
        with self.assertRaises(RuntimeError):StateStore(self.p)
        s.close()

if __name__=="__main__":
    unittest.main()
