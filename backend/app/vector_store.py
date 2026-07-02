import hashlib
import math
from pathlib import Path

from .models import Memory


class VectorStore:
    collection_name = "memories"

    def __init__(self, persist_path: Path, embedding_model: str, mode: str = "sentence-transformers"):
        self.persist_path = persist_path
        self.embedding_model = embedding_model
        self.mode = mode
        self._client = None
        self._model = None
        self.persist_path.mkdir(parents=True, exist_ok=True)
        if self.mode == "sentence-transformers":
            self._init_qdrant()

    def _init_qdrant(self) -> None:
        try:
            from qdrant_client import QdrantClient
            from qdrant_client.models import Distance, VectorParams
            from sentence_transformers import SentenceTransformer

            self._model = SentenceTransformer(self.embedding_model)
            dimensions = len(self.embed("dimension check"))
            self._client = QdrantClient(path=str(self.persist_path))
            collections = {collection.name for collection in self._client.get_collections().collections}
            if self.collection_name not in collections:
                self._client.create_collection(
                    collection_name=self.collection_name,
                    vectors_config=VectorParams(size=dimensions, distance=Distance.COSINE),
                )
        except Exception as exc:
            # MVP fallback keeps local development and CI usable when the model is not downloaded yet.
            # Production should pre-bundle/pin the embedding model and fail closed if indexing is unavailable.
            print(f"Vector search fallback active: {exc}")
            self.mode = "hash"

    def _hash_embedding(self, text: str, dimensions: int = 128) -> list[float]:
        vector = [0.0] * dimensions
        for token in text.lower().split():
            digest = hashlib.sha256(token.encode("utf-8")).digest()
            index = int.from_bytes(digest[:2], "big") % dimensions
            sign = 1.0 if digest[2] % 2 == 0 else -1.0
            vector[index] += sign
        norm = math.sqrt(sum(value * value for value in vector)) or 1.0
        return [value / norm for value in vector]

    def embed(self, text: str) -> list[float]:
        if self.mode == "sentence-transformers" and self._model is not None:
            return self._model.encode(text).tolist()
        return self._hash_embedding(text)

    def upsert(self, memory: Memory) -> None:
        if self.mode == "sentence-transformers" and self._client is not None:
            from qdrant_client.models import PointStruct

            self._client.upsert(
                collection_name=self.collection_name,
                points=[
                    PointStruct(
                        id=memory.id,
                        vector=self.embed(memory.content),
                        payload={
                            "content": memory.content,
                            "type": memory.type.value,
                            "source": memory.source.value,
                            "approved": memory.approved,
                            "tags": memory.tags,
                        },
                    )
                ],
            )

    def delete(self, memory_id: str) -> None:
        if self.mode == "sentence-transformers" and self._client is not None:
            self._client.delete(collection_name=self.collection_name, points_selector=[memory_id])

    def search_ids(self, query: str, limit: int = 10, include_pending: bool = False) -> list[tuple[str, float]]:
        if self.mode == "sentence-transformers" and self._client is not None:
            from qdrant_client.models import FieldCondition, Filter, MatchValue

            query_filter = None
            if not include_pending:
                query_filter = Filter(must=[FieldCondition(key="approved", match=MatchValue(value=True))])
            points = self._client.search(
                collection_name=self.collection_name,
                query_vector=self.embed(query),
                query_filter=query_filter,
                limit=limit,
            )
            return [(str(point.id), float(point.score or 0.0)) for point in points]
        return []

    def rank_memories(self, query: str, memories: list[Memory], limit: int = 10) -> list[tuple[Memory, float]]:
        query_embedding = self.embed(query)
        ranked: list[tuple[Memory, float]] = []
        for memory in memories:
            memory_embedding = self.embed(memory.content)
            score = sum(a * b for a, b in zip(query_embedding, memory_embedding))
            ranked.append((memory, score))
        ranked.sort(key=lambda item: item[1], reverse=True)
        return ranked[:limit]
