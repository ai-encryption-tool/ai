import base64
import json
import os
from dataclasses import dataclass
from typing import Any

import httpx
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")
SUPABASE_EMAIL = os.getenv("SUPABASE_EMAIL", "")
SUPABASE_PASSWORD = os.getenv("SUPABASE_PASSWORD", "")
VAULT_PASSPHRASE = os.getenv("VAULT_PASSPHRASE", "")
DEFAULT_APPROVED = os.getenv("DEFAULT_APPROVED", "true").lower() == "true"
SUPABASE_SSL_VERIFY = os.getenv("SUPABASE_SSL_VERIFY", "true")

mcp = FastMCP("AI Memory Vault Supabase")


@dataclass
class Session:
    access_token: str
    refresh_token: str | None = None


_session: Session | None = None


def ssl_verify() -> bool | str:
    value = SUPABASE_SSL_VERIFY.strip()
    if value.lower() in {"0", "false", "no", "off"}:
        return False
    return value if value.lower() not in {"1", "true", "yes", "on"} else True


def require_config() -> None:
    missing = [
        name
        for name, value in {
            "SUPABASE_URL": SUPABASE_URL,
            "SUPABASE_ANON_KEY": SUPABASE_ANON_KEY,
            "SUPABASE_EMAIL": SUPABASE_EMAIL,
            "SUPABASE_PASSWORD": SUPABASE_PASSWORD,
            "VAULT_PASSPHRASE": VAULT_PASSPHRASE,
        }.items()
        if not value
    ]
    if missing:
        raise RuntimeError(f"Missing environment values: {', '.join(missing)}")


async def login() -> Session:
    global _session
    require_config()
    if _session:
        return _session
    async with httpx.AsyncClient(timeout=30, verify=ssl_verify()) as client:
        response = await client.post(
            f"{SUPABASE_URL}/auth/v1/token",
            params={"grant_type": "password"},
            headers={"apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json"},
            json={"email": SUPABASE_EMAIL, "password": SUPABASE_PASSWORD},
        )
        response.raise_for_status()
        data = response.json()
    _session = Session(access_token=data["access_token"], refresh_token=data.get("refresh_token"))
    return _session


async def auth_headers() -> dict[str, str]:
    session = await login()
    return {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {session.access_token}",
        "Content-Type": "application/json",
    }


def derive_key(passphrase: str, salt_b64: str) -> bytes:
    salt = base64.b64decode(salt_b64)
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=310000,
    )
    return kdf.derive(passphrase.encode("utf-8"))


def decrypt_row(row: dict[str, Any]) -> dict[str, Any]:
    key = derive_key(VAULT_PASSPHRASE, row["salt"])
    aesgcm = AESGCM(key)
    plaintext = aesgcm.decrypt(
        base64.b64decode(row["iv"]),
        base64.b64decode(row["ciphertext"]),
        None,
    )
    payload = json.loads(plaintext.decode("utf-8"))
    return {
        "id": row["id"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        **payload,
    }


def encrypt_payload(payload: dict[str, Any]) -> dict[str, Any]:
    salt = os.urandom(16)
    iv = os.urandom(12)
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=310000,
    )
    key = kdf.derive(VAULT_PASSPHRASE.encode("utf-8"))
    ciphertext = AESGCM(key).encrypt(iv, json.dumps(payload).encode("utf-8"), None)
    return {
        "ciphertext": base64.b64encode(ciphertext).decode("ascii"),
        "iv": base64.b64encode(iv).decode("ascii"),
        "salt": base64.b64encode(salt).decode("ascii"),
        "version": 1,
    }


async def encrypted_rows() -> list[dict[str, Any]]:
    headers = await auth_headers()
    async with httpx.AsyncClient(timeout=30, verify=ssl_verify()) as client:
        response = await client.get(
            f"{SUPABASE_URL}/rest/v1/memories",
            params={"select": "*", "order": "updated_at.desc"},
            headers=headers,
        )
        response.raise_for_status()
        return response.json()


async def decrypted_memories(include_pending: bool = False) -> list[dict[str, Any]]:
    memories = []
    for row in await encrypted_rows():
        memory = decrypt_row(row)
        if include_pending or memory.get("approved"):
            memories.append(memory)
    return memories


def score_memory(memory: dict[str, Any], query: str) -> float:
    terms = [term for term in query.lower().split() if len(term) > 2]
    if not terms:
        return 0.0
    haystack = " ".join(
        [
            str(memory.get("content", "")),
            str(memory.get("type", "")),
            str(memory.get("source", "")),
            " ".join(memory.get("tags") or []),
        ]
    ).lower()
    return sum(1 for term in terms if term in haystack) / len(terms)


@mcp.tool()
async def search_memory(query: str, limit: int = 5, include_pending: bool = False) -> list[dict[str, Any]]:
    """Search the user's encrypted AI Memory Vault. Decryption and search happen locally."""
    memories = await decrypted_memories(include_pending=include_pending)
    ranked = [
        {**memory, "score": score_memory(memory, query)}
        for memory in memories
    ]
    return [memory for memory in sorted(ranked, key=lambda item: item["score"], reverse=True) if memory["score"] > 0][:limit]


@mcp.tool()
async def list_memories(include_pending: bool = False, limit: int = 20) -> list[dict[str, Any]]:
    """List decrypted memories from the user's vault."""
    return (await decrypted_memories(include_pending=include_pending))[:limit]


@mcp.tool()
async def create_memory(
    content: str,
    type: str = "note",
    source: str = "mcp",
    approved: bool | None = None,
    tags: list[str] | None = None,
    confidence: float = 0.8,
) -> dict[str, Any]:
    """Create an encrypted memory in Supabase. Plaintext is encrypted locally before upload."""
    payload = {
        "type": type,
        "content": content,
        "source": source,
        "confidence": confidence,
        "approved": DEFAULT_APPROVED if approved is None else approved,
        "tags": tags or ["mcp"],
    }
    encrypted = encrypt_payload(payload)
    headers = await auth_headers()
    headers["Prefer"] = "return=representation"
    async with httpx.AsyncClient(timeout=30, verify=ssl_verify()) as client:
        response = await client.post(
            f"{SUPABASE_URL}/rest/v1/memories",
            params={"select": "*"},
            headers=headers,
            json=encrypted,
        )
        response.raise_for_status()
        row = response.json()[0]
    return decrypt_row(row)


@mcp.tool()
async def approve_memory(id: str) -> dict[str, Any]:
    """Approve an encrypted memory for retrieval."""
    for memory in await decrypted_memories(include_pending=True):
        if memory["id"] == id:
            payload = {key: value for key, value in memory.items() if key not in {"id", "created_at", "updated_at"}}
            payload["approved"] = True
            encrypted = encrypt_payload(payload)
            headers = await auth_headers()
            headers["Prefer"] = "return=representation"
            async with httpx.AsyncClient(timeout=30, verify=ssl_verify()) as client:
                response = await client.patch(
                    f"{SUPABASE_URL}/rest/v1/memories",
                    params={"id": f"eq.{id}", "select": "*"},
                    headers=headers,
                    json=encrypted,
                )
                response.raise_for_status()
                return decrypt_row(response.json()[0])
    raise ValueError(f"Memory not found: {id}")


if __name__ == "__main__":
    mcp.run()
