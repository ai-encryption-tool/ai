import json
import zipfile
from io import BytesIO
from pathlib import Path

from .models import MemorySource, SuggestedMemory
from .suggestions import extract_memory_suggestions


def detect_and_extract(filename: str, payload: bytes) -> tuple[str, list[SuggestedMemory]]:
    suffix = Path(filename).suffix.lower()
    if suffix == ".zip":
        return _extract_zip(payload)
    if suffix == ".json":
        return _extract_json(filename, payload)
    if suffix in {".txt", ".md"}:
        text = payload.decode("utf-8", errors="ignore")
        return suffix.lstrip("."), extract_memory_suggestions(text, MemorySource.import_center)
    raise ValueError("Unsupported import format. Upload .zip, .json, .txt, or .md.")


def _extract_zip(payload: bytes) -> tuple[str, list[SuggestedMemory]]:
    with zipfile.ZipFile(BytesIO(payload)) as archive:
        names = archive.namelist()
        lower_map = {name.lower(): name for name in names}
        if "conversations.json" in lower_map:
            raw = archive.read(lower_map["conversations.json"])
            return _extract_chatgpt_json(raw)
        claude_name = next((name for name in names if "conversation" in name.lower() and name.lower().endswith(".json")), None)
        if claude_name:
            return _extract_claude_json(archive.read(claude_name))
        text_parts = []
        for name in names:
            if name.lower().endswith((".txt", ".md")):
                text_parts.append(archive.read(name).decode("utf-8", errors="ignore"))
        if text_parts:
            return "text_zip", extract_memory_suggestions("\n\n".join(text_parts), MemorySource.import_center)
    raise ValueError("Could not detect ChatGPT, Claude, or text content in ZIP.")


def _extract_json(filename: str, payload: bytes) -> tuple[str, list[SuggestedMemory]]:
    data = json.loads(payload.decode("utf-8", errors="ignore"))
    if isinstance(data, list) and data and isinstance(data[0], dict) and "mapping" in data[0]:
        return _extract_chatgpt_json(payload)
    if isinstance(data, list) and data and isinstance(data[0], dict) and ("chat_messages" in data[0] or "uuid" in data[0]):
        return _extract_claude_json(payload)
    if isinstance(data, list) and data and isinstance(data[0], dict) and "content" in data[0]:
        text = "\n\n".join(str(item.get("content", "")) for item in data)
        return "memory_json", extract_memory_suggestions(text, MemorySource.import_center)
    return "json", extract_memory_suggestions(json.dumps(data)[:100000], MemorySource.import_center)


def _extract_chatgpt_json(payload: bytes) -> tuple[str, list[SuggestedMemory]]:
    conversations = json.loads(payload.decode("utf-8", errors="ignore"))
    suggestions: list[SuggestedMemory] = []
    for conversation in conversations[:100]:
        title = conversation.get("title") or "Untitled ChatGPT conversation"
        messages = []
        for node in (conversation.get("mapping") or {}).values():
            message = node.get("message") if isinstance(node, dict) else None
            if not message:
                continue
            role = (message.get("author") or {}).get("role")
            if role not in {"user", "assistant"}:
                continue
            parts = (message.get("content") or {}).get("parts") or []
            text = "\n".join(part for part in parts if isinstance(part, str)).strip()
            if text:
                messages.append(f"{role}: {text}")
        source_text = f"ChatGPT conversation: {title}\n\n" + "\n\n".join(messages)
        suggestions.extend(extract_memory_suggestions(source_text[:20000], MemorySource.chatgpt))
    return "chatgpt_export", suggestions[:100]


def _extract_claude_json(payload: bytes) -> tuple[str, list[SuggestedMemory]]:
    conversations = json.loads(payload.decode("utf-8", errors="ignore"))
    suggestions: list[SuggestedMemory] = []
    for conversation in conversations[:100]:
        title = conversation.get("name") or conversation.get("title") or "Untitled Claude conversation"
        messages = conversation.get("chat_messages") or conversation.get("messages") or []
        text_parts = [f"Claude conversation: {title}"]
        for message in messages:
            content = message.get("text") or message.get("content") or ""
            if isinstance(content, list):
                content = "\n".join(str(part.get("text", "")) if isinstance(part, dict) else str(part) for part in content)
            if content:
                text_parts.append(str(content))
        suggestions.extend(extract_memory_suggestions("\n\n".join(text_parts)[:20000], MemorySource.claude))
    return "claude_export", suggestions[:100]

