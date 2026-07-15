# Playwright's image ships the OS libs chromium needs. pip may resolve a newer
# playwright than the image's baked browser, so re-fetch the matching browser
# after install — drift-proof, no tag/pin coordination.
FROM mcr.microsoft.com/playwright/python:v1.58.0-noble

WORKDIR /app
COPY . .
RUN pip install --no-cache-dir . && playwright install chromium

CMD ["python", "main.py"]
