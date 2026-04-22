import functions_framework
from google.cloud import bigquery

PROJECT_ID = "musa5090s26-team2"

SOURCE_SQL = """
CREATE OR REPLACE EXTERNAL TABLE source.crime
OPTIONS (
    format = 'NEWLINE_DELIMITED_JSON',
    uris = ['gs://musa5090s26-team2-prepared_data/external_data/crime/data.jsonl']
);
"""

# Point-in-polygon join: crime (WGS84 lng/lat) → PWD parcel polygons.
# brt_id in pwd_parcels equals parcel_number in OPA.
CORE_SQL = """
CREATE OR REPLACE TABLE core.crime AS
SELECT
    p.brt_id AS parcel_number,
    COUNT(c.dc_key) AS crime_count,
    COUNTIF(SAFE_CAST(c.ucr_general AS INT64) BETWEEN 100 AND 199)
        AS violent_crime_count,
    COUNTIF(SAFE_CAST(c.ucr_general AS INT64) BETWEEN 200 AND 299)
        AS property_crime_count
FROM source.pwd_parcels AS p
LEFT JOIN source.crime AS c
    ON ST_WITHIN(
        ST_GEOGPOINT(
            SAFE_CAST(c.lng AS FLOAT64),
            SAFE_CAST(c.lat AS FLOAT64)
        ),
        ST_GEOGFROMGEOJSON(p.geometry, make_valid => TRUE)
    )
WHERE c.lng IS NOT NULL AND c.lat IS NOT NULL
    AND c.lng != '' AND c.lat != ''
GROUP BY p.brt_id;
"""


@functions_framework.http
def load_crime(request):
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

        # CORE: expensive spatial join — submit async, don't wait
        core_job = client.query(CORE_SQL)

        return {
            "success": True,
            "message": "Crime source table created; core spatial aggregation submitted",
            "source_table": f"{PROJECT_ID}.source.crime",
            "core_table": f"{PROJECT_ID}.core.crime",
            "core_job_id": core_job.job_id,
        }, 200

    except Exception as e:
        return {"success": False, "error": str(e)}, 500
