import functions_framework
from google.cloud import bigquery

PROJECT_ID = "musa5090s26-team2"

# External table over raw JSON-L — natural key is geoid10
SOURCE_SQL = """
CREATE OR REPLACE EXTERNAL TABLE source.census_tracts
OPTIONS (
    format = 'NEWLINE_DELIMITED_JSON',
    uris = ['gs://musa5090s26-team2-prepared_data/external_data/census_tracts/data.jsonl']
);
"""

# Core table: assign each parcel its census tract via centroid-in-polygon join.
# Output key is parcel_number (brt_id), with geoid10 as the tract identifier.
# This enables downstream joins to ACS demographic data via geoid10.
# Uses parcel centroid (ST_CENTROID) against census tract polygons.
CORE_SQL = """
CREATE OR REPLACE TABLE core.census_tracts AS
SELECT
    p.brt_id AS parcel_number,
    t.geoid10,
    t.tractce10,
    t.name10,
    t.namelsad10,
    t.aland10,
    t.awater10
FROM source.pwd_parcels AS p
LEFT JOIN source.census_tracts AS t
    ON ST_WITHIN(
        ST_CENTROID(
            ST_GEOGFROMGEOJSON(p.geometry, make_valid => TRUE)
        ),
        ST_GEOGFROMGEOJSON(t.geometry, make_valid => TRUE)
    );
"""


@functions_framework.http
def load_census_tracts(request):
    """Create source external table and core parcel-to-tract mapping table."""
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

        # CORE: spatial join parcel centroids → census tract polygons — submit async
        core_job = client.query(CORE_SQL)

        return {
            "success": True,
            "message": "Census tract source table created; core parcel-tract mapping submitted",
            "source_table": f"{PROJECT_ID}.source.census_tracts",
            "core_table": f"{PROJECT_ID}.core.census_tracts",
            "core_job_id": core_job.job_id,
        }, 200

    except Exception as e:
        return {"success": False, "error": str(e)}, 500
