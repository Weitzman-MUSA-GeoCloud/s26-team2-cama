CREATE OR REPLACE TABLE derived.tax_year_assessment_bins AS
WITH cleaned AS (
  SELECT
    year AS tax_year,
    market_value
  FROM source.opa_assessments
  WHERE market_value IS NOT NULL
    AND market_value >= 0
),

capped AS (
  SELECT
    tax_year,
    CASE
      WHEN market_value > 1000000 THEN 1000000
      ELSE market_value
    END AS capped_value
  FROM cleaned
),

binned AS (
  SELECT
    tax_year,
    CAST(FLOOR(capped_value / 50000) * 50000 AS INT64) AS lower_bound,
    CAST(FLOOR(capped_value / 50000) * 50000 + 50000 AS INT64) AS upper_bound
  FROM capped
)

SELECT
  tax_year,
  lower_bound,
  upper_bound,
  COUNT(*) AS property_count
FROM binned
GROUP BY tax_year, lower_bound, upper_bound
ORDER BY tax_year, lower_bound;

