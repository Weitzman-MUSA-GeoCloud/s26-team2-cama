# Deploy

```shell
gcloud functions deploy generate-property-tile-info \
--gen2 \
--region=us-east4 \
--runtime=python312 \
--project=musa5090s26-team2 \
--source=tasks/generate-property-tile-info/ \
--entry-point=generate_property_tile_info \
--service-account=data-pipeline-user@musa5090s26-team2.iam.gserviceaccount.com \
--memory=2Gi \
--timeout=540s \
--trigger-http \
--no-allow-unauthenticated
```

Run from the repo root directory.

# Test

```shell
gcloud functions call generate-property-tile-info \
--project=musa5090s26-team2 \
--region=us-east4
```
