import functions_framework

@functions_framework.http
def extract_opa_properties(request):
    """Verify OPA Properties data exists in GCS raw_data bucket."""
    try:
        from google.cloud import storage
        from datetime import datetime

        PROJECT_ID = "musa5090s26-team2"
        BUCKET_RAW = "musa5090s26-team2-raw_data"
        FOLDER_OPA = "opa_properties"

        client = storage.Client(project=PROJECT_ID)
        bucket = client.bucket(BUCKET_RAW)

        blobs = list(bucket.list_blobs(prefix=FOLDER_OPA + "/"))

        if not blobs:
            return {
                "success": False,
                "error": "No OPA Properties data found in GCS",
                "location": f"gs://{BUCKET_RAW}/{FOLDER_OPA}/"
            }, 404

        total_size = sum(blob.size for blob in blobs)
        total_size_mb = total_size / (1024 * 1024)

        return {
            "success": True,
            "message": "OPA Properties data verified in GCS",
            "location": f"gs://{BUCKET_RAW}/{FOLDER_OPA}/",
            "files_found": len(blobs),
            "total_size_mb": round(total_size_mb, 2),
            "timestamp": datetime.now().isoformat()
        }, 200

    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }, 500
