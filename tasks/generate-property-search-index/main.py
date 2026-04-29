import json
import os

import functions_framework
from google.cloud import bigquery
from google.cloud import storage


PROJECT_ID = os.environ.get("PROJECT_ID", "musa5090s26-team2")
PUBLIC_BUCKET = os.environ.get("PUBLIC_BUCKET", "musa5090s26-team2-public")
OUTPUT_BLOB = os.environ.get("OUTPUT_BLOB", "configs/property_search_index.json")
LOCAL_TMP = "/tmp/property_search_index.json"

COLUMNS = [
    "id",
    "address",
    "property_type",
    "bldg_desc",
    "lat",
    "lng",
    "market_value",
    "predicted_value",
    "change_percent",
    "lot_size",
    "zip_code",
    "neighborhood",
    "sale_year",
    "sale_month",
    "sale_price",
    "sale_date",
]


QUERY = """
SELECT
    ca.property_id,
    ca.predicted_value,
    ca.predicted_log_value,
    ca.predicted_at,

    mt.log_price,
    mt.zip_code,
    mt.sale_year,
    mt.sale_month,

    p.address,
    p.bldg_desc,
    p.gross_area,
    p.geometry,

    op.sale_price,
    op.sale_date

FROM `musa5090s26-team2.derived.current_assessments` AS ca

LEFT JOIN `musa5090s26-team2.derived.current_assessments_model_training_data` AS mt
    ON mt.parcel_number = ca.property_id

LEFT JOIN `musa5090s26-team2.source.pwd_parcels` AS p
    ON LPAD(CAST(p.brt_id AS STRING), 9, '0') = ca.property_id

LEFT JOIN `musa5090s26-team2.source.opa_properties` AS op
    ON op.parcel_number = ca.property_id

WHERE p.geometry IS NOT NULL
"""


def _to_float(value):
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number else None


def _centroid_from_geometry(geometry_text):
    try:
        geometry = json.loads(geometry_text)
    except (TypeError, json.JSONDecodeError):
        return None, None

    coordinates = geometry.get("coordinates")
    if not coordinates:
        return None, None

    if geometry.get("type") == "Point":
        return _to_float(coordinates[0]), _to_float(coordinates[1])

    ring = None
    if geometry.get("type") == "Polygon":
        ring = coordinates[0]
    elif geometry.get("type") == "MultiPolygon":
        ring = coordinates[0][0] if coordinates and coordinates[0] else None

    if not ring:
        return None, None

    lngs = [_to_float(coord[0]) for coord in ring if len(coord) >= 2]
    lats = [_to_float(coord[1]) for coord in ring if len(coord) >= 2]
    lngs = [value for value in lngs if value is not None]
    lats = [value for value in lats if value is not None]
    if not lngs or not lats:
        return None, None

    return sum(lngs) / len(lngs), sum(lats) / len(lats)


def _build_record(row):
    lng, lat = _centroid_from_geometry(row.geometry)
    predicted_value = _to_float(row.predicted_value)
    log_price = _to_float(row.log_price)
    market_value = None
    if log_price is not None:
        # Avoid importing math for one operation in Cloud Functions cold starts.
        market_value = 2.718281828459045 ** log_price

    change_percent = None
    if market_value and predicted_value:
        change_percent = ((predicted_value - market_value) / market_value) * 100

    return {
        "id": str(row.property_id or ""),
        "address": row.address or "Address not available",
        "property_type": row.bldg_desc or "Residential",
        "bldg_desc": row.bldg_desc,
        "lat": lat,
        "lng": lng,
        "market_value": market_value,
        "last_year_value": market_value,
        "tax_year_value": market_value,
        "predicted_value": predicted_value,
        "predicted_log_value": _to_float(row.predicted_log_value),
        "change_percent": change_percent,
        "lot_size": _to_float(row.gross_area),
        "zip_code": row.zip_code,
        "neighborhood": row.zip_code,
        "sale_year": int(row.sale_year) if row.sale_year is not None else None,
        "sale_month": int(row.sale_month) if row.sale_month is not None else None,
        "sale_price": _to_float(row.sale_price),
        "sale_date": row.sale_date,
        "has_prediction": predicted_value is not None,
    }


def _round_value(value, digits=2):
    number = _to_float(value)
    return round(number, digits) if number is not None else None


def _build_row(record):
    return [
        record["id"],
        record["address"],
        record["property_type"],
        record["bldg_desc"],
        _round_value(record["lat"], 7),
        _round_value(record["lng"], 7),
        _round_value(record["market_value"], 0),
        _round_value(record["predicted_value"], 0),
        _round_value(record["change_percent"], 2),
        _round_value(record["lot_size"], 0),
        record["zip_code"],
        record["neighborhood"],
        record["sale_year"],
        record["sale_month"],
        _round_value(record["sale_price"], 0),
        record["sale_date"],
    ]


@functions_framework.http
def generate_property_search_index(request):
    bq_client = bigquery.Client(project=PROJECT_ID)
    storage_client = storage.Client(project=PROJECT_ID)

    rows = bq_client.query(QUERY).result()
    count = 0

    with open(LOCAL_TMP, "w", encoding="utf-8") as handle:
        handle.write('{"schema_version":1,"columns":')
        handle.write(json.dumps(COLUMNS, separators=(",", ":")))
        handle.write(',"rows":[\n')
        first = True
        for row in rows:
            record = _build_record(row)
            if not record["id"]:
                continue
            if not first:
                handle.write(",\n")
            handle.write(json.dumps(_build_row(record), default=str, separators=(",", ":")))
            first = False
            count += 1
        handle.write("\n]}")

    bucket = storage_client.bucket(PUBLIC_BUCKET)
    blob = bucket.blob(OUTPUT_BLOB)
    blob.cache_control = "public, max-age=300"
    blob.upload_from_filename(LOCAL_TMP, content_type="application/json")

    return (
        json.dumps(
            {
                "status": "ok",
                "count": count,
                "path": f"gs://{PUBLIC_BUCKET}/{OUTPUT_BLOB}",
                "url": f"https://storage.googleapis.com/{PUBLIC_BUCKET}/{OUTPUT_BLOB}",
            },
            indent=2,
        ),
        200,
        {"Content-Type": "application/json"},
    )
