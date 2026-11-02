"""Single-owner in-memory store with durable, integrity-checked event log and snapshots.

The append-only journal is the full historical ledger in MVP: snapshots are
validated against it at load time. No external side effects are replayed.
"""
from __future__ import annotations
import copy
import fcntl
import hashlib
import json
import os
from pathlib import Path
import struct
import threading
import uuid

COLLECTIONS = ("recordings", "jobs", "intakes", "decisions", "packages",
               "approvals", "observations", "workspaces")
MAX_RECORD = 2_000_000
ZERO = "0" * 64

class CorruptState(RuntimeError):
    pass

def encode(data):
    return json.dumps(data, ensure_ascii=False, sort_keys=True,
                      separators=(",", ":"), allow_nan=False).encode()

def sha(data):
    return hashlib.sha256(data).hexdigest()

class StateStore:
    def __init__(self, directory):
        self.root = Path(directory).resolve()
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.journal = self.root / "transactions.wal"
        self.snap = self.root / "snapshot.json"
        self.guard = threading.RLock()
        self.owner = (self.root / ".owner.lock").open("a+b")
        try:
            fcntl.flock(self.owner.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            self.owner.close()
            raise RuntimeError("another process owns the state")
        self.state = {table: {} for table in COLLECTIONS}
        self.seq, self.head, self.closed = 0, ZERO, False
        self.failed = False
        try:
            self._recover()
        except BaseException:
            fcntl.flock(self.owner.fileno(), fcntl.LOCK_UN)
            self.owner.close()
            raise

    def _read_snapshot(self, path):
        if not path.exists():
            return None
        try:
            data = json.loads(path.read_bytes())
            payload = data["payload"]
            if sha(encode(payload)) != data["sha256"]:
                return None
            if payload["v"] != 1 or set(payload["state"]) != set(COLLECTIONS):
                return None
            return payload
        except (OSError, ValueError, KeyError, TypeError):
            return None

    def _apply(self, event):
        table, key = event["table"], event["key"]
        if table not in COLLECTIONS or not isinstance(key, str) or not key:
            raise CorruptState("invalid entity identity")
        if event["op"] == "put":
            if not isinstance(event["value"], dict):
                raise CorruptState("entity must be object")
            self.state[table][key] = copy.deepcopy(event["value"])
        elif event["op"] == "delete":
            self.state[table].pop(key, None)
        else:
            raise CorruptState("unknown event type")

    def _recover(self):
        snapshots = [self._read_snapshot(self.snap),
                     self._read_snapshot(self.root / "snapshot.prev")]
        checkpoints = {s["seq"]: s for s in snapshots if s is not None}
        # Durable first creation of the journal filename is a separate directory
        # fsync step from fsyncing its later transaction contents.
        was_absent = not self.journal.exists()
        self.journal.touch(exist_ok=True)
        if was_absent:
            directory_fd = os.open(self.root, os.O_RDONLY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
        with self.journal.open("rb") as f:
            while True:
                hdr = f.read(4)
                if not hdr:
                    break
                if len(hdr) != 4:
                    raise CorruptState("truncated length prefix")
                length = struct.unpack(">I", hdr)[0]
                if not 0 < length <= MAX_RECORD:
                    raise CorruptState("invalid frame length")
                frame = f.read(length)
                if len(frame) != length:
                    raise CorruptState("truncated transaction")
                try:
                    entry = json.loads(frame)
                    h = entry.pop("sha256")
                    if h != sha(encode(entry)):
                        raise CorruptState("record checksum mismatch")
                    if entry["v"] != 1 or entry["seq"] != self.seq + 1:
                        raise CorruptState("record version/sequence mismatch")
                    if entry["prev"] != self.head:
                        raise CorruptState("record chain mismatch")
                    self._apply(entry["event"])
                    self.seq, self.head = entry["seq"], h
                except (TypeError, ValueError, KeyError) as exc:
                    raise CorruptState("invalid log record") from exc
                checkpoint = checkpoints.get(self.seq)
                if checkpoint and (checkpoint["head"] != self.head
                                   or checkpoint["state"] != self.state):
                    raise CorruptState("snapshot differs from journal")
        if any(k > self.seq for k in checkpoints):
            raise CorruptState("snapshot ahead of log")
        if self.seq == 0 and checkpoints:
            raise CorruptState("snapshot without transaction history")

    def write(self, table, key, value):
        with self.guard:
            if self.closed:
                raise RuntimeError("closed store")
            if self.failed:
                raise CorruptState("state owner poisoned by prior uncertain WAL operation")
            if table not in COLLECTIONS or not isinstance(key, str) or not key:
                raise ValueError("invalid table/key")
            if not isinstance(value, dict):
                raise ValueError("entity must be object")
            event = {"op":"put", "table":table, "key":key, "value":copy.deepcopy(value)}
            record = {"v":1, "seq":self.seq + 1, "prev":self.head, "event":event}
            h = sha(encode(record))
            raw = encode({**record, "sha256":h})
            if len(raw) > MAX_RECORD:
                raise ValueError("oversized record")
            data = struct.pack(">I", len(raw)) + raw
            # An append may have partially happened even if write/fsync fails.
            # Never accept subsequent writes based on the previous in-memory head.
            # The operator must inspect/recover the journal; no blind truncation.
            self.failed = True
            fd = os.open(self.journal, os.O_APPEND | os.O_CREAT | os.O_WRONLY, 0o600)
            try:
                done = 0
                while done < len(data):
                    n = os.write(fd, data[done:])
                    if n <= 0:
                        raise OSError("incomplete log write")
                    done += n
                os.fsync(fd)
            finally:
                os.close(fd)
            # After durable append, reconstructing RAM is deterministic.
            # Keep failed=True until projection and head are consistent.
            self._apply(event)
            self.seq, self.head = record["seq"], h
            self.failed = False
            return copy.deepcopy(value)

    def get(self, table, key):
        with self.guard:
            return copy.deepcopy(self.state[table].get(key))

    def items(self, table):
        with self.guard:
            return copy.deepcopy(list(self.state[table].values()))

    def snapshot(self):
        with self.guard:
            if self.failed:
                raise CorruptState("cannot snapshot a poisoned state owner")
            payload = {"v":1, "seq":self.seq, "head":self.head, "state":self.state}
            blob = encode({"payload":payload, "sha256":sha(encode(payload))})
            temp = self.root / ("snapshot.tmp." + uuid.uuid4().hex)
            with temp.open("xb") as f:
                f.write(blob)
                f.flush()
                os.fsync(f.fileno())
            if self._read_snapshot(temp) is None:
                raise CorruptState("temporary snapshot failed validation")
            if self.snap.exists():
                os.replace(self.snap, self.root / "snapshot.prev")
            os.replace(temp, self.snap)
            fd = os.open(self.root, os.O_RDONLY)
            try:
                os.fsync(fd)
            finally:
                os.close(fd)
            return sha(blob)

    def close(self):
        if not self.closed:
            self.closed = True
            fcntl.flock(self.owner.fileno(), fcntl.LOCK_UN)
            self.owner.close()
