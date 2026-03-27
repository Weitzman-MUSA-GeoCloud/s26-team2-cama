import functions_framework


@functions_framework.http
def extract_opa_assessments(request):
    """Verify OPA Assessments data exists in GCS raw_data bucket."""
    try:
        from google.cloud import storage
        from datetime import datetime

        PROJECT_ID = "musa5090s26-team2"
        BUCKET_RAW = "musa5090s26-team2-raw_data"
        FOLDER = "opa_assessments"

        client = storage.Client(project=PROJECT_ID)
        bucket = client.bucket(BUCKET_RAW)

        blobs = list(bucket.list_blobs(prefix=FOLDER + "/"))

        if not blobs:
            return {
                "success": False,
                "error": "No OPA Assessments data found in GCS",
                "location": f"gs://{BUCKET_RAW}/{FOLDER}/"
            }, 404

        total_size = sum(blob.size for blob in blobs)
        total_size_mb = total_size / (1024 * 1024)

        return {
            "success": True,
            "message": "OPA Assessments data verified in GCS",
            "location": f"gs://{BUCKET_RAW}/{FOLDER}/",
            "files_found": len(blobs),
            "total_size_mb": round(total_size_mb, 2),
            "timestamp": datetime.now().isoformat()
        }, 200

    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }, 500
