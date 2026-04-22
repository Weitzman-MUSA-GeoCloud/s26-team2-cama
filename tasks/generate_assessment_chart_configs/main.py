import json
import functions_framework
from google.cloud import bigquery
from google.cloud import storage


@functions_framework.http
def generate_assessment_chart_configs(request):
    """
    Generate JSON configuration files for assessment distribution charts.

    Queries two BigQuery tables and creates two JSON files:
    - tax_year_assessment_bins.json from derived.tax_year_assessment_bins
    - current_assessment_bins.json from derived.current_assessment_bins

    Both files are uploaded to gs://musa5090s26-team2-public/configs/
    """
    try:
        # Initialize clients
        bq_client = bigquery.Client(project='musa5090s26-team2')
        storage_client = storage.Client(project='musa5090s26-team2')

        # Get bucket reference
        bucket = storage_client.bucket('musa5090s26-team2-public')

        # Query and process tax year assessment bins
        tax_year_data = _query_and_format_bins(
            bq_client,
            'musa5090s26-team2.derived.tax_year_assessment_bins',
            include_tax_year=True
        )

        if tax_year_data is not None:
            _upload_json_to_gcs(
                bucket,
                'configs/tax_year_assessment_bins.json',
                tax_year_data
            )

        # Query and process current assessment bins
        current_data = _query_and_format_bins(
            bq_client,
            'musa5090s26-team2.derived.current_assessment_bins',
            include_tax_year=False
        )

        if current_data is not None:
            _upload_json_to_gcs(
                bucket,
                'configs/current_assessment_bins.json',
                current_data
            )

        return {
            'status': 'success',
            'message': 'Assessment chart configs generated successfully',
            'files_created': [
                'configs/tax_year_assessment_bins.json',
                'configs/current_assessment_bins.json'
            ]
        }, 200

    except Exception as e:
        print(f'Error generating assessment chart configs: {str(e)}')
        return {
            'status': 'error',
            'message': str(e)
        }, 500


def _query_and_format_bins(bq_client, table_id, include_tax_year=False):
    """Query assessment bins table and format as list of dicts."""
    try:
        if include_tax_year:
            query = f"""
                SELECT
                    tax_year,
                    lower_bound,
                    upper_bound,
                    property_count
                FROM `{table_id}`
                ORDER BY tax_year, lower_bound
            """
        else:
            query = f"""
                SELECT
                    lower_bound,
                    upper_bound,
                    property_count
                FROM `{table_id}`
                ORDER BY lower_bound
            """

        query_job = bq_client.query(query)
        rows = query_job.result()

        # Convert rows to list of dicts
        data = []
        for row in rows:
            if include_tax_year:
                row_dict = {
                    'tax_year': row.tax_year,
                    'lower_bound': row.lower_bound,
                    'upper_bound': row.upper_bound,
                    'property_count': row.property_count
                }
            else:
                row_dict = {
                    'lower_bound': row.lower_bound,
                    'upper_bound': row.upper_bound,
                    'property_count': row.property_count
                }
            data.append(row_dict)

        if not data:
            print(f'Warning: No data found in {table_id}')
            return None

        return data

    except Exception as e:
        print(f'Warning: Unable to query {table_id}: {str(e)}')
        return None


def _upload_json_to_gcs(bucket, blob_name, data):
    """Upload JSON data to Cloud Storage."""
    try:
        blob = bucket.blob(blob_name)
        blob.upload_from_string(
            json.dumps(data, indent=2),
            content_type='application/json'
        )
        print(f'✅ Successfully uploaded {blob_name}')
    except Exception as e:
        print(f'Error uploading {blob_name}: {str(e)}')
        raise
