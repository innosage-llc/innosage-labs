"""SQLite is the authority for business outcomes, not the agent's compressed context."""
from __future__ import annotations
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock

BUCKETS = {"scenario", "strategy", "intakes", "tasks", "rounds", "artifacts",
           "approvals", "publications", "feedback", "revisions", "bots", "sdk_probes"}

def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()

def pack(value: dict) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))

class Store:
    def __init__(self, db_path: str | Path):
        self.path = Path(db_path)
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.lock = RLock()
        with self._connect() as con:
            con.executescript("""
            CREATE TABLE IF NOT EXISTS objects(
                bucket TEXT NOT NULL,id TEXT NOT NULL,payload TEXT NOT NULL,
                updated TEXT NOT NULL,PRIMARY KEY(bucket,id));
            CREATE TABLE IF NOT EXISTS events(
                seq INTEGER PRIMARY KEY AUTOINCREMENT,timestamp TEXT NOT NULL,
                type TEXT NOT NULL,actor TEXT NOT NULL,object_id TEXT,payload TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS event_keys(
                id TEXT PRIMARY KEY,timestamp TEXT NOT NULL);
            """)

    def _connect(self):
        con = sqlite3.connect(str(self.path), timeout=20)
        con.row_factory = sqlite3.Row
        con.execute("PRAGMA journal_mode=WAL")
        con.execute("PRAGMA synchronous=FULL")
        con.execute("PRAGMA busy_timeout=20000")
        return con

    def get(self, bucket: str, key: str):
        self._check(bucket)
        with self.lock, self._connect() as con:
            row = con.execute("SELECT payload FROM objects WHERE bucket=? AND id=?",
                              (bucket,key)).fetchone()
            return json.loads(row["payload"]) if row else None

    def all(self, bucket: str) -> list[dict]:
        self._check(bucket)
        with self.lock, self._connect() as con:
            rows = con.execute("SELECT payload FROM objects WHERE bucket=? ORDER BY updated,id",
                               (bucket,)).fetchall()
            return [json.loads(row["payload"]) for row in rows]

    def put(self,bucket: str,key: str,value: dict,*,actor="system",action="record.updated"):
        self._check(bucket)
        stamp=utcnow()
        with self.lock,self._connect() as con:
            con.execute("""INSERT INTO objects(bucket,id,payload,updated) VALUES(?,?,?,?)
                ON CONFLICT(bucket,id) DO UPDATE SET payload=excluded.payload,
                updated=excluded.updated""",(bucket,key,pack(value),stamp))
            con.execute("INSERT INTO events(timestamp,type,actor,object_id,payload) VALUES(?,?,?,?,?)",
                        (stamp,action,actor,key,pack({"bucket":bucket,"id":key})))
        return value

    def once(self,bucket: str,key: str,value: dict,*,event_key: str,
             event_type: str,actor="system") -> bool:
        """Claim event key and persist resulting object in the same transaction."""
        self._check(bucket)
        stamp=utcnow()
        with self.lock,self._connect() as con:
            claimed=con.execute("INSERT OR IGNORE INTO event_keys(id,timestamp) VALUES(?,?)",
                                (event_key,stamp)).rowcount
            if not claimed:
                return False
            con.execute("""INSERT INTO objects(bucket,id,payload,updated) VALUES(?,?,?,?)
                ON CONFLICT(bucket,id) DO UPDATE SET payload=excluded.payload,
                updated=excluded.updated""",(bucket,key,pack(value),stamp))
            con.execute("INSERT INTO events(timestamp,type,actor,object_id,payload) VALUES(?,?,?,?,?)",
                        (stamp,event_type,actor,key,
                         pack({"bucket":bucket,"id":key,"event_key":event_key})))
        return True

    def audit(self,kind: str,actor: str,payload: dict,object_id=""):
        with self.lock,self._connect() as con:
            con.execute("INSERT INTO events(timestamp,type,actor,object_id,payload) VALUES(?,?,?,?,?)",
                        (utcnow(),kind,actor,object_id,pack(payload)))

    def events(self,limit=80):
        with self.lock,self._connect() as con:
            rows=con.execute("SELECT * FROM events ORDER BY seq DESC LIMIT ?",
                             (min(limit,200),)).fetchall()
            return [{**dict(row),"payload":json.loads(row["payload"])} for row in rows]

    def clear_synthetic_demo(self):
        """Only this isolated #27 database: never touch #11 state or file tree."""
        with self.lock,self._connect() as con:
            con.execute("DELETE FROM objects")
            con.execute("DELETE FROM events")
            con.execute("DELETE FROM event_keys")

    @staticmethod
    def _check(bucket):
        if bucket not in BUCKETS:
            raise ValueError("unsupported bucket")
