import functions_framework
import json
from google.cloud import bigquery, storage

PROJECT_ID = "musa5090s26-team2"
DATASET_SOURCE = "source"
DATASET_CORE = "core"
TABLE_NAME = "opa_properties"

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


@functions_framework.http
def load_opa_properties(request):
    """Create BigQuery external and core tables for OPA Properties."""
    try:
        client = bigquery.Client(project=PROJECT_ID)
        storage_client = storage.Client()

        # Ensure datasets exist
        for dataset_id in [DATASET_SOURCE, DATASET_CORE]:
            dataset = bigquery.Dataset(f"{PROJECT_ID}.{dataset_id}")
            try:
                client.get_dataset(dataset)
            except Exception:
                client.create_dataset(dataset)

        # Read first line of JSON-L to get field names
        bucket = storage_client.bucket("musa5090s26-team2-prepared_data")
        blob = bucket.blob("opa_properties/data.jsonl")
        first_line = blob.download_as_text(end=4096).split("\n")[0]
        fields = list(json.loads(first_line).keys())

        # Build schema with all STRING columns
        schema_cols = ",\n  ".join([f"{f} STRING" for f in fields])
        source_sql = f"""
CREATE OR REPLACE EXTERNAL TABLE source.opa_properties (
  {schema_cols}
)
OPTIONS (
  format = 'NEWLINE_DELIMITED_JSON',
  uris = ['gs://musa5090s26-team2-prepared_data/opa_properties/data.jsonl']
);
"""
        run_sql(client, source_sql)
        run_sql(client, CORE_SQL)

        return {
            "success": True,
            "message": "OPA Properties tables created",
            "source_table": f"{PROJECT_ID}.{DATASET_SOURCE}.{TABLE_NAME}",
            "core_table": f"{PROJECT_ID}.{DATASET_CORE}.{TABLE_NAME}"
        }, 200

    except Exception as e:
        return {"success": False, "error": str(e)}, 500
