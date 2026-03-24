from unittest.mock import patch

from app.core.cache import TTLCache


def test_set_and_get():
    cache = TTLCache(ttl_seconds=60)
    cache.set("key", "value")
    assert cache.get("key") == "value"


def test_get_missing_key():
    cache = TTLCache(ttl_seconds=60)
    assert cache.get("nonexistent") is None


def test_expired_entry():
    cache = TTLCache(ttl_seconds=10)
    with patch("app.core.cache.time.monotonic", return_value=1000.0):
        cache.set("key", "value")
    with patch("app.core.cache.time.monotonic", return_value=1011.0):
        assert cache.get("key") is None


def test_not_expired_entry():
    cache = TTLCache(ttl_seconds=10)
    with patch("app.core.cache.time.monotonic", return_value=1000.0):
        cache.set("key", "value")
    with patch("app.core.cache.time.monotonic", return_value=1009.0):
        assert cache.get("key") == "value"


def test_clear():
    cache = TTLCache(ttl_seconds=60)
    cache.set("a", 1)
    cache.set("b", 2)
    cache.clear()
    assert cache.get("a") is None
    assert cache.get("b") is None


def test_overwrite_key():
    cache = TTLCache(ttl_seconds=60)
    cache.set("key", "first")
    cache.set("key", "second")
    assert cache.get("key") == "second"
