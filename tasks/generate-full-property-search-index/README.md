# Generate full property search index

This utility creates the frontend search/detail index with residential market coverage and ML predictions merged by property ID.

Output:

```text
gs://musa5090s26-team2-public/configs/property_search_index.json
```

Inputs:

```text
https://storage.googleapis.com/musa5090s26-team2-public/residential_market_value.geojson
https://storage.googleapis.com/musa5090s26-team2-public/configs/property_search_index.json
```

The residential market GeoJSON provides broad parcel coverage, `market_value`, `location`, `sale_price`, and `sale_date`.
The existing search index provides ML fields for parcels with predictions.

Run:

```bash
node --max-old-space-size=4096 generate-full-property-search-index.js
gsutil -h "Cache-Control:public, max-age=300" cp property_search_index_full.json gs://musa5090s26-team2-public/configs/property_search_index.json
```
