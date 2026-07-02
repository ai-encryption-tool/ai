import json
import sqlite3
import uuid
from datetime import datetime
from pathlib import Path

from .models import Memory, MemoryCreate, MemoryUpdate, utc_now


class MemoryRepository:
    def __init__(self, sqlite_path: Path):
        self.sqlite_path = sqlite_path
        self.sqlite_path.parent.mkdir(parents=True, exist_ok=True)
        self.init_db()

    def connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.sqlite_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=5000")
        return conn

    def init_db(self) -> None:
        with self.connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS memories (
                    id TEXT PRIMARY KEY,
                    type TEXT NOT NULL,
                    content TEXT NOT NULL,
                    source TEXT NOT NULL,
                    confidence REAL NOT NULL,
                    approved INTEGER NOT NULL,
                    tags TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_memories_approved ON memories(approved)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type)")

    def _row_to_memory(self, row: sqlite3.Row) -> Memory:
        data = dict(row)
        data["approved"] = bool(data["approved"])
        data["tags"] = json.loads(data["tags"])
        data["created_at"] = datetime.fromisoformat(data["created_at"])
        data["updated_at"] = datetime.fromisoformat(data["updated_at"])
        return Memory(**data)

    def create(self, payload: MemoryCreate) -> Memory:
        now = utc_now()
        memory = Memory(
            id=str(uuid.uuid4()),
            created_at=now,
            updated_at=now,
            **payload.model_dump(),
        )
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO memories
                (id, type, content, source, confidence, approved, tags, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    memory.id,
                    memory.type.value,
                    memory.content,
                    memory.source.value,
                    memory.confidence,
                    int(memory.approved),
                    json.dumps(memory.tags),
                    memory.created_at.isoformat(),
                    memory.updated_at.isoformat(),
                ),
            )
        return memory

    def upsert_imported(self, memory: Memory) -> Memory:
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO memories
                (id, type, content, source, confidence, approved, tags, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    type=excluded.type,
                    content=excluded.content,
                    source=excluded.source,
                    confidence=excluded.confidence,
                    approved=excluded.approved,
                    tags=excluded.tags,
                    updated_at=excluded.updated_at
                """,
                (
                    memory.id,
                    memory.type.value,
                    memory.content,
                    memory.source.value,
                    memory.confidence,
                    int(memory.approved),
                    json.dumps(memory.tags),
                    memory.created_at.isoformat(),
                    memory.updated_at.isoformat(),
                ),
            )
        return memory

    def list(self, include_pending: bool = True) -> list[Memory]:
        query = "SELECT * FROM memories"
        params: tuple[object, ...] = ()
        if not include_pending:
            query += " WHERE approved = ?"
            params = (1,)
        query += " ORDER BY updated_at DESC"
        with self.connect() as conn:
            return [self._row_to_memory(row) for row in conn.execute(query, params).fetchall()]

    def get(self, memory_id: str) -> Memory | None:
        with self.connect() as conn:
            row = conn.execute("SELECT * FROM memories WHERE id = ?", (memory_id,)).fetchone()
        return self._row_to_memory(row) if row else None

    def update(self, memory_id: str, payload: MemoryUpdate) -> Memory | None:
        existing = self.get(memory_id)
        if not existing:
            return None
        updates = payload.model_dump(exclude_unset=True)
        if not updates:
            return existing
        merged = existing.model_dump()
        merged.update(updates)
        merged["updated_at"] = utc_now()
        memory = Memory(**merged)
        with self.connect() as conn:
            conn.execute(
                """
                UPDATE memories SET
                    type = ?,
                    content = ?,
                    source = ?,
                    confidence = ?,
                    approved = ?,
                    tags = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (
                    memory.type.value,
                    memory.content,
                    memory.source.value,
                    memory.confidence,
                    int(memory.approved),
                    json.dumps(memory.tags),
                    memory.updated_at.isoformat(),
                    memory.id,
                ),
            )
        return memory

    def delete(self, memory_id: str) -> bool:
        with self.connect() as conn:
            result = conn.execute("DELETE FROM memories WHERE id = ?", (memory_id,))
        return result.rowcount > 0

    def clear(self) -> None:
        with self.connect() as conn:
            conn.execute("DELETE FROM memories")
