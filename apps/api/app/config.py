from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    github_token: str = ""
    cache_ttl_seconds: int = 3600
    allowed_origins: list[str] = [
        "https://codepawl.com",
        "http://localhost:3000",
    ]

    model_config = {"env_prefix": "CODEPAWL_"}
