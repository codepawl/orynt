"""Shared cross-cutting middleware singletons.

slowapi requires a single Limiter instance shared by all routers and the app
state, so we centralize it here.
"""

from __future__ import annotations

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
