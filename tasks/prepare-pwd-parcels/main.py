import functions_framework
import json
import logging
import os
from google.cloud import storage


@functions_framework.http
def prepare_pwd_parcels(request):
    """Convert PWD Parcels GeoJSON to JSON-L with lowercased field names."""
    storage_client = storage.Client()

    raw_bucket = "musa5090s26-team2-raw_data"
    prep_bucket = "musa5090s26-team2-prepared_data"
    prep_blob_path = "pwd_parcels/data.jsonl"

    local_geojson = "/tmp/pwd_parcels.geojson"
    local_jsonl = "/tmp/data.jsonl"

    try:
        # Find the GeoJSON file in raw bucket
        bucket = storage_client.bucket(raw_bucket)
        blobs = list(bucket.list_blobs(prefix="pwd_parcels/"))
        geojson_blob = next(
            (b for b in blobs if b.name.lower().endswith(".geojson") and b.size > 0),
            None
        )

        if geojson_blob is None:
            return {"success": False, "error": "No GeoJSON file found in pwd_parcels/"}, 404

        logging.info(f"1. Downloading {geojson_blob.name} ({geojson_blob.size / 1024 / 1024:.1f} MB)...")
        geojson_blob.download_to_filename(local_geojson)

        logging.info("2. Parsing GeoJSON and writing JSON-L...")
        row_count = 0

        with open(local_geojson, "r", encoding="utf-8") as infile, \
             open(local_jsonl, "w", encoding="utf-8") as outfile:

            geojson = json.load(infile)
            features = geojson.get("features", [])

            for feature in features:
                props = feature.get("properties") or {}
                geometry = feature.get("geometry")

                # Lowercase all field names
                row = {k.lower(): v for k, v in props.items()}

                # Store geometry as JSON string for BigQuery
                if geometry is not None:
                    row["geometry"] = json.dumps(geometry)

                outfile.write(json.dumps(row) + "\n")
                row_count += 1

        logging.info(f"3. Converted {row_count} features. Uploading JSON-L...")
        out_bucket = storage_client.bucket(prep_bucket)
        out_bucket.blob(prep_blob_path).upload_from_filename(local_jsonl)

        logging.info("4. Cleaning up temp files...")
        os.remove(local_geojson)
        os.remove(local_jsonl)

        return {
            "success": True,
            "message": f"PWD Parcels converted to JSON-L ({row_count} features)",
            "gcs_path": f"gs://{prep_bucket}/{prep_blob_path}"
        }, 200

    except Exception as e:
        error_msg = f"Error: {str(e)}"
        logging.error(error_msg)
        return {"success": False, "error": error_msg}, 500
