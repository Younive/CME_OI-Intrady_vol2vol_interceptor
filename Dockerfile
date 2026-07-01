# Airflow + Playwright. The official image has no browsers, and the interceptor
# needs headless chromium — so we install it into a world-readable path.
# ponytail: pinning chromium here is the known ceiling; bump the base tag and
# rerun `playwright install` when Playwright is upgraded.
FROM apache/airflow:2.9.3-python3.12

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

USER airflow
RUN pip install --no-cache-dir \
    playwright \
    playwright-stealth \
    google-cloud-storage \
    pendulum \
    pandas

USER root
RUN python -m playwright install --with-deps chromium \
    && chmod -R a+rx /ms-playwright

USER airflow
