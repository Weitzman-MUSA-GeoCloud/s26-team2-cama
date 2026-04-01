import functions_framework
from google.cloud import bigquery

PROJECT_ID = "musa5090s26-team2"

SOURCE_SQL = """
CREATE OR REPLACE EXTERNAL TABLE source.transit
OPTIONS (
    format = 'NEWLINE_DELIMITED_JSON',
    uris = ['gs://musa5090s26-team2-prepared_data/external_data/transit/data.jsonl']
);
"""

# Transit: use lon/lat columns (WGS84). x/y are Web Mercator — not used.
# Counts unique stops within 400m (~quarter mile) and distance to nearest.
CORE_SQL = """
CREATE OR REPLACE TABLE core.transit AS
WITH parcel_geog AS (
    SELECT
        brt_id AS parcel_number,
        ST_GEOGFROMGEOJSON(geometry, make_valid => TRUE) AS geog
    FROM source.pwd_parcels
),
stop_geog AS (
    SELECT
        stopid,
        stopname,
        lineabbr,
        ST_GEOGPOINT(
            SAFE_CAST(lon AS FLOAT64),
            SAFE_CAST(lat AS FLOAT64)
        ) AS geog
    FROM source.transit
    WHERE lon IS NOT NULL AND lat IS NOT NULL AND lon != '' AND lat != ''
),
distances AS (
    SELECT
        p.parcel_number,
        s.stopid,
        s.lineabbr,
        ST_DISTANCE(s.geog, ST_CENTROID(p.geog)) AS dist_m
    FROM parcel_geog AS p
    CROSS JOIN stop_geog AS s
)
SELECT
    parcel_number,
    COUNTIF(dist_m <= 400) AS transit_stops_within_400m,
    COUNT(DISTINCT IF(dist_m <= 400, lineabbr, NULL)) AS transit_lines_within_400m,
    MIN(dist_m) AS nearest_stop_dist_m
FROM distances
GROUP BY parcel_number;
"""


@functions_framework.http
def load_transit(request):
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
            "message": "Transit source table created; core spatial aggregation submitted",
            "source_table": f"{PROJECT_ID}.source.transit",
            "core_table": f"{PROJECT_ID}.core.transit",
            "core_job_id": core_job.job_id,
        }, 200

    except Exception as e:
        return {"success": False, "error": str(e)}, 500
