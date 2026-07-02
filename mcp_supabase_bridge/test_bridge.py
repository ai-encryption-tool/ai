import asyncio
import json
import sys

from server import create_memory, decrypted_memories, search_memory


async def main() -> int:
    query = " ".join(sys.argv[1:]).strip() or "project memory"
    try:
      memories = await decrypted_memories(include_pending=True)
      print(f"Connected. Decrypted memories: {len(memories)}")
      if not memories:
          created = await create_memory(
              content="AI Memory Vault MCP bridge test memory.",
              type="note",
              source="mcp",
              approved=True,
              tags=["mcp", "test"],
              confidence=0.8,
          )
          print("Created test memory:")
          print(json.dumps(created, indent=2))
      results = await search_memory(query=query, limit=5, include_pending=True)
      print(f"Search query: {query}")
      print(json.dumps(results, indent=2))
      return 0
    except Exception as exc:
      print(f"Bridge test failed: {exc}")
      return 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
