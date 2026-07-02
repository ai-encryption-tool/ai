from pathlib import Path

from fastapi import Depends, FastAPI, File, HTTPException, Query, Response, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware

from .ask import matching_keywords, synthesize_answer
from .auth import require_api_key
from .config import get_settings
from .database import MemoryRepository
from .importers import detect_and_extract
from .models import (
    ApprovalUpdate,
    AskMemoryRequest,
    AskMemoryResponse,
    ImportResponse,
    LoginRequest,
    LoginResponse,
    Memory,
    MemoryCreate,
    MemorySearchRequest,
    MemorySearchResult,
    MemoryUpdate,
    SuggestionRequest,
    SuggestionResponse,
)
from .suggestions import extract_memory_suggestions
from .vector_store import VectorStore

settings = get_settings()
repo = MemoryRepository(settings.sqlite_path)
vector_store = VectorStore(Path(settings.vector_path), settings.embedding_model, settings.embedding_mode)

app = FastAPI(title=settings.app_name)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def ranked_search(query: str, limit: int = 10, include_pending: bool = False) -> list[MemorySearchResult]:
    eligible = repo.list(include_pending=include_pending)
    if vector_store.mode == "sentence-transformers":
        ranked_ids = vector_store.search_ids(query, limit=limit, include_pending=include_pending)
        results = []
        for memory_id, score in ranked_ids:
            memory = repo.get(memory_id)
            if memory and (include_pending or memory.approved):
                results.append(
                    MemorySearchResult(
                        **memory.model_dump(),
                        score=score,
                        matching_keywords=matching_keywords(query, memory.content),
                    )
                )
        return results

    ranked = vector_store.rank_memories(query, eligible, limit=limit)
    return [
        MemorySearchResult(
            **memory.model_dump(),
            score=score,
            matching_keywords=matching_keywords(query, memory.content),
        )
        for memory, score in ranked
    ]


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/")
def root() -> dict[str, object]:
    return {
        "app": settings.app_name,
        "status": "ok",
        "message": "AI Memory Vault API is running. Open the dashboard on port 8081.",
        "dashboard": "http://localhost:8081",
        "docs": "/docs",
        "health": "/health",
        "extension_backend_url": "http://localhost:8000",
        "dev_proxy_backend_url": "http://localhost:8081",
    }


@app.post("/auth/login", response_model=LoginResponse)
def login(payload: LoginRequest) -> LoginResponse:
    # MVP-only local auth. Production needs password hashing, rate limits, CSRF strategy, and passkeys/OIDC.
    if payload.password != settings.local_password:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid password.")
    return LoginResponse(api_key=settings.api_key)


@app.post("/memories", response_model=Memory, dependencies=[Depends(require_api_key)])
def create_memory(payload: MemoryCreate) -> Memory:
    memory = repo.create(payload)
    vector_store.upsert(memory)
    return memory


@app.get("/memories", response_model=list[Memory], dependencies=[Depends(require_api_key)])
def list_memories(include_pending: bool = True) -> list[Memory]:
    return repo.list(include_pending=include_pending)


@app.get("/memories/search", response_model=list[MemorySearchResult], dependencies=[Depends(require_api_key)])
def search_memories(
    q: str = Query(min_length=1),
    limit: int = Query(default=10, ge=1, le=50),
    include_pending: bool = False,
) -> list[MemorySearchResult]:
    return ranked_search(q, limit=limit, include_pending=include_pending)


@app.post("/memory/search", response_model=list[MemorySearchResult], dependencies=[Depends(require_api_key)])
def search_memory_post(payload: MemorySearchRequest) -> list[MemorySearchResult]:
    return ranked_search(payload.query, limit=payload.limit, include_pending=not payload.approved_only)


@app.get("/memory/ask", response_model=AskMemoryResponse, dependencies=[Depends(require_api_key)])
def ask_memory_get(
    query: str = Query(min_length=1),
    limit: int = Query(default=6, ge=1, le=20),
    include_pending: bool = False,
) -> AskMemoryResponse:
    memories = ranked_search(query, limit=limit, include_pending=include_pending)
    return synthesize_answer(query, memories)


@app.post("/memory/ask", response_model=AskMemoryResponse, dependencies=[Depends(require_api_key)])
def ask_memory_post(payload: AskMemoryRequest) -> AskMemoryResponse:
    memories = ranked_search(payload.query, limit=payload.limit, include_pending=payload.include_pending)
    return synthesize_answer(payload.query, memories)


@app.post("/memory/suggestions", response_model=SuggestionResponse, dependencies=[Depends(require_api_key)])
def suggest_memories(payload: SuggestionRequest) -> SuggestionResponse:
    return SuggestionResponse(suggestions=extract_memory_suggestions(payload.text, payload.source))


@app.post("/memory/suggestions/approve", response_model=Memory, dependencies=[Depends(require_api_key)])
def approve_suggested_memory(payload: MemoryCreate) -> Memory:
    data = payload.model_dump()
    data["approved"] = False
    memory = repo.create(MemoryCreate(**data))
    vector_store.upsert(memory)
    return memory


@app.put("/memories/{memory_id}", response_model=Memory, dependencies=[Depends(require_api_key)])
def update_memory(memory_id: str, payload: MemoryUpdate) -> Memory:
    memory = repo.update(memory_id, payload)
    if not memory:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Memory not found.")
    vector_store.upsert(memory)
    return memory


@app.post("/memories/{memory_id}/approval", response_model=Memory, dependencies=[Depends(require_api_key)])
def approve_memory(memory_id: str, payload: ApprovalUpdate) -> Memory:
    memory = repo.update(memory_id, MemoryUpdate(approved=payload.approved))
    if not memory:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Memory not found.")
    vector_store.upsert(memory)
    return memory


@app.post("/memories/{memory_id}/approve", response_model=Memory, dependencies=[Depends(require_api_key)])
def approve_memory_shortcut(memory_id: str) -> Memory:
    return approve_memory(memory_id, ApprovalUpdate(approved=True))


@app.post("/memories/{memory_id}/reject", response_model=Memory, dependencies=[Depends(require_api_key)])
def reject_memory_shortcut(memory_id: str) -> Memory:
    return approve_memory(memory_id, ApprovalUpdate(approved=False))


@app.delete("/memories/{memory_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_api_key)])
def delete_memory(memory_id: str) -> Response:
    if not repo.delete(memory_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Memory not found.")
    vector_store.delete(memory_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/memories/export", response_model=list[Memory], dependencies=[Depends(require_api_key)])
def export_memories() -> list[Memory]:
    return repo.list(include_pending=True)


@app.post("/memories/import", response_model=list[Memory], dependencies=[Depends(require_api_key)])
def import_memories(memories: list[Memory]) -> list[Memory]:
    imported = [repo.upsert_imported(memory) for memory in memories]
    for memory in imported:
        vector_store.upsert(memory)
    return imported


@app.post("/imports", response_model=ImportResponse, dependencies=[Depends(require_api_key)])
async def import_center(file: UploadFile = File(...)) -> ImportResponse:
    payload = await file.read()
    try:
        detected_format, suggestions = detect_and_extract(file.filename or "upload", payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    memories = []
    for suggestion in suggestions:
        data = suggestion.model_dump(exclude={"reason"})
        data["approved"] = False
        memory = repo.create(MemoryCreate(**data))
        vector_store.upsert(memory)
        memories.append(memory)

    return ImportResponse(detected_format=detected_format, suggestions_created=len(memories), memories=memories)
