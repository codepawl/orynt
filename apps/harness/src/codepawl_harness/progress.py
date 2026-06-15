"""Small TTY-aware progress helpers for CodePawl CLIs."""

from __future__ import annotations

import os
import sys
import time
from dataclasses import dataclass
from typing import TextIO


@dataclass(frozen=True)
class ProgressOptions:
    quiet: bool = False
    no_progress: bool = False
    force: bool = False
    stream: TextIO | None = None


class ProgressReporter:
    def __init__(self, *, quiet: bool = False, no_progress: bool = False, force: bool = False, stream: TextIO | None = None):
        self.quiet = quiet
        self.no_progress = no_progress
        self.stream = stream or sys.stderr
        self.enabled = self._enabled(force)
        self.start_time = time.perf_counter()
        self._last_len = 0

    def _enabled(self, force: bool) -> bool:
        if self.quiet or self.no_progress:
            return False
        if force:
            return True
        if os.environ.get("CI"):
            return False
        return bool(getattr(self.stream, "isatty", lambda: False)())

    @property
    def elapsed(self) -> float:
        return time.perf_counter() - self.start_time

    def update(self, message: str) -> None:
        if not self.enabled:
            return
        line = f"{message} | elapsed {format_elapsed(self.elapsed)}"
        padding = " " * max(self._last_len - len(line), 0)
        print(f"\r{line}{padding}", end="", file=self.stream, flush=True)
        self._last_len = len(line)

    def step(self, message: str) -> None:
        if not self.enabled:
            return
        self.clear_line()
        print(message, file=self.stream, flush=True)

    def done(self, message: str | None = None) -> None:
        if not self.enabled:
            return
        self.clear_line()
        if message:
            print(f"{message} | elapsed {format_elapsed(self.elapsed)}", file=self.stream, flush=True)

    def clear_line(self) -> None:
        if not self.enabled or not self._last_len:
            return
        print("\r" + (" " * self._last_len) + "\r", end="", file=self.stream, flush=True)
        self._last_len = 0

    def log(self, message: str) -> None:
        if self.quiet:
            return
        print(message)


def add_progress_arguments(parser) -> None:
    parser.add_argument("--no-progress", action="store_true", help="Disable interactive progress output.")
    parser.add_argument("--quiet", action="store_true", help="Suppress progress and nonessential output.")


def format_elapsed(seconds: float) -> str:
    seconds = max(0, int(seconds))
    minutes, sec = divmod(seconds, 60)
    hours, minutes = divmod(minutes, 60)
    if hours:
        return f"{hours:d}:{minutes:02d}:{sec:02d}"
    return f"{minutes:d}:{sec:02d}"


def count_message(label: str, current: int, total: int | None) -> str:
    if total is None or total <= 0:
        return f"{label} {current}"
    return f"{label} {current}/{total}"
