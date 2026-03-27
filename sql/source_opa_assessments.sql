CREATE OR REPLACE EXTERNAL TABLE source.opa_assessments
OPTIONS (
  format = 'NEWLINE_DELIMITED_JSON',
  uris = ['gs://musa5090s26-team2-prepared_data/opa_assessments/data.jsonl']
);
