import functions_framework
import json
import requests
from google.cloud import storage
from datetime import datetime


FEATURE_SERVICE_URL = (
    "https://services.arcgis.com/fLeGjb7u4uXqeF9q/arcgis/rest/services/"
    "PWD_PARCELS/FeatureServer/0/query"
)
PAGE_SIZE = 2000
PROJECT_ID = "musa5090s26-team2"
BUCKET_RAW = "musa5090s26-team2-raw_data"
DEST_BLOB = "pwd_parcels/pwd_parcels.geojson"


@functions_framework.http
def extract_pwd_parcels(request):
    """Stream PWD Parcels from ArcGIS FeatureServer directly into GCS as GeoJSON."""
    try:
        client = storage.Client(project=PROJECT_ID)
        blob = client.bucket(BUCKET_RAW).blob(DEST_BLOB)

        offset = 0
        total = 0
        first = True

        with blob.open("wb") as f:
            f.write(b'{"type":"FeatureCollection","features":[')

            while True:
                resp = requests.get(
                    FEATURE_SERVICE_URL,
                    params={
                        "where": "1=1",
                        "outFields": "*",
                        "f": "geojson",
                        "resultOffset": offset,
                        "resultRecordCount": PAGE_SIZE,
                        "outSR": "4326",
                    },
                    timeout=120,
                )
                resp.raise_for_status()
                page = resp.json()
                features = page.get("features", [])

                if not features:
                    break

                for feat in features:
                    if not first:
                        f.write(b",")
                    f.write(json.dumps(feat).encode())
                    first = False

                total += len(features)
                offset += PAGE_SIZE

                if len(features) < PAGE_SIZE:
                    break

            f.write(b"]}")

        blob.reload()
        return {
            "success": True,
            "message": f"PWD Parcels downloaded and uploaded to GCS ({total} features)",
            "destination": f"gs://{BUCKET_RAW}/{DEST_BLOB}",
            "total_features": total,
            "size_mb": round(blob.size / 1024 / 1024, 2),
            "timestamp": datetime.now().isoformat(),
        }, 200

    except Exception as e:
        return {"success": False, "error": str(e)}, 500
