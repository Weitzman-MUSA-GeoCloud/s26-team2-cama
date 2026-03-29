CREATE OR REPLACE TABLE core.pwd_parcels AS
SELECT
    brt_id AS property_id,
    *
FROM source.pwd_parcels;
