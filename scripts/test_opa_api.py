import requests
import json
import time
from typing import Dict

def fetch_opa_batch(offset: int = 0, limit: int = 10000) -> Dict:
    url = "https://data.phila.gov/api/3/action/datastore_search"
    params = {
        "resource_id": "opa-properties-public",
        "offset": offset,
        "limit": limit,
    }

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }

    try:
        response = requests.get(url, params=params, headers=headers, timeout=30)
        response.raise_for_status()
        data = response.json()

        if not data.get("success"):
            raise Exception("API returned success=false")

        return data["result"]
    except Exception as e:
        print(f"API call failed: {e}")
        raise

def test():
    print("Testing OPA Properties API...")

    result = fetch_opa_batch(offset=0, limit=100)

    print(f"Total records: {result['total']}")
    print(f"Records in batch: {len(result['records'])}")

    if result["records"]:
        first = result["records"][0]
        print(f"Fields: {list(first.keys())}")
        print(f"Sample:\n{json.dumps(first, indent=2, default=str)}")

    batch_size = 10000
    total_batches = (result["total"] + batch_size - 1) // batch_size
    print(f"\nEstimated batches: {total_batches}")
    print(f"Estimated time (1 req/sec): ~{total_batches}s")

if __name__ == "__main__":
    test()
