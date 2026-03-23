CKAN_API_BASE_URL = "https://data.phila.gov/api/3/action/datastore_search"
OPA_PROPERTIES_RESOURCE_ID = "opa-properties-public"

GCS_PROJECT_ID = "musa5090s26-team2"
GCS_BUCKET_RAW = f"{GCS_PROJECT_ID}-raw_data"
GCS_FOLDER_OPA_PROPERTIES = "opa_properties"

BATCH_SIZE = 10000
API_TIMEOUT = 30
MAX_RETRIES = 3
RETRY_DELAY = 5

OUTPUT_FILENAME = "raw_opa_properties.jsonl"
