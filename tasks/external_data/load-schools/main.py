import functions_framework
from google.cloud import bigquery

PROJECT_ID = "musa5090s26-team2"

SOURCE_SQL = """
CREATE OR REPLACE EXTERNAL TABLE source.schools
OPTIONS (
    format = 'NEWLINE_DELIMITED_JSON',
    uris = ['gs://musa5090s26-team2-prepared_data/external_data/schools/data.jsonl']
);
"""

# Schools are Polygons (parcel boundaries, WGS84). 495 schools × 580K parcels.
# Computes distance from each parcel centroid to nearest school polygon boundary.
# Counts schools within 800m (~0.5 mile) and distance to nearest.
CORE_SQL = """
CREATE OR REPLACE TABLE core.schools AS
WITH parcel_geog AS (
    SELECT
        brt_id AS parcel_number,
        ST_GEOGFROMGEOJSON(geometry, make_valid => TRUE) AS geog
    FROM source.pwd_parcels
),
school_geog AS (
    SELECT
        objectid,
        school_name,
        grade_level,
        type,
        ST_GEOGFROMGEOJSON(geometry, make_valid => TRUE) AS geog
    FROM source.schools
    WHERE geometry IS NOT NULL AND geometry != ''
),
distances AS (
    SELECT
        p.parcel_number,
        s.objectid,
        s.grade_level,
        ST_DISTANCE(ST_CENTROID(p.geog), s.geog) AS dist_m
    FROM parcel_geog AS p
    CROSS JOIN school_geog AS s
)
SELECT
    parcel_number,
    COUNTIF(dist_m <= 800) AS schools_within_800m,
    MIN(dist_m) AS nearest_school_dist_m
FROM distances
GROUP BY parcel_number;
"""


@functions_framework.http
def load_schools(request):
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
            "message": "Schools source table created; core spatial aggregation submitted",
            "source_table": f"{PROJECT_ID}.source.schools",
            "core_table": f"{PROJECT_ID}.core.schools",
            "core_job_id": core_job.job_id,
        }, 200

    except Exception as e:
        return {"success": False, "error": str(e)}, 500
