import functions_framework


@functions_framework.http
def extract_pwd_parcels(request):
    """Verify PWD Parcels GeoJSON exists in GCS raw_data bucket."""
    try:
        from google.cloud import storage
        from datetime import datetime

        PROJECT_ID = "musa5090s26-team2"
        BUCKET_RAW = "musa5090s26-team2-raw_data"
        FOLDER = "pwd_parcels"

        client = storage.Client(project=PROJECT_ID)
        bucket = client.bucket(BUCKET_RAW)

        blobs = list(bucket.list_blobs(prefix=FOLDER + "/"))
        data_blobs = [b for b in blobs if b.size and b.size > 0]

        if not data_blobs:
            return {
                "success": False,
                "error": "No PWD Parcels data found in GCS",
                "location": f"gs://{BUCKET_RAW}/{FOLDER}/"
            }, 404

        total_size_mb = sum(b.size for b in data_blobs) / (1024 * 1024)

        return {
            "success": True,
            "message": "PWD Parcels data verified in GCS",
            "location": f"gs://{BUCKET_RAW}/{FOLDER}/",
            "files_found": len(data_blobs),
            "total_size_mb": round(total_size_mb, 2),
            "timestamp": datetime.now().isoformat()
        }, 200

    except Exception as e:
        return {"success": False, "error": str(e)}, 500
