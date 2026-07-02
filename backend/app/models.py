from datetime import datetime, timezone
from enum import Enum
from pydantic import BaseModel, Field


class MemoryType(str, Enum):
    projects = "projects"
    preference = "preference"
    preferences = "preferences"
    project = "project"
    person = "person"
    people = "people"
    goal = "goal"
    goals = "goals"
    decision = "decision"
    decisions = "decisions"
    fact = "fact"
    facts = "facts"
    skill = "skill"
    skills = "skills"
    note = "note"
    notes = "notes"
    writing_style = "writing_style"
    private_note = "private_note"


class MemorySource(str, Enum):
    manual = "manual"
    chatgpt = "chatgpt"
    claude = "claude"
    gemini = "gemini"
    copilot = "copilot"
    cursor = "cursor"
    extension = "extension"
    browser_extension = "browser_extension"
    import_center = "import_center"
    api = "api"


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class MemoryBase(BaseModel):
    type: MemoryType
    content: str = Field(min_length=1)
    source: MemorySource = MemorySource.manual
    confidence: float = Field(default=0.8, ge=0.0, le=1.0)
    approved: bool = False
    tags: list[str] = Field(default_factory=list)


class MemoryCreate(MemoryBase):
    pass


class MemoryUpdate(BaseModel):
    type: MemoryType | None = None
    content: str | None = Field(default=None, min_length=1)
    source: MemorySource | None = None
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    approved: bool | None = None
    tags: list[str] | None = None


class ApprovalUpdate(BaseModel):
    approved: bool


class Memory(MemoryBase):
    id: str
    created_at: datetime
    updated_at: datetime


class MemorySearchResult(Memory):
    score: float
    matching_keywords: list[str] = Field(default_factory=list)


class AskMemoryRequest(BaseModel):
    query: str = Field(min_length=1)
    limit: int = Field(default=6, ge=1, le=20)
    include_pending: bool = False


class MemorySearchRequest(BaseModel):
    query: str = Field(min_length=1)
    limit: int = Field(default=5, ge=1, le=50)
    approved_only: bool = True


class AskMemoryResponse(BaseModel):
    answer: str
    memories: list[MemorySearchResult]


class SuggestionRequest(BaseModel):
    text: str = Field(min_length=1)
    source: MemorySource = MemorySource.manual


class SuggestedMemory(BaseModel):
    type: MemoryType
    content: str
    source: MemorySource = MemorySource.manual
    confidence: float = Field(default=0.65, ge=0.0, le=1.0)
    approved: bool = False
    tags: list[str] = Field(default_factory=list)
    reason: str = "Extracted from supplied text."


class SuggestionResponse(BaseModel):
    suggestions: list[SuggestedMemory]


class ImportResponse(BaseModel):
    detected_format: str
    suggestions_created: int
    memories: list[Memory]


class LoginRequest(BaseModel):
    password: str


class LoginResponse(BaseModel):
    api_key: str
