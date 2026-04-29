import json
import os
from datetime import datetime, timezone

import functions_framework
from google.cloud import bigquery
from google.cloud import storage


PROJECT_ID = os.environ.get("PROJECT_ID", "musa5090s26-team2")
PUBLIC_BUCKET = os.environ.get("PUBLIC_BUCKET", "musa5090s26-team2-public")
OUTPUT_BLOB = os.environ.get("OUTPUT_BLOB", "configs/map_style_metadata.json")


METADATA_QUERY = """
WITH predicted AS (
  SELECT
    "predicted_value" AS field,
    "musa5090s26-team2.derived.current_assessments.predicted_value" AS source,
    CAST(predicted_value AS FLOAT64) AS value
  FROM `musa5090s26-team2.derived.current_assessments`
  WHERE predicted_value > 0
),
market AS (
  SELECT
    "market_value" AS field,
    "musa5090s26-team2.source.opa_assessments.market_value" AS source,
    CAST(market_value AS FLOAT64) AS value
  FROM `musa5090s26-team2.source.opa_assessments`
  WHERE market_value > 0
),
sales AS (
  SELECT
    "sales_price" AS field,
    "musa5090s26-team2.source.opa_properties.sale_price" AS source,
    SAFE_CAST(sale_price AS FLOAT64) AS value
  FROM `musa5090s26-team2.source.opa_properties`
  WHERE SAFE_CAST(sale_price AS FLOAT64) > 0
),
combined AS (
  SELECT * FROM predicted
  UNION ALL SELECT * FROM market
  UNION ALL SELECT * FROM sales
)
SELECT
  field,
  ANY_VALUE(source) AS source,
  COUNT(*) AS count,
  MIN(value) AS min,
  MAX(value) AS max,
  APPROX_QUANTILES(value, 100)[OFFSET(1)] AS p01,
  APPROX_QUANTILES(value, 100)[OFFSET(20)] AS p20,
  APPROX_QUANTILES(value, 100)[OFFSET(40)] AS p40,
  APPROX_QUANTILES(value, 100)[OFFSET(60)] AS p60,
  APPROX_QUANTILES(value, 100)[OFFSET(80)] AS p80,
  APPROX_QUANTILES(value, 100)[OFFSET(99)] AS p99
FROM combined
GROUP BY field
ORDER BY field
"""


def _to_number(value):
    if value is None:
        return None

    number = float(value)
    if number.is_integer():
        return int(number)
    return number


def build_metadata(rows):
    fields = {}

    for row in rows:
        breakpoints = [
            _to_number(row.p01),
            _to_number(row.p20),
            _to_number(row.p40),
            _to_number(row.p60),
            _to_number(row.p80),
            _to_number(row.p99),
        ]

        fields[row.field] = {
            "source": row.source,
            "count": int(row.count),
            "min": _to_number(row.min),
            "max": _to_number(row.max),
            "display_min": breakpoints[0],
            "display_max": breakpoints[-1],
            "breakpoints": breakpoints,
        }

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "generated_from": "BigQuery",
        "breakpoint_method": (
            "APPROX_QUANTILES using p01, p20, p40, p60, p80, p99 "
            "on values greater than 0"
        ),
        "fields": fields,
    }


@functions_framework.http
def generate_map_style_metadata(request):
    bigquery_client = bigquery.Client(project=PROJECT_ID)
    rows = list(bigquery_client.query(METADATA_QUERY).result())
    metadata = build_metadata(rows)

    body = json.dumps(metadata, indent=2)

    storage_client = storage.Client(project=PROJECT_ID)
    bucket = storage_client.bucket(PUBLIC_BUCKET)
    blob = bucket.blob(OUTPUT_BLOB)
    blob.cache_control = "public, max-age=300"
    blob.upload_from_string(body, content_type="application/json")

    return (
        json.dumps(
            {
                "status": "ok",
                "bucket": PUBLIC_BUCKET,
                "path": OUTPUT_BLOB,
                "url": f"https://storage.googleapis.com/{PUBLIC_BUCKET}/{OUTPUT_BLOB}",
                "fields": sorted(metadata["fields"].keys()),
            },
            indent=2,
        ),
        200,
        {"Content-Type": "application/json"},
    )
