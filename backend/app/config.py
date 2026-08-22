from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    database_url: str = "mysql+pymysql://root:password@localhost:3306/hotelprice_reader"
    anthropic_api_key: str = ""
    upload_dir: str = "uploads"

    gmail_email: str = ""
    gmail_app_password: str = ""
    gmail_imap_host: str = "imap.gmail.com"
    gmail_imap_port: int = 993
    gmail_poll_interval_minutes: int = 15
    gmail_poll_enabled: bool = False

    cmr_api_base: str = ""
    cmr_api_token: str = ""

    google_places_api_key: str = ""

    api_key: str = ""

    allowed_origins: str = "http://localhost:5173,http://localhost:3000,http://localhost:5174,http://localhost:8005,https://crm.vmmorocco.com"

    # AI parser settings
    # The switch that was missing when the API account was emptied. Every call
    # into Claude passes through claude_sdk._invoke(), so turning this off stops
    # all of them -- uploads and the mail poller alike.
    ai_enabled: bool = True
    # An inbox with 200 unread attachments used to become 200 AI runs in one
    # unattended poll. Whatever is left over waits for the next round.
    poll_max_emails_per_run: int = 20
    # Polling fetches and stores; it does not run AI. Documents from email wait
    # as `pending_extraction` until a person starts them. Fetching is free,
    # extracting is not, and nobody is watching at 03:00.
    poll_auto_extract: bool = False
    ai_validation_pass_enabled: bool = False  # Set True to re-enable separate Pass 3

    # Pipeline optimization
    validation_threshold: float = 0.6       # Haiku confidence below this triggers Sonnet fallback
    max_pages_per_document: int = 15        # Max pages to send to AI (truncation)
    max_chars_per_ai_call: int = 30000      # Max text chars per AI call
    ai_timeout: int = 30                    # Timeout in seconds for AI calls

    # Redis cache
    redis_url: str = "redis://localhost:6379"
    redis_cache_ttl_days: int = 30

    @property
    def upload_path(self) -> Path:
        path = Path(self.upload_dir)
        path.mkdir(parents=True, exist_ok=True)
        return path

    @property
    def gmail_configured(self) -> bool:
        return bool(self.gmail_email and self.gmail_app_password and self.gmail_poll_enabled)

    model_config = {"env_file": ".env", "validate_assignment": True}


settings = Settings()
