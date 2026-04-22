import functions_framework
from datetime import datetime
from google.cloud import storage


@functions_framework.http
def extract_schools(request):
    """Verify schools data exists in GCS raw_data bucket."""
    try:
        client = storage.Client()
        bucket = client.bucket("musa5090s26-team2-raw_data")
        blobs = list(bucket.list_blobs(prefix="external_data/schools/"))

        if not blobs:
            return {"success": False, "error": "No schools data found in GCS"}, 404

        total_size_mb = sum(b.size for b in blobs) / (1024 * 1024)
        return {
            "success": True,
            "message": "Schools data verified in GCS",
            "files_found": len(blobs),
            "total_size_mb": round(total_size_mb, 2),
            "timestamp": datetime.now().isoformat(),
        }, 200

    except Exception as e:
        return {"success": False, "error": str(e)}, 500
