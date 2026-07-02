import importlib

from fastapi.testclient import TestClient


def make_client(monkeypatch, tmp_path):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'test.db'}")
    monkeypatch.setenv("VECTOR_PATH", str(tmp_path / "qdrant"))
    monkeypatch.setenv("EMBEDDING_MODE", "hash")
    monkeypatch.setenv("API_KEY", "test-key")
    monkeypatch.setenv("LOCAL_PASSWORD", "pw")
    import app.config
    import app.main

    app.config.get_settings.cache_clear()
    importlib.reload(app.main)
    return TestClient(app.main.app)


def auth_headers():
    return {"X-API-Key": "test-key"}


def test_create_memory_defaults_to_pending(monkeypatch, tmp_path):
    client = make_client(monkeypatch, tmp_path)
    response = client.post(
        "/memories",
        headers=auth_headers(),
        json={"type": "preference", "content": "I prefer concise summaries.", "source": "api"},
    )
    assert response.status_code == 200
    assert response.json()["approved"] is False


def test_health(monkeypatch, tmp_path):
    client = make_client(monkeypatch, tmp_path)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_search_only_approved_by_default(monkeypatch, tmp_path):
    client = make_client(monkeypatch, tmp_path)
    pending = client.post(
        "/memories",
        headers=auth_headers(),
        json={"type": "project", "content": "Project Atlas uses FastAPI.", "source": "api"},
    ).json()
    approved = client.post(
        "/memories",
        headers=auth_headers(),
        json={"type": "project", "content": "Project Beacon uses React.", "source": "api", "approved": True},
    ).json()

    default_results = client.get("/memories/search?q=Project&limit=10", headers=auth_headers()).json()
    assert {item["id"] for item in default_results} == {approved["id"]}

    debug_results = client.get("/memories/search?q=Project&include_pending=true", headers=auth_headers()).json()
    assert {item["id"] for item in debug_results} == {pending["id"], approved["id"]}


def test_post_memory_search_approved_only(monkeypatch, tmp_path):
    client = make_client(monkeypatch, tmp_path)
    pending = client.post(
        "/memories",
        headers=auth_headers(),
        json={"type": "project", "content": "Pending Copilot memory.", "source": "api"},
    ).json()
    approved = client.post(
        "/memories",
        headers=auth_headers(),
        json={"type": "project", "content": "Approved Copilot memory.", "source": "api", "approved": True},
    ).json()
    default_results = client.post(
        "/memory/search",
        headers=auth_headers(),
        json={"query": "Copilot memory", "limit": 5, "approved_only": True},
    ).json()
    assert {item["id"] for item in default_results} == {approved["id"]}
    all_results = client.post(
        "/memory/search",
        headers=auth_headers(),
        json={"query": "Copilot memory", "limit": 5, "approved_only": False},
    ).json()
    assert {item["id"] for item in all_results} == {pending["id"], approved["id"]}


def test_approve_memory(monkeypatch, tmp_path):
    client = make_client(monkeypatch, tmp_path)
    memory = client.post(
        "/memories",
        headers=auth_headers(),
        json={"type": "goal", "content": "Finish the MVP.", "source": "manual"},
    ).json()
    response = client.post(
        f"/memories/{memory['id']}/approval",
        headers=auth_headers(),
        json={"approved": True},
    )
    assert response.status_code == 200
    assert response.json()["approved"] is True


def test_delete_memory(monkeypatch, tmp_path):
    client = make_client(monkeypatch, tmp_path)
    memory = client.post(
        "/memories",
        headers=auth_headers(),
        json={"type": "decision", "content": "Use SQLite for MVP.", "source": "manual"},
    ).json()
    response = client.delete(f"/memories/{memory['id']}", headers=auth_headers())
    assert response.status_code == 204
    assert client.get("/memories", headers=auth_headers()).json() == []


def test_export_import(monkeypatch, tmp_path):
    client = make_client(monkeypatch, tmp_path)
    created = client.post(
        "/memories",
        headers=auth_headers(),
        json={"type": "private_note", "content": "Keep everything local.", "source": "manual", "approved": True},
    ).json()
    exported = client.get("/memories/export", headers=auth_headers()).json()
    assert exported[0]["id"] == created["id"]

    client.delete(f"/memories/{created['id']}", headers=auth_headers())
    imported = client.post("/memories/import", headers=auth_headers(), json=exported).json()
    assert imported[0]["id"] == created["id"]


def test_ask_memory_synthesizes_answer(monkeypatch, tmp_path):
    client = make_client(monkeypatch, tmp_path)
    client.post(
        "/memories",
        headers=auth_headers(),
        json={"type": "project", "content": "AI Memory Vault uses FastAPI and React.", "source": "manual", "approved": True},
    )
    response = client.post(
        "/memory/ask",
        headers=auth_headers(),
        json={"query": "What projects am I working on?"},
    )
    assert response.status_code == 200
    assert "AI Memory Vault" in response.json()["answer"]
    assert response.json()["memories"][0]["matching_keywords"] is not None


def test_memory_suggestions(monkeypatch, tmp_path):
    client = make_client(monkeypatch, tmp_path)
    response = client.post(
        "/memory/suggestions",
        headers=auth_headers(),
        json={"text": "I am building AI Memory Vault using FastAPI and React.", "source": "manual"},
    )
    assert response.status_code == 200
    suggestions = response.json()["suggestions"]
    assert any("AI Memory Vault" in item["content"] for item in suggestions)
    assert all(item["approved"] is False for item in suggestions)


def test_extension_sources_are_allowed(monkeypatch, tmp_path):
    client = make_client(monkeypatch, tmp_path)
    for source in ["gemini", "copilot", "extension"]:
        response = client.post(
            "/memory/suggestions",
            headers=auth_headers(),
            json={"text": "I am building AI Memory Vault using FastAPI.", "source": source},
        )
        assert response.status_code == 200


def test_import_center_text_creates_pending(monkeypatch, tmp_path):
    client = make_client(monkeypatch, tmp_path)
    response = client.post(
        "/imports",
        headers={"X-API-Key": "test-key"},
        files={"file": ("notes.txt", b"I am building Teams Summarizer using Python.", "text/plain")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["suggestions_created"] >= 1
    assert all(memory["approved"] is False for memory in body["memories"])


def test_cors_allows_chrome_extension(monkeypatch, tmp_path):
    client = make_client(monkeypatch, tmp_path)
    response = client.options(
        "/memory/search",
        headers={
            "Origin": "chrome-extension://abcdefghijklmnop",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,x-api-key",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "chrome-extension://abcdefghijklmnop"
