"""Pydantic models for /contact (docs/API.md)."""

from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field


class ContactRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    subject: str | None = Field(default=None, max_length=200)
    message: str = Field(min_length=10, max_length=5000)
    turnstile_token: str = Field(min_length=1, max_length=4096)


class ContactResponse(BaseModel):
    status: str
    id: str
