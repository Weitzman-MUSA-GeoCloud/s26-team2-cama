# Import packages
import pandas as pd
import tqdm
from datetime import datetime

from dotenv import load_dotenv
import pandas_gbq
import functions_framework

from sklearn import ensemble

# Load environment variables
load_dotenv()
print("Cloud Function is starting up...")


def run_model(project_id):

    # Load BigQuery training data table
    sql = """
    SELECT *
    FROM `musa5090s26-team2.derived.current_assessments_model_training_data`
    """
    data_raw = pandas_gbq.read_gbq(sql, project_id=project_id)

    print(f'✅ Loaded input BigQuery table')

    # Shape data for modeling
    data_modeling = data_raw.query('can_train == True')

    categorical_columns_subset = [
        'category_code_description',
        'building_code_description_new',
        'exterior_condition',
        'interior_condition',
        'number_of_bathrooms',
        'number_of_bedrooms',
        'number_stories',
        'neighborhood',
        'school',
        'zoning'
    ]

    numerical_columns_subset = [
        'year_built',
        'total_area',
        'distance_to_nearest_septa'
    ]

    pd.options.mode.copy_on_write = True
    train_predictors = data_modeling[categorical_columns_subset + numerical_columns_subset]
    train_predictors[categorical_columns_subset] = train_predictors[categorical_columns_subset].astype("category")
    train_target = data_modeling['sale_price']

    production_predictors = data_raw[categorical_columns_subset + numerical_columns_subset]
    production_predictors[categorical_columns_subset] = production_predictors[categorical_columns_subset].astype("category")

    # Specify model with optimized hyperparameters
    model_production = ensemble.HistGradientBoostingRegressor(
        loss='gamma', max_iter=1000, early_stopping=True, random_state=0,
        max_depth=6, learning_rate=0.069
    )

    # Model fit
    model_production.fit(train_predictors, train_target)

    print(f'✅ Model fitting complete')

    # Model prediction
    prediction = model_production.predict(production_predictors)

    # Prepare output
    now = datetime.now()

    ready = data_raw
    ready['predicted_value'] = prediction
    ready['predicted_at'] = now

    # Create or replace output table on BigQuery
    pandas_gbq.to_gbq(
        ready, 'derived.current_assessments', project_id=project_id, if_exists='replace',
    )

    print(f'✅ Output table created or replaced')

@functions_framework.http
def predict_current_assessments(request):
    print('Running modeling code...')
    run_model("musa5090s26-team2")
    return f'✅ Training and output update complete'
