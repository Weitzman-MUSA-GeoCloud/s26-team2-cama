# Deploy
```shell
gcloud functions deploy generate-assessment-chart-configs \
--gen2 \
--region=us-east4 \
--runtime=python312 \
--project=musa5090s26-team2 \
--source=tasks/generate_assessment_chart_configs/ \
--entry-point=generate_assessment_chart_configs \
--service-account=data-pipeline-user@musa5090s26-team2.iam.gserviceaccount.com \
--memory=512Mi \
--timeout=300s \
--trigger-http \
--no-allow-unauthenticated
```

Run from the repo root directory.

# Test
```shell
gcloud functions call generate-assessment-chart-configs \
--project=musa5090s26-team2 \
--region=us-east4
```
