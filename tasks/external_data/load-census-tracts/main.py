import functions_framework
from google.cloud import bigquery

PROJECT_ID = "musa5090s26-team2"

# External table over census tract geometries (GeoJSON → JSON-L)
SOURCE_SQL = """
CREATE OR REPLACE EXTERNAL TABLE source.census_tracts
OPTIONS (
    format = 'NEWLINE_DELIMITED_JSON',
    uris = ['gs://musa5090s26-team2-prepared_data/external_data/census_tracts/data.jsonl']
);
"""

# External table over ACS 2022 median household income (B19013_001)
ACS_SQL = """
CREATE OR REPLACE EXTERNAL TABLE source.acs_median_income
OPTIONS (
    format = 'NEWLINE_DELIMITED_JSON',
    uris = ['gs://musa5090s26-team2-raw_data/external_data/census_tracts/acs_median_income_2022.jsonl']
);
"""

# Core table: assign each parcel its census tract + ACS median household income.
# Spatial join: parcel centroid → census tract polygon (2010 geographies).
# ACS join: on geoid10 (11-digit FIPS, e.g. '42101000101').
# median_household_income = NULL where Census suppressed data (-666666666).
CORE_SQL = """
CREATE OR REPLACE TABLE core.census_tracts AS
SELECT
    p.brt_id AS parcel_number,
    t.geoid10,
    t.tractce10,
    t.name10,
    t.aland10,
    t.awater10,
    acs.median_household_income
FROM source.pwd_parcels AS p
LEFT JOIN source.census_tracts AS t
    ON ST_WITHIN(
        ST_CENTROID(ST_GEOGFROMGEOJSON(p.geometry, make_valid => TRUE)),
        ST_GEOGFROMGEOJSON(t.geometry, make_valid => TRUE)
    )
LEFT JOIN source.acs_median_income AS acs
    ON t.geoid10 = acs.geoid10;
"""


@functions_framework.http
def load_census_tracts(request):
    """Create source tables and core parcel-to-tract-to-income mapping table."""
    try:
        client = bigquery.Client(project=PROJECT_ID)

        for dataset_id in ["source", "core"]:
            dataset = bigquery.Dataset(f"{PROJECT_ID}.{dataset_id}")
            try:
                client.get_dataset(dataset)
            except Exception:
                client.create_dataset(dataset)

        # SOURCE tables: both instant (external table definitions only)
        client.query(SOURCE_SQL).result()
        client.query(ACS_SQL).result()

        # CORE: spatial join + ACS join — submit async, don't wait
        core_job = client.query(CORE_SQL)

        return {
            "success": True,
            "message": "Census tract source tables created; core mapping submitted",
            "source_table": f"{PROJECT_ID}.source.census_tracts",
            "acs_table": f"{PROJECT_ID}.source.acs_median_income",
            "core_table": f"{PROJECT_ID}.core.census_tracts",
            "core_job_id": core_job.job_id,
        }, 200

    except Exception as e:
        return {"success": False, "error": str(e)}, 500
