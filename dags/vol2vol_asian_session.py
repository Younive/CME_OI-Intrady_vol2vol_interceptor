from shared.tasks import build_session_dag

# Off-hours: hourly, only outside the 07:00–22:00 UTC active window (Asian
# session + weekend reopen). Each run spins chromium, so no point overlapping
# the 5-min DAG — dedup would skip those anyway.
# ponytail: fixed hour list, not exact session gating. Upgrade to a custom
# Airflow timetable only if this ever needs finer control.
dag = build_session_dag("vol2vol_asian_session", "0 0-6,22-23 * * *")
