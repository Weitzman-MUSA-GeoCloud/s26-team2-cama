CREATE OR REPLACE TABLE derived.current_assessment_bins AS
WITH cleaned AS (
    SELECT
        market_value
    FROM derived.current_assessments
    WHERE
        market_value IS NOT NULL
        AND market_value >= 0
),

capped AS (
    SELECT
        CASE
            WHEN market_value > 1000000 THEN 1000000
            ELSE market_value
        END AS capped_value
    FROM cleaned
),

binned AS (
    SELECT
        CAST(FLOOR(capped_value / 50000) * 50000 AS INT64) AS lower_bound,
        CAST(FLOOR(capped_value / 50000) * 50000 + 50000 AS INT64) AS upper_bound
    FROM capped
)

SELECT
    lower_bound,
    upper_bound,
    COUNT(*) AS property_count
FROM binned
GROUP BY lower_bound, upper_bound
ORDER BY lower_bound
