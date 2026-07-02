# Migration 0001: Initial schema plus product endpoints

The current SQLite schema remains backward-compatible for Phase 1-9 product work.

Existing table:

```sql
CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT NOT NULL,
  confidence REAL NOT NULL,
  approved INTEGER NOT NULL,
  tags TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

No schema migration is required for:

- Ask Memory
- Memory suggestions
- Import Center
- Timeline
- Provenance display
- Retrieval reasons

These features use existing fields: `source`, `confidence`, `approved`, `tags`, `created_at`, and `updated_at`.

