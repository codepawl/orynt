#!/usr/bin/env python3

"""Isolated, one-trial Hermes decision adapter for Orynt's benchmark."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys
import time
from typing import Any


KINDS = {"respond", "clarify", "act", "refuse"}
ACTION_NAMES = {
    "respond",
    "request_clarification",
    "search_web",
    "read_resource",
    "update_resource",
    "send_message",
    "schedule_event",
    "refuse",
}
ACTIVE_REQUEST_ID: str | None = None


def now_ns() -> int:
    return time.monotonic_ns()


def emit(event_type: str, **payload: Any) -> None:
    record = {
        "type": event_type,
        "requestId": ACTIVE_REQUEST_ID,
        "monotonicNs": str(now_ns()),
        **payload,
    }
    sys.stdout.write(json.dumps(record, separators=(",", ":"), ensure_ascii=False) + "\n")
    sys.stdout.flush()


def normalized_decision(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict) or set(value) != {"kind", "actionName", "arguments"}:
        return None
    if value.get("kind") not in KINDS or value.get("actionName") not in ACTION_NAMES:
        return None
    arguments = value.get("arguments")
    if not isinstance(arguments, dict):
        return None
    expected_arguments = {
        "answer",
        "missingFields",
        "query",
        "resource",
        "content",
        "recipient",
        "scheduledAt",
        "refusalCategory",
    }
    if set(arguments) != expected_arguments:
        return None
    for key, item in arguments.items():
        if key == "missingFields":
            if item is not None and (
                not isinstance(item, list)
                or any(not isinstance(entry, str) for entry in item)
            ):
                return None
        elif item is not None and not isinstance(item, str):
            return None
    return value


def first_json_object(text: str) -> dict[str, Any] | None:
    decoder = json.JSONDecoder()
    for index, character in enumerate(text):
        if character != "{":
            continue
        try:
            value, _ = decoder.raw_decode(text[index:])
        except json.JSONDecodeError:
            continue
        decision = normalized_decision(value)
        if decision is not None:
            return decision
    return None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--hermes-root", required=True)
    parser.add_argument("--persistent", action="store_true")
    return parser.parse_args()


def request_from_raw(raw: str) -> dict[str, Any]:
    raw = raw.strip()
    if not raw:
        raise RuntimeError("missing adapter request")
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise RuntimeError("invalid adapter request")
    for key in ("prompt", "modelId", "thinkingEffort"):
        if not isinstance(value.get(key), str) or not value[key]:
            raise RuntimeError(f"invalid adapter request field: {key}")
    return value


def resolve_runtime(request: dict[str, Any]) -> dict[str, Any]:
    from hermes_cli.runtime_provider import resolve_runtime_provider

    return resolve_runtime_provider(
        requested="openai-codex",
        target_model=request["modelId"],
        explicit_base_url=None,
    )


def run_agent(request: dict[str, Any]) -> dict[str, Any] | None:
    from run_agent import AIAgent

    runtime = resolve_runtime(request)
    accumulated = ""
    committed: dict[str, Any] | None = None
    first_delta_seen = False

    def stream_delta(delta: str) -> None:
        nonlocal accumulated, committed, first_delta_seen
        if not isinstance(delta, str) or not delta:
            return
        if not first_delta_seen:
            first_delta_seen = True
            emit("first_delta")
        accumulated += delta
        if committed is None:
            parsed = first_json_object(accumulated)
            if parsed is not None:
                committed = parsed
                emit("decision_committed", decision=parsed)

    agent = AIAgent(
        api_key=runtime.get("api_key"),
        base_url=runtime.get("base_url"),
        provider=runtime.get("provider"),
        requested_provider=runtime.get("requested_provider"),
        api_mode=runtime.get("api_mode"),
        model=request["modelId"],
        max_iterations=1,
        enabled_toolsets=[],
        disabled_toolsets=[],
        save_trajectories=False,
        verbose_logging=False,
        quiet_mode=True,
        ephemeral_system_prompt=request.get("systemPrompt"),
        stream_delta_callback=stream_delta,
        max_tokens=512,
        reasoning_config={"effort": request["thinkingEffort"]},
        platform="benchmark",
        skip_context_files=True,
        load_soul_identity=False,
        skip_memory=True,
        session_db=None,
        fallback_model=None,
        credential_pool=runtime.get("credential_pool"),
    )
    try:
        agent.suppress_status_output = True
        emit("provider_dispatched")
        result = agent.run_conversation(request["prompt"])
        final_response = result.get("final_response") if isinstance(result, dict) else ""
        if committed is None:
            parsed = first_json_object(final_response or accumulated)
            if parsed is None:
                return None
            committed = parsed
            emit("decision_committed", decision=parsed, commitSource="final")
        return committed
    finally:
        try:
            agent.shutdown_memory_provider()
        except Exception:
            pass
        try:
            agent.close()
        except Exception:
            pass


def main() -> int:
    global ACTIVE_REQUEST_ID
    args = parse_args()
    hermes_root = Path(args.hermes_root).resolve()
    if not (hermes_root / "run_agent.py").is_file():
        raise RuntimeError("Hermes root does not contain run_agent.py")
    sys.path.insert(0, str(hermes_root))

    emit("ready", adapter="hermes", schemaVersion=1, pid=os.getpid())
    if args.persistent:
        for raw in sys.stdin:
            if not raw.strip():
                continue
            request = request_from_raw(raw)
            ACTIVE_REQUEST_ID = str(request.get("requestId", ""))
            emit("prompt_accepted")
            decision = run_agent(request)
            emit("finished", decision=decision)
        return 0
    request = request_from_raw(sys.stdin.read())
    ACTIVE_REQUEST_ID = str(request.get("requestId", ""))
    emit("prompt_accepted")
    decision = run_agent(request)
    emit("finished", decision=decision)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:  # noqa: BLE001
        emit("error", message=str(error))
        raise SystemExit(1)
