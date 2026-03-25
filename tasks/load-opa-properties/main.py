import functions_framework
from google.cloud import bigquery

PROJECT_ID = "musa5090s26-team2"
DATASET_SOURCE = "source"
DATASET_CORE = "core"
TABLE_NAME = "opa_properties"

SOURCE_SQL = """
CREATE OR REPLACE EXTERNAL TABLE source.opa_properties
OPTIONS (
  format = 'PARQUET',
  uris = ['gs://musa5090s26-team2-prepared_data/opa_properties/data.parquet']
);
"""

CORE_SQL = """
CREATE OR REPLACE TABLE core.opa_properties AS
SELECT
  parcel_number AS property_id,
  *
FROM source.opa_properties;
"""


def run_sql(client, sql):
    """Execute SQL statement."""
    job = client.query(sql)
    job.result()
    return True


@functions_framework.http
def load_opa_properties(request):
    """Create BigQuery external and core tables for OPA Properties."""
    try:
        client = bigquery.Client(project=PROJECT_ID)

        for dataset_id in [DATASET_SOURCE, DATASET_CORE]:
            dataset = bigquery.Dataset(f"{PROJECT_ID}.{dataset_id}")
            try:
                client.get_dataset(dataset)
            except:
                dataset = client.create_dataset(dataset)

        run_sql(client, SOURCE_SQL)
        run_sql(client, CORE_SQL)

        return {
            "success": True,
            "message": "OPA Properties tables created",
            "source_table": f"{PROJECT_ID}.{DATASET_SOURCE}.{TABLE_NAME}",
            "core_table": f"{PROJECT_ID}.{DATASET_CORE}.{TABLE_NAME}"
        }, 200

    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }, 500
