import pandas as pd
import numpy as np
from google.cloud import bigquery
from xgboost import XGBRegressor
from sklearn.model_selection import train_test_split
from datetime import datetime, timezone

PROJECT = "musa5090s26-team2"
TRAINING_TABLE = "musa5090s26-team2.derived.current_assessments_model_training_data"
PREDICT_TABLE = "musa5090s26-team2.core.opa_with_spatial"
OUTPUT_TABLE = "musa5090s26-team2.derived.current_assessments"

FEATURE_COLS = [
    "total_livable_area", "number_of_bathrooms", "number_of_bedrooms",
    "exterior_condition", "interior_condition", "quality_grade_simplified",
    "age", "zip_code", "zoning_prefix", "sale_year", "sale_month",
    "crime_count_500m", "median_income"
]
CAT_COLS = ["quality_grade_simplified", "zip_code", "zoning_prefix"]


def train_model(client):
    print("Loading training data...")
    df = client.query(f"SELECT * FROM `{TRAINING_TABLE}`").to_dataframe()
    df = df.dropna()
    df = df[df["log_price"] > 0]
    X = df[FEATURE_COLS]
    y = df["log_price"]
    X = pd.get_dummies(X, columns=CAT_COLS, drop_first=True)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42)
    print("Training model...")
    model = XGBRegressor(
        learning_rate=0.05,
        max_depth=7,
        n_estimators=500,
        subsample=0.8,
        random_state=42,
        verbosity=0
    )
    model.fit(X_train, y_train)
    print(f"Training complete. Number of features: {X_train.shape[1]}")
    return model, X.columns.tolist()


def predict_all(client, model, feature_columns):
    print("Loading prediction data...")
    df = client.query(f"SELECT * FROM `{PREDICT_TABLE}`").to_dataframe()
    property_ids = df.iloc[:, 0].astype(str)
    X = df[FEATURE_COLS].copy()
    X = pd.get_dummies(X, columns=CAT_COLS, drop_first=True)
    X = X.reindex(columns=feature_columns, fill_value=0)
    print(f"Predicting {len(X)} properties...")
    log_predictions = model.predict(X)
    predictions = np.expm1(log_predictions)
    result = pd.DataFrame({
        "property_id":     property_ids.values,
        "predicted_value": predictions,
        "predicted_at":    datetime.now(timezone.utc)
    })
    return result


def save_to_bq(client, df):
    print("Writing results to BigQuery...")
    job_config = bigquery.LoadJobConfig(
        write_disposition="WRITE_TRUNCATE",
        schema=[
            bigquery.SchemaField("property_id",     "STRING"),
            bigquery.SchemaField("predicted_value", "FLOAT64"),
            bigquery.SchemaField("predicted_at",    "TIMESTAMP"),
        ]
    )
    job = client.load_table_from_dataframe(
        df, OUTPUT_TABLE, job_config=job_config)
    job.result()
    print(f"Done! Written {len(df)} predictions to {OUTPUT_TABLE}")


def main(request=None):
    client = bigquery.Client(project=PROJECT)
    model, feature_columns = train_model(client)
    predictions = predict_all(client, model, feature_columns)
    save_to_bq(client, predictions)
    return "OK", 200


if __name__ == "__main__":
    main()
