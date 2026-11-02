"""Documented Clocked JSON API transport; key arrives on stdin, never argv."""
import json
import sys
import uuid

import requests


def main():
    job = json.load(sys.stdin)
    records = {}
    for endpoint, request in job["requests"].items():
        request_id = str(uuid.uuid4())
        response = requests.post(
            "https://clocked.rezolve.ai/clocked/" + endpoint,
            json=request,
            headers={"Authorization": "Bearer " + job["key"], "Idempotency-Key": request_id},
            timeout=20,
        )
        if "application/json" not in response.headers.get("content-type", ""):
            raise ValueError(f"Clocked {endpoint} returned HTTP {response.status_code} without API JSON.")
        result = response.json()
        if response.status_code != 200:
            raise ValueError(f"Clocked {endpoint} failed ({response.status_code}): {result.get('error', 'request rejected')}")
        records[endpoint] = {
            "requestId": request_id, "request": request, "response": result,
            "credits": int(response.headers.get("x-clocked-credits", 0)),
            "modelMs": float(response.headers.get("x-clocked-model-ms", 0)),
        }
    json.dump(records, sys.stdout, ensure_ascii=False)


try:
    main()
except Exception as error:
    print(str(error), file=sys.stderr)
    sys.exit(1)
