# Generate Property Search Index

This HTTP Cloud Function exports a lightweight front-end search/detail index.
It intentionally excludes parcel geometry; the map uses vector tiles.

## Output

`gs://musa5090s26-team2-public/configs/property_search_index.json`

## Deploy

Run from the repository root:

```bash
gcloud functions deploy generate-property-search-index \
  --gen2 \
  --runtime python312 \
  --region us-east4 \
  --project musa5090s26-team2 \
  --source tasks/generate-property-search-index \
  --entry-point generate_property_search_index \
  --trigger-http \
  --service-account data-pipeline-user@musa5090s26-team2.iam.gserviceaccount.com \
  --memory 1Gi \
  --timeout 540s \
  --set-env-vars PROJECT_ID=musa5090s26-team2,PUBLIC_BUCKET=musa5090s26-team2-public,OUTPUT_BLOB=configs/property_search_index.json
```

## Run

```bash
gcloud functions call generate-property-search-index \
  --gen2 \
  --region us-east4 \
  --project musa5090s26-team2
```
