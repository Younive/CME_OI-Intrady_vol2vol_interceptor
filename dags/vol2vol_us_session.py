from shared.tasks import build_session_dag

# Active session: every 5 min, 07:00–22:00 UTC, weekdays.
# Covers London open (~07:00 UTC) through US close (~22:00 UTC) — the liquid
# window for gold. Off-hours are picked up hourly by vol2vol_asian_session.
dag = build_session_dag("vol2vol_us_session", "*/5 7-22 * * 1-5")
