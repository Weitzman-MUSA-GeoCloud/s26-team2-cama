# EDA Report: Property Value Feature Analysis

## Overview

This document summarizes the findings from exploratory data analysis on the `opa_properties` table and external datasets. It is intended to guide the Scripting and DA roles in building the feature engineering pipeline.

**Target variable:** `log(sale_price)`

------------------------------------------------------------------------

## Part 1: For Scripting — Data to Upload

The following datasets need to be uploaded to the cloud as external tables. The raw files should be uploaded as-is; transformation logic is handled in Part 2.

### OPA Properties

-   **Source:** Internal `opa_properties` table
-   **Already available in cloud**
-   **Key field:** `parcel_number`

### Crime Data

-   **Source:** OpenDataPhilly — Philadelphia Police Department Incidents
-   **File format:** CSV
-   **Key fields:** `lat`, `lng`, `text_general_code`, `dispatch_date`
-   **Notes:** Contains 169,017 rows. Used for spatial aggregation within 500m buffer of each parcel.

### PPR (Parks & Recreation)

-   **Source:** OpenDataPhilly — PPR Assets
-   **File format:** CSV
-   **Key fields:** `X` (lng), `Y` (lat), `PARK_NAME`, `SITE_CLASS`
-   **Notes:** 171 rows. Used to calculate nearest park distance per parcel.

### Transit Stops

-   **Source:** SEPTA — Bus/Rail Stop Locations
-   **File format:** CSV
-   **Key fields:** `Lat`, `Lon`, `StopName`, `LineAbbr`
-   **Notes:** 22,478 rows. Used to calculate nearest transit stop distance per parcel.

### Census Data (ACS 2022)

-   **Source:** US Census Bureau, American Community Survey 5-Year Estimates
-   **Pulled via:** `tidycensus` R package
-   **Geography:** Census tract, Philadelphia County, PA
-   **Variables:**
    -   `B19013_001` — Median household income
    -   `B17001_002` — Population below poverty level
    -   `B15003_022` — Bachelor's degree attainment
-   **Notes:** Includes tract geometry for spatial join to parcels.

------------------------------------------------------------------------

## Part 2: For DA — Cleaning & Feature Engineering

### Step 1: Base Cleaning on OPA Table

Apply the following filters before any feature engineering:

``` sql
-- Remove non-arm's-length transfers
WHERE sale_price > 1000

-- Remove bundle sales (same price + same date = likely multi-property bundle)
AND (sale_price, sale_date) NOT IN (
    SELECT sale_price, sale_date
    FROM opa_properties
    GROUP BY sale_price, sale_date
    HAVING COUNT(*) > 1
)

-- Keep residential properties only
AND category_code_description ILIKE '%residential%'
AND building_code_description ~ 'ROW|DET|SEMI|S/D|APT|CONDO'
AND building_code_description !~ 'VACANT|COMMERCIAL|IND|STORE|OFF|HOTEL|AUTO|SCHOOL'

-- Keep recent sales only (data before 2022 is sparse and unreliable)
AND EXTRACT(YEAR FROM sale_date) >= 2022

-- Trim sale_price to 1st-99th percentile (approx $3k - $1.7M)
AND sale_price BETWEEN [1st_pct] AND [99th_pct]
```

**Target variable:**

``` sql
log_price = LN(sale_price)
```

------------------------------------------------------------------------

### Step 2: Structural Features

| feature | transformation | reason |
|----|----|----|
| `total_livable_area` | Filter `< 10,000` sqft, keep as numeric | Values above 10k are data errors; Spearman r = 0.25 |
| `number_of_bathrooms` | Cap at 95th percentile | Strong signal (r = 0.43); extreme values up to 12 |
| `number_of_bedrooms` | Cap at 95th percentile | Weak signal (r = 0.11); extreme values up to 30 |
| `exterior_condition` | Treat as ordinal numeric; recode 0 and NA as NULL | Clear monotonic signal; condition 1-3 priced significantly higher |
| `interior_condition` | Same as exterior | Moderate signal; check collinearity with exterior in model |
| `quality_grade` | Extract first letter only: `SUBSTR(quality_grade, 1, 1)` | Signal present but sub-categories (A+/A\*/A-) too fragmented |
| `year_built` | Convert to `age = 2025 - year_built`; set NULL if age \< 0 or \> 200 | Spearman r = -0.15; older properties tend to be cheaper |
| `number_stories` | Drop | Spearman r = 0.09, too weak |
| `total_area` | Drop | Spearman r = 0.03, near zero signal |
| `type_heater` | Drop | 31% missing, low expected signal |
| `building_code_description` | Drop | Already filtered to residential; too many categories |

------------------------------------------------------------------------

### Step 3: Location Features

| feature | transformation | reason |
|----|----|----|
| `zip_code` | Keep as categorical | Strongest location signal; median log_price sd = 2.54 across zip codes |
| `zoning` | Extract prefix: `REGEXP_EXTRACT(zoning, '^[A-Z]+')` then consolidate rare categories to 'other' | 15 prefixes after simplification; signal present |
| `census_tract` | Drop | zip_code already captures location signal (zip sd 2.54 vs tract sd 0.95) |
| `geographic_ward` | Drop | Weaker signal than zip; political boundary not meaningful for price |
| `topography` | Drop | High variance within categories, low signal |
| `view_type` | Drop | Near-zero signal |
| `site_type` | Drop | Field is empty |

**Coordinate extraction from `shape` field:**

``` sql
-- shape field is SRID=2272 (PA State Plane)
-- Extract and reproject to WGS84 (SRID=4326)
ST_X(ST_Transform(shape::geometry, 4326)) AS lng,
ST_Y(ST_Transform(shape::geometry, 4326)) AS lat
```

------------------------------------------------------------------------

### Step 4: Temporal Features

| feature | transformation | reason |
|----|----|----|
| `sale_year` | Extract from `sale_date` | Market cycle signal |
| `sale_month` | Extract from `sale_date` | Strong seasonal signal; May prices \~30% higher than December in log scale |
| `sale_date` raw | Drop after extraction | Not needed after year/month extracted |
| `recording_date` | Drop | Redundant with sale_date |
| `assessment_date` | Drop | Redundant |
| `market_value_date` | Drop | Redundant |

**Note:** Only keep records where `sale_year >= 2022`. Data before 2022 is extremely sparse (\< 200 records/year) and unreliable.

------------------------------------------------------------------------

### Step 5: External Features

All external features require spatial join using parcel coordinates (lat/lng extracted from `shape` field).

#### Crime Count (500m buffer)

```         
crime_count_500m = COUNT of crime incidents within 500m of parcel centroid
```

-   Spearman r with log_price = **-0.17**
-   Use all crime types; filter to records from 2022 onwards to match sale data
-   Join method: ST_DWithin(parcel_point, crime_point, 500m)

#### Median Income (Census tract)

```         
median_income = B19013_001 from ACS 2022 at census tract level
```

-   Spearman r with log_price = **0.41** — strongest external signal
-   Join method: point-in-polygon (parcel centroid within tract polygon)
-   Note: highly correlated with poverty_rate (r = -0.75) and bach_degree_rate (r = 0.74) — only keep median_income

#### Drop these external features

| feature | reason |
|----|----|
| `dist_to_park` | Spearman r = 0.04, no signal |
| `dist_to_transit` | Spearman r = -0.03, no signal (transit stops too dense in Philadelphia, median distance only 127m) |
| `poverty_rate` | Collinear with median_income (r = -0.75) |
| `bach_degree_rate` | Collinear with median_income (r = 0.74) |

------------------------------------------------------------------------

### Final Feature List

| feature                    | type        | source          |
|----------------------------|-------------|-----------------|
| `log_price`                | target      | opa_properties  |
| `total_livable_area`       | numeric     | opa_properties  |
| `number_of_bathrooms`      | numeric     | opa_properties  |
| `number_of_bedrooms`       | numeric     | opa_properties  |
| `exterior_condition`       | ordinal     | opa_properties  |
| `interior_condition`       | ordinal     | opa_properties  |
| `quality_grade_simplified` | categorical | opa_properties  |
| `age`                      | numeric     | opa_properties  |
| `zip_code`                 | categorical | opa_properties  |
| `zoning_prefix`            | categorical | opa_properties  |
| `sale_year`                | numeric     | opa_properties  |
| `sale_month`               | numeric     | opa_properties  |
| `crime_count_500m`         | numeric     | crime CSV       |
| `median_income`            | numeric     | Census ACS 2022 |
------------------------------------------------------------------------

## Notes

-   Interaction between `zip_code` × `total_livable_area` was explored but found to be weak — location intercept differences dominate over slope differences. Tree-based models should capture this automatically.
-   `market_value` field in OPA table was not used — target is `sale_price` (actual transaction price), not OPA's estimate.
-   Sample weights based on recency (`sale_age`) were considered but not implemented — data is already limited to 2022-2025 so temporal bias is minimal.
