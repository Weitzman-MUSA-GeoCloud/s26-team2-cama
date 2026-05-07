# Generate Map Style Metadata

This HTTP Cloud Function generates front-end map style metadata and uploads:

`gs://musa5090s26-team2-public/configs/map_style_metadata.json`

## Deploy

Run from the repository root:

```bash
gcloud functions deploy generate-map-style-metadata \
  --gen2 \
  --runtime python312 \
  --region us-east4 \
  --project musa5090s26-team2 \
  --source tasks/generate-map-style-metadata \
  --entry-point generate_map_style_metadata \
  --trigger-http \
  --service-account data-pipeline-user@musa5090s26-team2.iam.gserviceaccount.com \
  --set-env-vars PROJECT_ID=musa5090s26-team2,PUBLIC_BUCKET=musa5090s26-team2-public,OUTPUT_BLOB=configs/map_style_metadata.json
```

## Run

```bash
gcloud functions call generate-map-style-metadata \
  --gen2 \
  --region us-east4 \
  --project musa5090s26-team2
```
