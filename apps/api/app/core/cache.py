import time
from typing import Any


class TTLCache:
    def __init__(self, ttl_seconds: int = 3600):
        self._store: dict[str, tuple[float, Any]] = {}
        self._ttl = ttl_seconds

    def get(self, key: str) -> Any | None:
        if key in self._store:
            timestamp, value = self._store[key]
            if time.monotonic() - timestamp < self._ttl:
                return value
            del self._store[key]
        return None

    def set(self, key: str, value: Any) -> None:
        self._store[key] = (time.monotonic(), value)

    def clear(self) -> None:
        self._store.clear()
