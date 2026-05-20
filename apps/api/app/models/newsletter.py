"""Pydantic models for the newsletter endpoints (docs/API.md)."""

from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field


class SubscribeRequest(BaseModel):
    email: EmailStr
    source: str = Field(min_length=1, max_length=64)
    turnstile_token: str = Field(min_length=1, max_length=4096)


class SubscribeResponse(BaseModel):
    status: str


class ConfirmResponse(BaseModel):
    status: str
    email: str


class UnsubscribeRequest(BaseModel):
    token: str = Field(min_length=1, max_length=128)


class UnsubscribeResponse(BaseModel):
    status: str
