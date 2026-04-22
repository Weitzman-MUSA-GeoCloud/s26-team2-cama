import csv
import functions_framework
import json
import logging
import os
from google.cloud import storage


@functions_framework.http
def prepare_recreation(request):
    """Convert recreation CSV to JSON-L with lowercased field names.

    X/Y columns are already in WGS84 (longitude/latitude).
    """
    storage_client = storage.Client()

    raw_bucket = "musa5090s26-team2-raw_data"
    prep_bucket = "musa5090s26-team2-prepared_data"
    prep_blob_path = "external_data/recreation/data.jsonl"

    local_csv = "/tmp/recreation.csv"
    local_jsonl = "/tmp/recreation.jsonl"

    try:
        bucket = storage_client.bucket(raw_bucket)
        blobs = list(bucket.list_blobs(prefix="external_data/recreation/"))
        csv_blob = next(
            (b for b in blobs if b.name.lower().endswith(".csv") and b.size > 0),
            None,
        )

        if csv_blob is None:
            return {"success": False, "error": "No CSV file found in external_data/recreation/"}, 404

        logging.info(f"Downloading {csv_blob.name}...")
        csv_blob.download_to_filename(local_csv)

        row_count = 0
        with open(local_csv, "r", encoding="utf-8-sig") as infile, \
             open(local_jsonl, "w", encoding="utf-8") as outfile:

            reader = csv.DictReader(infile)
            for row in reader:
                # Lowercase all field names; X=longitude, Y=latitude (WGS84)
                clean = {k.lower(): v for k, v in row.items()}
                outfile.write(json.dumps(clean) + "\n")
                row_count += 1

        out_bucket = storage_client.bucket(prep_bucket)
        out_bucket.blob(prep_blob_path).upload_from_filename(local_jsonl)

        os.remove(local_csv)
        os.remove(local_jsonl)

        return {
            "success": True,
            "message": f"Recreation data converted to JSON-L ({row_count} rows)",
            "gcs_path": f"gs://{prep_bucket}/{prep_blob_path}",
        }, 200

    except Exception as e:
        logging.error(str(e))
        return {"success": False, "error": str(e)}, 500
