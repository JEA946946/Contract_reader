FROM python:3.12-slim

WORKDIR /app

# tesseract-ocr-fra/-eng are for the scanned-contract fallback in
# app/parsers/scanned_fallback.py. Without the language data the OCR engine logs
# "Tesseract couldn't load any languages" and falls back to something weaker: a
# scanned contract that yielded 17,514 characters with the packs installed gave
# 11,986 without. The supplier contracts are in French.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential default-libmysqlclient-dev pkg-config \
    tesseract-ocr tesseract-ocr-eng tesseract-ocr-fra && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Create non-root user (required by claude-agent-sdk)
RUN useradd -m -s /bin/bash appuser && \
    mkdir -p uploads && \
    chown -R appuser:appuser /app

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER appuser

EXPOSE 8005

ENTRYPOINT ["/entrypoint.sh"]
CMD ["gunicorn", "app.main:app", "-k", "uvicorn.workers.UvicornWorker", \
     "--bind", "0.0.0.0:8005", "--workers", "2", "--timeout", "600"]
