"""Shared task/DAG factory for both session DAGs. No product logic here —
calls src/ as a library."""
import asyncio

import pendulum
from airflow import DAG
from airflow.exceptions import AirflowSkipException
from airflow.operators.python import PythonOperator

from src.config import PRODUCTS
from src.interceptor import CMEInterceptor


def _maintenance_gate():
    """CME maintenance 17:00–18:00 CT. Skip (not hold) so a 5-min DAG doesn't
    pile up an hour of runs behind a held sensor slot, then burst at 18:00.
    Downstream intercept tasks inherit the skip via all_success trigger rule."""
    if pendulum.now("America/Chicago").hour == 17:
        raise AirflowSkipException("CME maintenance window 17:00–18:00 CT")


def _run_product(product_key: str):
    cfg = PRODUCTS[product_key]
    if cfg["pid"] is None:
        print(f"[!] Skipping {product_key} — pid not configured")
        return
    asyncio.run(CMEInterceptor(product=product_key).run())


def build_session_dag(dag_id: str, schedule: str) -> DAG:
    with DAG(
        dag_id=dag_id,
        schedule=schedule,
        start_date=pendulum.datetime(2026, 1, 1, tz="UTC"),
        catchup=False,
        max_active_runs=1,
        tags=["vol2vol"],
    ) as dag:
        gate = PythonOperator(
            task_id="maintenance_gate",
            python_callable=_maintenance_gate,
        )
        for key in PRODUCTS:
            gate >> PythonOperator(
                task_id=f"intercept_{key}",
                python_callable=_run_product,
                op_args=[key],
            )
    return dag
