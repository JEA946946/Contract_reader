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

    allowed_origins: str = "http://localhost:5173,http://localhost:3000,http://localhost:5174,http://localhost:8005"

    # AI parser settings
    ai_validation_pass_enabled: bool = False  # Set True to re-enable separate Pass 3

    @property
    def upload_path(self) -> Path:
        path = Path(self.upload_dir)
        path.mkdir(parents=True, exist_ok=True)
        return path

    @property
    def gmail_configured(self) -> bool:
        return bool(self.gmail_email and self.gmail_app_password and self.gmail_poll_enabled)

    model_config = {"env_file": ".env"}


settings = Settings()
