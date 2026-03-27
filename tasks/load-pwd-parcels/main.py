import functions_framework
from google.cloud import bigquery

PROJECT_ID = "musa5090s26-team2"
DATASET_SOURCE = "source"
DATASET_CORE = "core"
TABLE_NAME = "pwd_parcels"

SOURCE_SQL = """
CREATE OR REPLACE EXTERNAL TABLE source.pwd_parcels
OPTIONS (
  format = 'NEWLINE_DELIMITED_JSON',
  uris = ['gs://musa5090s26-team2-prepared_data/pwd_parcels/data.jsonl']
);
"""

CORE_SQL = """
CREATE OR REPLACE TABLE core.pwd_parcels AS
SELECT
  brt_id AS property_id,
  *
FROM source.pwd_parcels;
"""


def run_sql(client, sql):
    job = client.query(sql)
    job.result()


@functions_framework.http
def load_pwd_parcels(request):
    """Create BigQuery external and core tables for PWD Parcels."""
    try:
        client = bigquery.Client(project=PROJECT_ID)

        for dataset_id in [DATASET_SOURCE, DATASET_CORE]:
            dataset = bigquery.Dataset(f"{PROJECT_ID}.{dataset_id}")
            try:
                client.get_dataset(dataset)
            except Exception:
                client.create_dataset(dataset)

        run_sql(client, SOURCE_SQL)
        run_sql(client, CORE_SQL)

        return {
            "success": True,
            "message": "PWD Parcels tables created",
            "source_table": f"{PROJECT_ID}.{DATASET_SOURCE}.{TABLE_NAME}",
            "core_table": f"{PROJECT_ID}.{DATASET_CORE}.{TABLE_NAME}"
        }, 200

    except Exception as e:
        return {"success": False, "error": str(e)}, 500
