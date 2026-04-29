# Generate property sale index

This utility creates a lightweight sale lookup for the frontend:

```text
gs://musa5090s26-team2-public/configs/property_sale_index.json
```

The frontend uses this file to fill `Latest Sale` and `Sale Date` for parcels that come from vector tiles and are not present in the ML search index.

Input:

```text
gs://musa5090s26-team2-public/residential_market_value.geojson
```

Output schema:

```json
{
  "schema_version": 1,
  "columns": ["id", "sale_price", "sale_date"],
  "rows": [["602169900", 1, "2006-06-23 00:00:00-04:00"]]
}
```

Run locally:

```bash
node --max-old-space-size=2048 generate-property-sale-index.js
gsutil -h "Cache-Control:public, max-age=300" cp property_sale_index.json gs://musa5090s26-team2-public/configs/property_sale_index.json
```
