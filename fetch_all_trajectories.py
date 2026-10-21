import os
import json
import urllib.request
import pandas as pd
from concurrent.futures import ThreadPoolExecutor, as_completed

def fetch_single_line(line_id):
    url = f"http://125.136.150.185:8603/renewal/api/lineMap?LINE_ID={line_id}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return line_id, data
    except Exception as e:
        print(f"Error fetching line {line_id}: {e}")
        return line_id, None

def dist_sq(p1, p2):
    return (p1[0] - p2[0])**2 + (p1[1] - p2[1])**2

def main():
    excel_path = "노선별경유리스트(시청).xls"
    if not os.path.exists(excel_path):
        print(f"Error: {excel_path} not found")
        return

    print("Reading Excel routes...")
    df = pd.read_excel(excel_path)
    route_meta = df[["노선ID", "노선명"]].drop_duplicates()
    line_ids = [int(rid) for rid in route_meta["노선ID"]]
    print(f"Total routes to fetch: {len(line_ids)}")

    results = {}
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(fetch_single_line, lid): lid for lid in line_ids}
        for future in as_completed(futures):
            lid, data = future.result()
            if data and "vertex" in data:
                results[lid] = data
                print(f"Fetched line {lid}: vertex count = {len(data['vertex'])}, stops = {len(data.get('stops', []))}")
            else:
                print(f"Failed or empty for line {lid}")

    print(f"\nSuccessfully fetched {len(results)} / {len(line_ids)} routes!")

    # Cache raw API results
    with open("bis_raw_cache.json", "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False)
    print("Saved raw cache to bis_raw_cache.json")

if __name__ == "__main__":
    main()
