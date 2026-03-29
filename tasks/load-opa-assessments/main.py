import functions_framework
from google.cloud import bigquery

PROJECT_ID = "musa5090s26-team2"
DATASET_SOURCE = "source"
DATASET_CORE = "core"
TABLE_NAME = "opa_assessments"

SOURCE_SQL = """
CREATE OR REPLACE EXTERNAL TABLE source.opa_assessments
OPTIONS (
  format = 'NEWLINE_DELIMITED_JSON',
  uris = ['gs://musa5090s26-team2-prepared_data/opa_assessments/data.jsonl']
);
"""

CORE_SQL = """
CREATE OR REPLACE TABLE core.opa_assessments AS
SELECT
  parcel_number AS property_id,
  *
FROM source.opa_assessments;
"""


def run_sql(client, sql):
    """Execute SQL statement."""
    job = client.query(sql)
    job.result()
    return True


@functions_framework.http
def load_opa_assessments(request):
    """Create BigQuery external and core tables for OPA Assessments."""
    try:
        client = bigquery.Client(project=PROJECT_ID)

        for dataset_id in [DATASET_SOURCE, DATASET_CORE]:
            dataset = bigquery.Dataset(f"{PROJECT_ID}.{dataset_id}")
            try:
                client.get_dataset(dataset)
            except Exception:
                dataset = client.create_dataset(dataset)

        run_sql(client, SOURCE_SQL)
        run_sql(client, CORE_SQL)

        return {
            "success": True,
            "message": "OPA Assessments tables created",
            "source_table": f"{PROJECT_ID}.{DATASET_SOURCE}.{TABLE_NAME}",
            "core_table": f"{PROJECT_ID}.{DATASET_CORE}.{TABLE_NAME}"
        }, 200

    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }, 500
