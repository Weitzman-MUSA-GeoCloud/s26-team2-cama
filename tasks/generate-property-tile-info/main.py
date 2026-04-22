import json
import os
import functions_framework
from google.cloud import bigquery
from google.cloud import storage

PROJECT_ID = "musa5090s26-team2"
BUCKET_TEMP = "musa5090s26-team2-temp_data"
OUTPUT_BLOB = "property_tile_info.geojson"
LOCAL_TMP = "/tmp/property_tile_info.geojson"

# Join key relationships (verified against actual BigQuery schemas):
#   current_assessments.property_id (STRING)
#   = current_assessments_model_training_data.parcel_number (STRING)
#   = LPAD(CAST(pwd_parcels.brt_id AS STRING), 9, '0')
QUERY = """
SELECT
    ca.property_id,
    ca.predicted_value,
    ca.predicted_log_value,
    ca.predicted_at,

    mt.log_price,
    mt.total_livable_area,
    mt.number_of_bathrooms,
    mt.number_of_bedrooms,
    mt.exterior_condition,
    mt.interior_condition,
    mt.quality_grade_simplified,
    mt.age,
    mt.zip_code,
    mt.zoning_prefix,
    mt.sale_year,
    mt.sale_month,
    mt.crime_count_500m,
    mt.median_income,

    p.address,
    p.owner1,
    p.owner2,
    p.bldg_desc,
    p.gross_area,
    p.geometry

FROM `musa5090s26-team2.derived.current_assessments` AS ca

LEFT JOIN `musa5090s26-team2.derived.current_assessments_model_training_data` AS mt
    ON mt.parcel_number = ca.property_id

LEFT JOIN `musa5090s26-team2.source.pwd_parcels` AS p
    ON LPAD(CAST(p.brt_id AS STRING), 9, '0') = ca.property_id

WHERE p.geometry IS NOT NULL
"""


@functions_framework.http
def generate_property_tile_info(request):
    """
    Join current_assessments, current_assessments_model_training_data, and
    pwd_parcels, then export the result as a GeoJSON FeatureCollection to
    gs://musa5090s26-team2-temp_data/property_tile_info.geojson
    """
    try:
        bq_client = bigquery.Client(project=PROJECT_ID)
        storage_client = storage.Client(project=PROJECT_ID)

        print("Running BigQuery join query...")
        query_job = bq_client.query(QUERY)
        rows = query_job.result()

        print("Writing GeoJSON to temp file...")
        feature_count = 0

        with open(LOCAL_TMP, "w", encoding="utf-8") as f:
            f.write('{"type":"FeatureCollection","features":[\n')
            first = True

            for row in rows:
                # Parse geometry JSON string back to a GeoJSON geometry object
                try:
                    geometry = json.loads(row.geometry)
                except (TypeError, json.JSONDecodeError):
                    continue

                # Build properties from all non-geometry columns
                properties = {k: v for k, v in dict(row).items() if k != "geometry"}

                feature = {
                    "type": "Feature",
                    "geometry": geometry,
                    "properties": properties,
                }

                if not first:
                    f.write(",\n")
                f.write(json.dumps(feature, default=str))
                first = False
                feature_count += 1

                if feature_count % 10000 == 0:
                    print(f"  Written {feature_count} features...")

            f.write("\n]}")

        print(f"Total features written: {feature_count}")

        # Upload to GCS
        print(f"Uploading to gs://{BUCKET_TEMP}/{OUTPUT_BLOB}...")
        bucket = storage_client.bucket(BUCKET_TEMP)
        blob = bucket.blob(OUTPUT_BLOB)
        blob.upload_from_filename(LOCAL_TMP, content_type="application/geo+json")

        os.remove(LOCAL_TMP)

        return {
            "status": "success",
            "message": f"GeoJSON written with {feature_count} features",
            "gcs_path": f"gs://{BUCKET_TEMP}/{OUTPUT_BLOB}",
        }, 200

    except Exception as e:
        print(f"Error: {str(e)}")
        if os.path.exists(LOCAL_TMP):
            os.remove(LOCAL_TMP)
        return {"status": "error", "message": str(e)}, 500
