import functions_framework
from google.cloud import bigquery
import os

PROJECT_ID = "musa5090s26-team2"


@functions_framework.http
def create_derived_current_assessment_bins(request):
    """Run SQL to create derived.current_assessment_bins table in BigQuery."""
    try:
        sql_path = os.path.join(os.path.dirname(__file__), "sql", "create_derived_current_assessment_bins.sql")
        with open(sql_path, "r") as f:
            sql = f.read()

        client = bigquery.Client(project=PROJECT_ID)
        job = client.query(sql)
        job.result()

        return {
            "success": True,
            "message": "derived.current_assessment_bins table created successfully",
        }, 200

    except Exception as e:
        return {
            "success": False,
            "error": str(e),
        }, 500
