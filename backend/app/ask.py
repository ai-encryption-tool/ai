import re

from .models import AskMemoryResponse, MemorySearchResult


STOPWORDS = {
    "what",
    "which",
    "when",
    "where",
    "who",
    "why",
    "how",
    "the",
    "and",
    "for",
    "are",
    "you",
    "your",
    "mine",
    "about",
    "currently",
    "working",
    "am",
    "is",
    "on",
    "my",
    "i",
}


def matching_keywords(query: str, content: str) -> list[str]:
    query_terms = {term.lower() for term in re.findall(r"[A-Za-z0-9][A-Za-z0-9_-]+", query) if term.lower() not in STOPWORDS}
    content_terms = {term.lower() for term in re.findall(r"[A-Za-z0-9][A-Za-z0-9_-]+", content)}
    return sorted(query_terms & content_terms)[:8]


def synthesize_answer(query: str, memories: list[MemorySearchResult]) -> AskMemoryResponse:
    if not memories:
        return AskMemoryResponse(
            answer="I could not find approved memories that answer this yet.",
            memories=[],
        )

    project_like = [memory for memory in memories if memory.type.value in {"project", "projects"}]
    preference_like = [memory for memory in memories if "preference" in memory.type.value]

    if "project" in query.lower() and project_like:
        snippets = [_shorten(memory.content) for memory in project_like[:5]]
        answer = "Based on stored memories, you are connected to: " + "; ".join(snippets) + "."
    elif "prefer" in query.lower() and preference_like:
        snippets = [_shorten(memory.content) for memory in preference_like[:5]]
        answer = "Based on stored memories, your preferences include: " + "; ".join(snippets) + "."
    else:
        snippets = [_shorten(memory.content) for memory in memories[:5]]
        answer = "Based on stored memories: " + "; ".join(snippets) + "."

    return AskMemoryResponse(answer=answer, memories=memories)


def _shorten(content: str) -> str:
    first_line = content.strip().splitlines()[0]
    return first_line[:180].rstrip()

