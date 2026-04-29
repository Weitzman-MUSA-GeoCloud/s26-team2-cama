#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-musa5090s26-team2}"
TEMP_BUCKET="${TEMP_BUCKET:-musa5090s26-team2-temp_data}"
PUBLIC_BUCKET="${PUBLIC_BUCKET:-musa5090s26-team2-public}"
SOURCE_BLOB="${SOURCE_BLOB:-property_tile_info.geojson}"
OUTPUT_PREFIX="${OUTPUT_PREFIX:-tiles/properties}"
LAYER_NAME="${LAYER_NAME:-property_tile_info}"

gcloud storage cp "gs://${TEMP_BUCKET}/${SOURCE_BLOB}" "./${SOURCE_BLOB}" --project "${PROJECT_ID}"

rm -rf ./properties
ogr2ogr \
  -f MVT \
  -dsco MINZOOM=12 \
  -dsco MAXZOOM=18 \
  -dsco COMPRESS=NO \
  -dsco NAME="${LAYER_NAME}" \
  ./properties \
  "./${SOURCE_BLOB}"

gcloud storage cp \
  --recursive \
  ./properties \
  "gs://${PUBLIC_BUCKET}/${OUTPUT_PREFIX}" \
  --project "${PROJECT_ID}"
