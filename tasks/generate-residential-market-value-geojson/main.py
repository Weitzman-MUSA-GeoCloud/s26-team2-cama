import json
import functions_framework
from google.cloud import bigquery, storage

PROJECT_ID = 'musa5090s26-team2'
BUCKET_PUBLIC = 'musa5090s26-team2-public'
DEST_BLOB = 'residential_market_value.geojson'

QUERY = """
SELECT
  o.parcel_number AS property_id,
  SAFE_CAST(o.market_value AS FLOAT64) AS market_value,
  o.location,
  o.shape,
  o.sale_date,
  o.sale_price,
  p.geometry
FROM `musa5090s26-team2.core.opa_properties` o
INNER JOIN `musa5090s26-team2.source.pwd_parcels` p
  ON o.parcel_number = LPAD(CAST(p.brt_id AS STRING), 9, '0')
WHERE
  o.category_code_description IN (
    'SINGLE FAMILY',
    'MULTI FAMILY',
    'APARTMENTS  > 4 UNITS'
  )
  AND SAFE_CAST(o.market_value AS FLOAT64) IS NOT NULL
  AND SAFE_CAST(o.market_value AS FLOAT64) > 0
  AND p.geometry IS NOT NULL
"""


@functions_framework.http
def generate_residential_market_value_geojson(request):
    """
    Query all residential OPA properties, join with PWD parcel geometry,
    and write a GeoJSON FeatureCollection to the public GCS bucket.
    """
    try:
        bq_client = bigquery.Client(project=PROJECT_ID)
        storage_client = storage.Client(project=PROJECT_ID)

        rows = bq_client.query(QUERY).result()

        bucket = storage_client.bucket(BUCKET_PUBLIC)
        blob = bucket.blob(DEST_BLOB)

        feature_count = 0

        with blob.open('w') as f:
            f.write('{"type":"FeatureCollection","features":[\n')
            first = True
            for row in rows:
                try:
                    geometry = json.loads(row.geometry)
                except (json.JSONDecodeError, TypeError):
                    continue

                feature = {
                    'type': 'Feature',
                    'geometry': geometry,
                    'properties': {
                        'property_id': row.property_id,
                        'market_value': row.market_value,
                        'location': row.location,
                        'shape': row.shape,
                        'sale_date': row.sale_date,
                        'sale_price': row.sale_price,
                    },
                }

                if not first:
                    f.write(',\n')
                f.write(json.dumps(feature))
                first = False
                feature_count += 1

            f.write('\n]}')

        return {
            'success': True,
            'message': 'Residential market value GeoJSON generated',
            'destination': f'gs://{BUCKET_PUBLIC}/{DEST_BLOB}',
            'feature_count': feature_count,
        }, 200

    except Exception as e:
        return {'success': False, 'error': str(e)}, 500
