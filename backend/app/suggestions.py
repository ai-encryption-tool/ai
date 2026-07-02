import re

from .models import MemorySource, MemoryType, SuggestedMemory


PROJECT_PATTERN = re.compile(
    r"(?:I am|I'm|we are|we're|currently)?\s*(?:building|working on|creating|developing)\s+([A-Z][A-Za-z0-9 _-]{2,80})"
    r"(?:\s+(?:using|with)\s+([^.\n]+))?",
    re.IGNORECASE,
)
USES_PATTERN = re.compile(r"([A-Z][A-Za-z0-9 _-]{2,80})\s+(?:uses|is using|runs on|is built with)\s+([^.\n]+)", re.IGNORECASE)
PREFERENCE_PATTERN = re.compile(r"\b(?:I prefer|I like|I want|I usually|Please)\s+([^.\n]+)", re.IGNORECASE)
DECISION_PATTERN = re.compile(r"\b(?:decided|decision|we chose|I chose|use|using)\s+([^.\n]{8,160})", re.IGNORECASE)
GOAL_PATTERN = re.compile(r"\b(?:my goal is|goal is|I want to|we want to|need to)\s+([^.\n]+)", re.IGNORECASE)
SKILL_PATTERN = re.compile(r"\b(?:I know|I can|skilled in|experience with)\s+([^.\n]+)", re.IGNORECASE)


def _clean(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip(" .,:;-")


def _split_stack(value: str) -> list[str]:
    parts = re.split(r",| and | plus | with ", value, flags=re.IGNORECASE)
    return [_clean(part) for part in parts if len(_clean(part)) > 1]


def extract_memory_suggestions(text: str, source: MemorySource = MemorySource.manual) -> list[SuggestedMemory]:
    suggestions: list[SuggestedMemory] = []
    seen: set[tuple[str, str]] = set()

    def add(memory_type: MemoryType, content: str, confidence: float, tags: list[str], reason: str) -> None:
        content = _clean(content)
        if len(content) < 8:
            return
        key = (memory_type.value, content.lower())
        if key in seen:
            return
        seen.add(key)
        suggestions.append(
            SuggestedMemory(
                type=memory_type,
                content=content,
                source=source,
                confidence=confidence,
                approved=False,
                tags=tags,
                reason=reason,
            )
        )

    for match in PROJECT_PATTERN.finditer(text):
        project = _clean(match.group(1))
        stack = match.group(2)
        add(MemoryType.project, f"User is working on {project}.", 0.72, ["project"], "Detected active project wording.")
        if stack:
            for tech in _split_stack(stack):
                add(MemoryType.project, f"{project} uses {tech}.", 0.7, ["project", "tech-stack"], "Detected project technology stack.")

    for match in USES_PATTERN.finditer(text):
        project = _clean(match.group(1))
        for tech in _split_stack(match.group(2)):
            add(MemoryType.project, f"{project} uses {tech}.", 0.72, ["project", "tech-stack"], "Detected explicit project stack sentence.")

    for match in PREFERENCE_PATTERN.finditer(text):
        add(MemoryType.preference, f"User prefers {_clean(match.group(1))}.", 0.64, ["preference"], "Detected preference wording.")

    for match in GOAL_PATTERN.finditer(text):
        add(MemoryType.goal, f"User wants to {_clean(match.group(1))}.", 0.62, ["goal"], "Detected goal wording.")

    for match in SKILL_PATTERN.finditer(text):
        add(MemoryType.skill, f"User has experience with {_clean(match.group(1))}.", 0.58, ["skill"], "Detected skill wording.")

    for match in DECISION_PATTERN.finditer(text):
        phrase = _clean(match.group(1))
        if not any(word in phrase.lower() for word in ["the ", "a ", "to "]):
            add(MemoryType.decision, f"User decided to {phrase}.", 0.54, ["decision"], "Detected decision wording.")

    if not suggestions and text.strip():
        add(MemoryType.note, text.strip()[:500], 0.35, ["note"], "No structured pattern matched; saved as note candidate.")

    return suggestions[:20]

