import functions_framework
from google.cloud import bigquery

client = bigquery.Client()

QUERY_1_CLEAN_OPA = """
CREATE OR REPLACE TABLE `musa5090s26-team2.core.opa_cleaned` AS

WITH

step1_basic_clean AS (
  SELECT *
  FROM `musa5090s26-team2.source.opa_properties`
  WHERE
    sale_price IS NOT NULL AND sale_price != ''
    AND SAFE_CAST(sale_price AS FLOAT64) IS NOT NULL
    AND sale_date IS NOT NULL AND sale_date != ''
    AND SAFE_CAST(sale_date AS TIMESTAMP) IS NOT NULL
    AND parcel_number IS NOT NULL
    AND building_code_description IS NOT NULL AND building_code_description != ''
    AND category_code_description IS NOT NULL AND category_code_description != ''
    AND EXTRACT(YEAR FROM SAFE_CAST(sale_date AS TIMESTAMP)) >= 2021
),

step2_code_filter AS (
  SELECT *
  FROM step1_basic_clean
  WHERE
    category_code_description IN (
      'SINGLE FAMILY',
      'MULTI FAMILY',
      'APARTMENTS  > 4 UNITS'
    )
    AND REGEXP_CONTAINS(
          building_code_description,
          r'(?i)ROW|DET|SEMI|S/D|APT|CONDO'
        )
    AND NOT REGEXP_CONTAINS(
          building_code_description,
          r'(?i)VACANT|COMMERCIAL|IND|STORE|OFF|HOTEL|AUTO|SCHOOL'
        )
),

bundle_sales AS (
  SELECT sale_price, sale_date
  FROM step2_code_filter
  GROUP BY sale_price, sale_date
  HAVING COUNT(*) > 5
),

step3_no_bundles AS (
  SELECT s.*
  FROM step2_code_filter s
  WHERE NOT EXISTS (
    SELECT 1 FROM bundle_sales b
    WHERE b.sale_price = s.sale_price
      AND b.sale_date  = s.sale_date
  )
  AND SAFE_CAST(s.sale_price AS FLOAT64) >= 1000
),

price_bounds AS (
  SELECT
    APPROX_QUANTILES(SAFE_CAST(sale_price AS FLOAT64), 100)[OFFSET(99)] AS p99
  FROM step3_no_bundles
),

step4_trimmed AS (
  SELECT s.*
  FROM step3_no_bundles s
  CROSS JOIN price_bounds p
  WHERE SAFE_CAST(s.sale_price AS FLOAT64) <= p.p99
),

step5_features AS (
  SELECT
    SAFE_CAST(sale_price AS FLOAT64)     AS sale_price,
    LN(SAFE_CAST(sale_price AS FLOAT64)) AS log_price,
    parcel_number,
    CASE
      WHEN SAFE_CAST(total_livable_area AS FLOAT64) < 10000
      THEN SAFE_CAST(total_livable_area AS FLOAT64)
      ELSE NULL
    END AS total_livable_area,
    SAFE_CAST(number_of_bathrooms AS FLOAT64) AS number_of_bathrooms,
    SAFE_CAST(number_of_bedrooms AS FLOAT64)  AS number_of_bedrooms,
    CASE
      WHEN SAFE_CAST(exterior_condition AS INT64) = 0
        OR exterior_condition IS NULL THEN NULL
      ELSE SAFE_CAST(exterior_condition AS INT64)
    END AS exterior_condition,
    CASE
      WHEN SAFE_CAST(interior_condition AS INT64) = 0
        OR interior_condition IS NULL THEN NULL
      ELSE SAFE_CAST(interior_condition AS INT64)
    END AS interior_condition,
    SUBSTR(quality_grade, 1, 1) AS quality_grade_simplified,
    CASE
      WHEN (2025 - SAFE_CAST(year_built AS INT64)) >= 0
       AND (2025 - SAFE_CAST(year_built AS INT64)) <= 200
      THEN 2025 - SAFE_CAST(year_built AS INT64)
      ELSE NULL
    END AS age,
    zip_code,
    CASE
      WHEN REGEXP_EXTRACT(zoning, r'^[A-Z]+') IN (
        'RSA', 'RM', 'CMX', 'RSD', 'RMX', 'RTA', 'ICMX'
      )
      THEN REGEXP_EXTRACT(zoning, r'^[A-Z]+')
      WHEN zoning IS NULL THEN NULL
      ELSE 'other'
    END AS zoning_prefix,
    EXTRACT(YEAR  FROM SAFE_CAST(sale_date AS TIMESTAMP)) AS sale_year,
    EXTRACT(MONTH FROM SAFE_CAST(sale_date AS TIMESTAMP)) AS sale_month
  FROM step4_trimmed
)

SELECT * FROM step5_features
"""

QUERY_2_JOIN_PWD = """
CREATE OR REPLACE TABLE `musa5090s26-team2.core.opa_with_pwd` AS

SELECT
  opa.*,
  pwd.geometry AS parcel_geometry
FROM `musa5090s26-team2.core.opa_cleaned` opa
INNER JOIN `musa5090s26-team2.source.pwd_parcels` pwd
  ON opa.parcel_number = LPAD(CAST(pwd.brt_id AS STRING), 9, '0')
"""

QUERY_3_SPATIAL = """
CREATE OR REPLACE TABLE `musa5090s26-team2.core.opa_with_spatial` AS

WITH

opa_with_centroid AS (
  SELECT
    *,
    ST_CENTROID(ST_GEOGFROMGEOJSON(parcel_geometry)) AS centroid
  FROM `musa5090s26-team2.core.opa_with_pwd`
  WHERE parcel_geometry IS NOT NULL
),

crime_points AS (
  SELECT
    ST_GEOGPOINT(
      SAFE_CAST(lng AS FLOAT64),
      SAFE_CAST(lat AS FLOAT64)
    ) AS crime_point
  FROM `musa5090s26-team2.source.crime`
  WHERE
    lat IS NOT NULL AND lng IS NOT NULL
    AND SAFE_CAST(lat AS FLOAT64) IS NOT NULL
    AND SAFE_CAST(lng AS FLOAT64) IS NOT NULL
    AND EXTRACT(YEAR FROM SAFE_CAST(dispatch_date_time AS TIMESTAMP)) >= 2021
),

crime_counts AS (
  SELECT
    o.parcel_number,
    COUNT(c.crime_point) AS crime_count_500m
  FROM opa_with_centroid o
  LEFT JOIN crime_points c
    ON ST_DWITHIN(o.centroid, c.crime_point, 500)
  GROUP BY o.parcel_number
),

census_polygons AS (
  SELECT
    ct.geoid10,
    ST_GEOGFROMGEOJSON(ct.geometry) AS tract_polygon,
    acs.median_household_income
  FROM `musa5090s26-team2.source.census_tracts` ct
  LEFT JOIN `musa5090s26-team2.source.acs_median_income` acs
    USING (geoid10)
),

income_join AS (
  SELECT
    o.parcel_number,
    cp.median_household_income
  FROM opa_with_centroid o
  LEFT JOIN census_polygons cp
    ON ST_WITHIN(o.centroid, cp.tract_polygon)
)

SELECT
  o.*,
  ST_X(o.centroid) AS lng,
  ST_Y(o.centroid) AS lat,
  COALESCE(c.crime_count_500m, 0) AS crime_count_500m,
  i.median_household_income        AS median_income
FROM opa_with_centroid o
LEFT JOIN crime_counts c USING (parcel_number)
LEFT JOIN income_join i  USING (parcel_number)
"""

QUERY_4_FINAL = """
CREATE OR REPLACE TABLE `musa5090s26-team2.derived.current_assessments_model_training_data` AS

SELECT
  parcel_number,
  log_price,
  total_livable_area,
  number_of_bathrooms,
  number_of_bedrooms,
  exterior_condition,
  interior_condition,
  quality_grade_simplified,
  age,
  zip_code,
  zoning_prefix,
  sale_year,
  sale_month,
  crime_count_500m,
  median_income
FROM `musa5090s26-team2.core.opa_with_spatial`
WHERE log_price IS NOT NULL
"""


@functions_framework.http
def run_pipeline(request):
    queries = [
        ("1/4 clean_opa_data",      QUERY_1_CLEAN_OPA),
        ("2/4 join_opa_pwd",         QUERY_2_JOIN_PWD),
        ("3/4 opa_with_spatial",     QUERY_3_SPATIAL),
        ("4/4 create_training_data", QUERY_4_FINAL),
    ]

    for name, query in queries:
        print(f"Starting {name}...")
        job = client.query(query)
        job.result()
        print(f"Finished {name}!")

    return "Pipeline complete!", 200
