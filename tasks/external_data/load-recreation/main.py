import functions_framework
from google.cloud import bigquery

PROJECT_ID = "musa5090s26-team2"

SOURCE_SQL = """
CREATE OR REPLACE EXTERNAL TABLE source.recreation
OPTIONS (
    format = 'NEWLINE_DELIMITED_JSON',
    uris = ['gs://musa5090s26-team2-prepared_data/external_data/recreation/data.jsonl']
);
"""

# Recreation X=longitude, Y=latitude (already WGS84).
# CROSS JOIN is feasible: ~580K parcels × ~300 facilities = ~174M distance calcs.
# Counts facilities within 800m (~0.5 mile) and distance to nearest.
CORE_SQL = """
CREATE OR REPLACE TABLE core.recreation AS
WITH parcel_geog AS (
    SELECT
        brt_id AS parcel_number,
        ST_GEOGFROMGEOJSON(geometry, make_valid => TRUE) AS geog
    FROM source.pwd_parcels
),
rec_geog AS (
    SELECT
        objectid,
        park_name,
        program_type,
        ST_GEOGPOINT(
            SAFE_CAST(x AS FLOAT64),
            SAFE_CAST(y AS FLOAT64)
        ) AS geog
    FROM source.recreation
    WHERE x IS NOT NULL AND y IS NOT NULL AND x != '' AND y != ''
),
distances AS (
    SELECT
        p.parcel_number,
        r.objectid,
        ST_DISTANCE(r.geog, ST_CENTROID(p.geog)) AS dist_m
    FROM parcel_geog AS p
    CROSS JOIN rec_geog AS r
)
SELECT
    parcel_number,
    COUNTIF(dist_m <= 800) AS rec_count_within_800m,
    MIN(dist_m) AS nearest_rec_dist_m
FROM distances
GROUP BY parcel_number;
"""


@functions_framework.http
def load_recreation(request):
    """Create source external table; submit core spatial aggregation asynchronously."""
    try:
        client = bigquery.Client(project=PROJECT_ID)

        for dataset_id in ["source", "core"]:
            dataset = bigquery.Dataset(f"{PROJECT_ID}.{dataset_id}")
            try:
                client.get_dataset(dataset)
            except Exception:
                client.create_dataset(dataset)

        # SOURCE: instant (external table definition only)
        client.query(SOURCE_SQL).result()

        # CORE: spatial aggregation — submit async, don't wait
        core_job = client.query(CORE_SQL)

        return {
            "success": True,
            "message": "Recreation source table created; core spatial aggregation submitted",
            "source_table": f"{PROJECT_ID}.source.recreation",
            "core_table": f"{PROJECT_ID}.core.recreation",
            "core_job_id": core_job.job_id,
        }, 200

    except Exception as e:
        return {"success": False, "error": str(e)}, 500
