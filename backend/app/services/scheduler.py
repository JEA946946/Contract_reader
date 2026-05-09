from __future__ import annotations

import logging

from apscheduler.schedulers.background import BackgroundScheduler

from app.config import settings

logger = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None


def start_scheduler() -> None:
    """Start the background scheduler for Gmail polling and auto-retry."""
    global _scheduler

    _scheduler = BackgroundScheduler()

    # Gmail polling job (only if configured)
    if settings.gmail_configured:
        _scheduler.add_job(
            _run_poll,
            "interval",
            minutes=settings.gmail_poll_interval_minutes,
            id="gmail_poll",
            max_instances=1,
            replace_existing=True,
        )
        logger.info(
            "Gmail polling scheduled — every %d minutes",
            settings.gmail_poll_interval_minutes,
        )

    # Auto-retry failed documents every 30 minutes
    _scheduler.add_job(
        _run_auto_retry,
        "interval",
        minutes=30,
        id="auto_retry",
        max_instances=1,
        replace_existing=True,
    )
    logger.info("Auto-retry scheduled — every 30 minutes")

    _scheduler.start()
    logger.info("Scheduler started")

    # Run an initial Gmail poll on startup if configured
    if settings.gmail_configured:
        _scheduler.add_job(_run_poll, id="gmail_poll_initial")


def stop_scheduler() -> None:
    """Gracefully shut down the scheduler."""
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")
        _scheduler = None


def get_scheduler() -> BackgroundScheduler | None:
    return _scheduler


def _run_poll() -> None:
    from app.services.email_poller import poll_gmail
    poll_gmail()


def _run_auto_retry() -> None:
    from app.services.auto_retry import run_auto_retry
    run_auto_retry()
