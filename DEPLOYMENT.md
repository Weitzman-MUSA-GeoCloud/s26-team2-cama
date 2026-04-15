# Deployment Documentation

This file records the commands needed to set up and deploy the infrastructure for the Philadelphia CAMA project.

## GCS Bucket CORS Configuration

To allow the web application to access files in the public bucket, set the CORS configuration using the `cors.json` file in the root of this repository.

```bash
gcloud storage buckets update gs://musa5090s26-team2-public --cors-file=cors.json
```

To verify the CORS configuration was applied:

```bash
gcloud storage buckets describe gs://musa5090s26-team2-public --format="default(cors_config)"
```

## Cloud Functions

### predict-current-assessments

```bash
gcloud functions deploy predict_current_assessments \
  --gen2 \
  --region=us-east4 \
  --runtime=python312 \
  --project=musa5090s26-team2 \
  --source=tasks/predict_current_assessments/ \
  --entry-point=predict_current_assessments \
  --service-account=data-pipeline-user@musa5090s26-team2.iam.gserviceaccount.com \
  --memory=4Gi \
  --timeout=1000s \
  --trigger-http \
  --no-allow-unauthenticated
```
