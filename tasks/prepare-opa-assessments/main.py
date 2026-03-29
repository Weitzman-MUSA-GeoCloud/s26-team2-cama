import functions_framework
import json
import csv
from google.cloud import storage
import os
import logging


@functions_framework.http
def prepare_opa_assessments(request):
    """Convert OPA Assessments CSV to JSON-L with lowercased field names."""
    storage_client = storage.Client()

    raw_bucket = "musa5090s26-team2-raw_data"
    prep_bucket = "musa5090s26-team2-prepared_data"
    prep_blob = "opa_assessments/data.jsonl"

    local_csv = "/tmp/assessments.csv"
    local_jsonl = "/tmp/data.jsonl"

    try:
        # Find the CSV file in the raw bucket
        bucket = storage_client.bucket(raw_bucket)
        blobs = list(bucket.list_blobs(prefix="opa_assessments/"))
        csv_blob = None
        for blob in blobs:
            if blob.name.endswith(".csv"):
                csv_blob = blob
                break

        if csv_blob is None:
            return {"success": False, "error": "No CSV file found in opa_assessments/"}, 404

        logging.info(f"1. Downloading {csv_blob.name} to /tmp...")
        csv_blob.download_to_filename(local_csv)

        logging.info("2. Converting CSV to JSON-L with lowercased fields...")
        row_count = 0
        with open(local_csv, "r", encoding="utf-8", errors="replace") as infile, \
             open(local_jsonl, "w", encoding="utf-8") as outfile:

            reader = csv.DictReader(infile)
            for row in reader:
                lowered = {k.lower(): v for k, v in row.items()}
                outfile.write(json.dumps(lowered) + "\n")
                row_count += 1

        logging.info(f"3. Converted {row_count} rows. Uploading to prepared_data bucket...")
        out_bucket = storage_client.bucket(prep_bucket)
        out_bucket.blob(prep_blob).upload_from_filename(local_jsonl)

        logging.info("4. Cleaning up temp files...")
        os.remove(local_csv)
        os.remove(local_jsonl)

        return {
            "success": True,
            "message": f"OPA Assessments converted to JSON-L ({row_count} rows)",
            "gcs_path": f"gs://{prep_bucket}/{prep_blob}"
        }, 200

    except Exception as e:
        error_msg = f"Error occurred: {str(e)}"
        logging.error(error_msg)
        return {"success": False, "error": error_msg}, 500
