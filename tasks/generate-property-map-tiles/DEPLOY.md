# Generate Property Map Tiles

This Cloud Run job converts `property_tile_info.geojson` into Mapbox Vector Tiles
and uploads them to the public GCS bucket for the front-end map.

## Deploy

Run from the repository root:

```bash
gcloud run jobs deploy generate-property-map-tiles \
  --project musa5090s26-team2 \
  --region us-east4 \
  --source tasks/generate-property-map-tiles \
  --cpu 4 \
  --memory 2Gi \
  --task-timeout 3600 \
  --service-account data-pipeline-user@musa5090s26-team2.iam.gserviceaccount.com \
  --set-env-vars "PROJECT_ID=musa5090s26-team2,TEMP_BUCKET=musa5090s26-team2-temp_data,PUBLIC_BUCKET=musa5090s26-team2-public,SOURCE_BLOB=property_tile_info.geojson,OUTPUT_PREFIX=tiles/properties,LAYER_NAME=property_tile_info"
```

## Run

```bash
gcloud run jobs execute generate-property-map-tiles \
  --project musa5090s26-team2 \
  --region us-east4
```

## Output

`gs://musa5090s26-team2-public/tiles/properties/{z}/{x}/{y}.pbf`
