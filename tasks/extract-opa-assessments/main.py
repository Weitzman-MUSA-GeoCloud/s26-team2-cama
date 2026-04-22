import functions_framework


OPA_ASSESSMENTS_CSV_URL = (
    "https://phl.carto.com/api/v2/sql"
    "?filename=assessments"
    "&format=csv"
    "&skipfields=cartodb_id,the_geom,the_geom_webmercator"
    "&q=SELECT+*+FROM+assessments"
)

PROJECT_ID = "musa5090s26-team2"
BUCKET_RAW = "musa5090s26-team2-raw_data"
DEST_BLOB = "opa_assessments/opa_assessments.csv"


@functions_framework.http
def extract_opa_assessments(request):
    """Download the latest OPA Assessments CSV from OpenDataPhilly and upload to GCS."""
    try:
        import requests
        from google.cloud import storage
        from datetime import datetime

        client = storage.Client(project=PROJECT_ID)
        bucket = client.bucket(BUCKET_RAW)
        blob = bucket.blob(DEST_BLOB)

        with requests.get(OPA_ASSESSMENTS_CSV_URL, stream=True, timeout=300) as response:
            response.raise_for_status()
            with blob.open("wb") as gcs_file:
                for chunk in response.iter_content(chunk_size=8 * 1024 * 1024):
                    if chunk:
                        gcs_file.write(chunk)

        blob.reload()
        size_mb = round(blob.size / (1024 * 1024), 2)

        return {
            "success": True,
            "message": "OPA Assessments CSV downloaded and uploaded to GCS",
            "destination": f"gs://{BUCKET_RAW}/{DEST_BLOB}",
            "size_mb": size_mb,
            "timestamp": datetime.now().isoformat(),
        }, 200

    except Exception as e:
        return {"success": False, "error": str(e)}, 500
