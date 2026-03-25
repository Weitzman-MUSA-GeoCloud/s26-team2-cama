import functions_framework
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from google.cloud import storage
import os
import logging


@functions_framework.http
def prepare_opa_properties(request):
    storage_client = storage.Client()

    raw_bucket = "musa5090s26-team2-raw_data"
    raw_blob = "opa_properties/opa_properties_public.csv"

    prep_bucket = "musa5090s26-team2-prepared_data"
    prep_blob = "opa_properties/data.parquet"

    local_csv = "/tmp/data.csv"
    local_parquet = "/tmp/data.parquet"

    try:
        logging.info("1. Downloading raw CSV to /tmp...")
        bucket = storage_client.bucket(raw_bucket)
        bucket.blob(raw_blob).download_to_filename(local_csv)

        logging.info("2. Chunked processing: CSV -> Parquet...")
        writer = None

        chunk_iter = pd.read_csv(
            local_csv,
            chunksize=50000,
            dtype=str,
            on_bad_lines='skip',
            low_memory=False
        )

        for chunk in chunk_iter:
            chunk.columns = [col.lower() for col in chunk.columns]
            table = pa.Table.from_pandas(chunk)

            if writer is None:
                writer = pq.ParquetWriter(local_parquet, table.schema)

            writer.write_table(table)

        if writer:
            writer.close()

        logging.info("3. Uploading Parquet to prepared_data bucket...")
        out_bucket = storage_client.bucket(prep_bucket)
        out_bucket.blob(prep_blob).upload_from_filename(local_parquet)

        logging.info("4. Cleaning up temp files...")
        os.remove(local_csv)
        os.remove(local_parquet)

        return {
            "success": True,
            "message": "OPA Properties data converted to Parquet",
            "gcs_path": f"gs://{prep_bucket}/{prep_blob}"
        }, 200

    except Exception as e:
        error_msg = f"Error occurred: {str(e)}"
        logging.error(error_msg)
        return {"success": False, "error": error_msg}, 500
