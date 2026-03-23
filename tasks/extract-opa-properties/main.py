import functions_framework
import requests
import json
import logging
from typing import Dict
from datetime import datetime
from google.cloud import storage
import time

from config import (
    CKAN_API_BASE_URL,
    OPA_PROPERTIES_RESOURCE_ID,
    GCS_PROJECT_ID,
    GCS_BUCKET_RAW,
    GCS_FOLDER_OPA_PROPERTIES,
    BATCH_SIZE,
    API_TIMEOUT,
    MAX_RETRIES,
    RETRY_DELAY,
    OUTPUT_FILENAME,
)

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


class OPAExtractor:
    def __init__(self):
        self.api_url = CKAN_API_BASE_URL
        self.resource_id = OPA_PROPERTIES_RESOURCE_ID
        self.batch_size = BATCH_SIZE
        self.gcs_client = storage.Client(project=GCS_PROJECT_ID)
        self.bucket = self.gcs_client.bucket(GCS_BUCKET_RAW)

    def fetch_batch(self, offset: int) -> Dict:
        params = {
            "resource_id": self.resource_id,
            "offset": offset,
            "limit": self.batch_size,
        }

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }

        for attempt in range(MAX_RETRIES):
            try:
                logger.info(f"Fetching batch: offset={offset}, limit={self.batch_size}")
                response = requests.get(
                    self.api_url, params=params, headers=headers, timeout=API_TIMEOUT
                )
                response.raise_for_status()

                data = response.json()
                if not data.get("success"):
                    raise Exception("API returned success=false")

                return data["result"]

            except requests.exceptions.RequestException as e:
                if attempt < MAX_RETRIES - 1:
                    logger.warning(
                        f"Attempt {attempt + 1} failed: {e}. Retrying in {RETRY_DELAY}s..."
                    )
                    time.sleep(RETRY_DELAY)
                else:
                    logger.error(f"Failed after {MAX_RETRIES} attempts: {e}")
                    raise

    def extract_all(self) -> Dict:
        logger.info("Starting OPA Properties extraction...")

        first_batch = self.fetch_batch(offset=0)
        total_records = first_batch["total"]
        logger.info(f"Total records to extract: {total_records}")

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        gcs_path = f"{GCS_FOLDER_OPA_PROPERTIES}/{timestamp}/{OUTPUT_FILENAME}"
        blob = self.bucket.blob(gcs_path)

        extracted_count = 0
        batch_count = 0
        num_batches = (total_records + self.batch_size - 1) // self.batch_size

        try:
            with blob.open("w") as f:
                for record in first_batch["records"]:
                    f.write(json.dumps(record) + "\n")
                    extracted_count += 1

                batch_count += 1
                logger.info(
                    f"Processed batch {batch_count}/{num_batches} "
                    f"({extracted_count} records)"
                )

                for offset in range(self.batch_size, total_records, self.batch_size):
                    batch = self.fetch_batch(offset=offset)

                    for record in batch["records"]:
                        f.write(json.dumps(record) + "\n")
                        extracted_count += 1

                    batch_count += 1
                    if batch_count % 10 == 0:
                        logger.info(
                            f"Processed batch {batch_count}/{num_batches} "
                            f"({extracted_count} records)"
                        )

        except Exception as e:
            logger.error(f"Error during extraction: {e}")
            blob.delete()
            raise

        logger.info(
            f"Extraction complete! Total records: {extracted_count}, "
            f"Batches: {batch_count}, GCS path: gs://{GCS_BUCKET_RAW}/{gcs_path}"
        )

        return {
            "status": "success",
            "total_records": extracted_count,
            "batches": batch_count,
            "gcs_path": f"gs://{GCS_BUCKET_RAW}/{gcs_path}",
            "timestamp": timestamp,
        }


@functions_framework.http
def extract_opa_properties(request):
    try:
        extractor = OPAExtractor()
        result = extractor.extract_all()

        return {
            "success": True,
            **result,
        }, 200

    except Exception as e:
        logger.error(f"Function failed: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e),
        }, 500
