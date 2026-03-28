import functions_framework
import csv
import json
import logging
import os
from google.cloud import storage


@functions_framework.http
def prepare_opa_properties(request):
    """Convert OPA Properties CSV to JSON-L with lowercased field names."""
    storage_client = storage.Client()

    raw_bucket = "musa5090s26-team2-raw_data"
    raw_blob = "opa_properties/opa_properties_public.csv"

    prep_bucket = "musa5090s26-team2-prepared_data"
    prep_blob = "opa_properties/data.jsonl"

    local_csv = "/tmp/data.csv"
    local_jsonl = "/tmp/data.jsonl"

    try:
        logging.info("1. Downloading raw CSV to /tmp...")
        bucket = storage_client.bucket(raw_bucket)
        bucket.blob(raw_blob).download_to_filename(local_csv)

        logging.info("2. Converting CSV to JSON-L...")
        row_count = 0

        with open(local_csv, "r", encoding="utf-8", errors="replace") as infile, \
             open(local_jsonl, "w", encoding="utf-8") as outfile:

            reader = csv.DictReader(infile)
            for row in reader:
                # Lowercase all field names
                lowered = {k.lower(): v for k, v in row.items()}
                outfile.write(json.dumps(lowered) + "\n")
                row_count += 1

        logging.info(f"3. Converted {row_count} rows. Uploading JSON-L...")
        out_bucket = storage_client.bucket(prep_bucket)
        out_bucket.blob(prep_blob).upload_from_filename(local_jsonl)

        logging.info("4. Cleaning up temp files...")
        os.remove(local_csv)
        os.remove(local_jsonl)

        return {
            "success": True,
            "message": f"OPA Properties converted to JSON-L ({row_count} rows)",
            "gcs_path": f"gs://{prep_bucket}/{prep_blob}"
        }, 200

    except Exception as e:
        error_msg = f"Error: {str(e)}"
        logging.error(error_msg)
        return {"success": False, "error": error_msg}, 500
