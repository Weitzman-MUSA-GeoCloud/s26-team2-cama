import functions_framework
import json
import logging
import os
from google.cloud import storage


@functions_framework.http
def prepare_schools(request):
    """Convert schools GeoJSON (Polygons, WGS84) to JSON-L with lowercased fields.

    Source file uses latin-1 encoding.
    """
    storage_client = storage.Client()

    raw_bucket = "musa5090s26-team2-raw_data"
    prep_bucket = "musa5090s26-team2-prepared_data"
    prep_blob_path = "external_data/schools/data.jsonl"

    local_geojson = "/tmp/schools.geojson"
    local_jsonl = "/tmp/schools.jsonl"

    try:
        bucket = storage_client.bucket(raw_bucket)
        blobs = list(bucket.list_blobs(prefix="external_data/schools/"))
        geojson_blob = next(
            (b for b in blobs if b.name.lower().endswith(".geojson") and b.size > 0),
            None,
        )

        if geojson_blob is None:
            return {"success": False, "error": "No GeoJSON found in external_data/schools/"}, 404

        logging.info(f"Downloading {geojson_blob.name}...")
        geojson_blob.download_to_filename(local_geojson)

        row_count = 0
        with open(local_geojson, "r", encoding="latin-1") as infile, \
             open(local_jsonl, "w", encoding="utf-8") as outfile:

            geojson = json.load(infile)
            for feature in geojson.get("features", []):
                props = feature.get("properties") or {}
                geometry = feature.get("geometry")

                row = {k.lower(): v for k, v in props.items()}
                if geometry is not None:
                    row["geometry"] = json.dumps(geometry)

                outfile.write(json.dumps(row) + "\n")
                row_count += 1

        out_bucket = storage_client.bucket(prep_bucket)
        out_bucket.blob(prep_blob_path).upload_from_filename(local_jsonl)

        os.remove(local_geojson)
        os.remove(local_jsonl)

        return {
            "success": True,
            "message": f"Schools converted to JSON-L ({row_count} features)",
            "gcs_path": f"gs://{prep_bucket}/{prep_blob_path}",
        }, 200

    except Exception as e:
        logging.error(str(e))
        return {"success": False, "error": str(e)}, 500
