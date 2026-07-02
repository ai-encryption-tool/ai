import os
from typing import Any

import httpx
from mcp.server.fastmcp import FastMCP

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")
API_KEY = os.getenv("API_KEY", "dev-local-api-key-change-me")

mcp = FastMCP("AI Memory Vault")


def headers() -> dict[str, str]:
    return {"X-API-Key": API_KEY}


@mcp.tool()
async def search_memory(query: str, include_pending: bool = False) -> list[dict[str, Any]]:
    """Search approved memories by semantic similarity."""
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.get(
            f"{BACKEND_URL}/memories/search",
            params={"q": query, "include_pending": include_pending},
            headers=headers(),
        )
        response.raise_for_status()
        return response.json()


@mcp.tool()
async def create_memory(content: str, type: str, source: str = "api") -> dict[str, Any]:
    """Create a pending memory for user review. It is not searchable until approved."""
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            f"{BACKEND_URL}/memories",
            json={"content": content, "type": type, "source": source, "approved": False},
            headers=headers(),
        )
        response.raise_for_status()
        return response.json()


@mcp.tool()
async def list_memories() -> list[dict[str, Any]]:
    """List all memories, including pending memories for review."""
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.get(f"{BACKEND_URL}/memories", headers=headers())
        response.raise_for_status()
        return response.json()


@mcp.tool()
async def update_memory(id: str, content: str | None = None, type: str | None = None, confidence: float | None = None) -> dict[str, Any]:
    """Update editable memory fields by id."""
    payload: dict[str, Any] = {}
    if content is not None:
        payload["content"] = content
    if type is not None:
        payload["type"] = type
    if confidence is not None:
        payload["confidence"] = confidence
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.put(f"{BACKEND_URL}/memories/{id}", json=payload, headers=headers())
        response.raise_for_status()
        return response.json()


@mcp.tool()
async def approve_memory(id: str) -> dict[str, Any]:
    """Approve a memory so it can be retrieved by default."""
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(f"{BACKEND_URL}/memories/{id}/approve", headers=headers())
        response.raise_for_status()
        return response.json()


@mcp.tool()
async def reject_memory(id: str) -> dict[str, Any]:
    """Mark a memory as pending/rejected so it is not retrieved by default."""
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(f"{BACKEND_URL}/memories/{id}/reject", headers=headers())
        response.raise_for_status()
        return response.json()


@mcp.tool()
async def ask_memory(query: str) -> dict[str, Any]:
    """Ask a question and synthesize an answer from approved memories."""
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            f"{BACKEND_URL}/memory/ask",
            json={"query": query},
            headers=headers(),
        )
        response.raise_for_status()
        return response.json()


@mcp.tool()
async def delete_memory(id: str) -> dict[str, str]:
    """Delete a memory by id."""
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.delete(f"{BACKEND_URL}/memories/{id}", headers=headers())
        response.raise_for_status()
        return {"status": "deleted", "id": id}


if __name__ == "__main__":
    mcp.run()
