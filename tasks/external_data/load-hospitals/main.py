import functions_framework
from google.cloud import bigquery

PROJECT_ID = "musa5090s26-team2"

SOURCE_SQL = """
CREATE OR REPLACE EXTERNAL TABLE source.hospitals
OPTIONS (
    format = 'NEWLINE_DELIMITED_JSON',
    uris = ['gs://musa5090s26-team2-prepared_data/external_data/hospitals/data.jsonl']
);
"""

# Hospitals are Points (WGS84). 36 hospitals × 580K parcels = ~20M distance calcs.
# Counts hospitals within 1600m (~1 mile) and nearest distance per parcel.
CORE_SQL = """
CREATE OR REPLACE TABLE core.hospitals AS
WITH parcel_geog AS (
    SELECT
        brt_id AS parcel_number,
        ST_GEOGFROMGEOJSON(geometry, make_valid => TRUE) AS geog
    FROM source.pwd_parcels
),
hosp_geog AS (
    SELECT
        objectid,
        hospital_name,
        hospital_type,
        ST_GEOGFROMGEOJSON(geometry) AS geog
    FROM source.hospitals
    WHERE geometry IS NOT NULL AND geometry != ''
),
distances AS (
    SELECT
        p.parcel_number,
        h.objectid,
        h.hospital_type,
        ST_DISTANCE(h.geog, ST_CENTROID(p.geog)) AS dist_m
    FROM parcel_geog AS p
    CROSS JOIN hosp_geog AS h
)
SELECT
    parcel_number,
    COUNTIF(dist_m <= 1600) AS hospitals_within_1600m,
    MIN(dist_m) AS nearest_hospital_dist_m
FROM distances
GROUP BY parcel_number;
"""


@functions_framework.http
def load_hospitals(request):
    """Create source external table; submit core spatial aggregation asynchronously."""
    try:
        client = bigquery.Client(project=PROJECT_ID)

        for dataset_id in ["source", "core"]:
            dataset = bigquery.Dataset(f"{PROJECT_ID}.{dataset_id}")
            try:
                client.get_dataset(dataset)
            except Exception:
                client.create_dataset(dataset)

        client.query(SOURCE_SQL).result()
        core_job = client.query(CORE_SQL)

        return {
            "success": True,
            "message": "Hospitals source table created; core spatial aggregation submitted",
            "source_table": f"{PROJECT_ID}.source.hospitals",
            "core_table": f"{PROJECT_ID}.core.hospitals",
            "core_job_id": core_job.job_id,
        }, 200

    except Exception as e:
        return {"success": False, "error": str(e)}, 500
