from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    github_token: str = ""
    webhook_secret: str = ""
    cache_ttl_seconds: int = 3600
    tracked_repos: list[str] = []
    allowed_origins: list[str] = [
        "https://codepawl.com",
        "http://localhost:3000",
    ]

    admin_api_key: str = ""
    supabase_url: str = ""
    supabase_secret_key: str = ""
    supabase_jwt_secret: str = ""

    model_config = {"env_prefix": "CODEPAWL_", "env_file": ".env", "extra": "ignore"}
