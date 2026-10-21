import urllib.request
import ssl
import json
import time
import os

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def fetch_osrm_route(points, chunk_size=25):
    road_coords = []
    total = len(points)
    
    for i in range(0, total, chunk_size - 1):
        chunk = points[i:i + chunk_size]
        if len(chunk) < 2:
            break
        coord_str = ';'.join([f"{p['lng']},{p['lat']}" for p in chunk])
        url = f"https://router.project-osrm.org/route/v1/driving/{coord_str}?overview=full&geometries=geojson"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        
        try:
            with urllib.request.urlopen(req, context=ctx, timeout=12) as resp:
                res = json.loads(resp.read().decode('utf-8'))
                if res.get('code') == 'Ok':
                    c = res['routes'][0]['geometry']['coordinates']
                    if road_coords:
                        road_coords.extend(c[1:])
                    else:
                        road_coords.extend(c)
        except Exception as e:
            print(f"  Chunk {i} error: {e}", flush=True)
            for p in chunk:
                road_coords.append([p['lng'], p['lat']])
        time.sleep(0.2)
        
    return road_coords

def save_cache(cache):
    with open('osrm_cache.json', 'w', encoding='utf-8') as f:
        json.dump(cache, f, ensure_ascii=False)
    with open('osrm_cache.js', 'w', encoding='utf-8') as f:
        f.write('window.OSRM_CACHE = ' + json.dumps(cache, ensure_ascii=False) + ';')

def main():
    with open('routes_data.json', encoding='utf-8') as f:
        data = json.load(f)

    target_routes = [
        '급행03', '급행05', '급행06', 
        '1187', '518', '228', 
        '03', '05', '06', '순환01'
    ]

    cache = {}
    if os.path.exists('osrm_cache.json'):
        try:
            with open('osrm_cache.json', encoding='utf-8') as f:
                cache = json.load(f)
                print(f"Loaded existing cache with {len(cache)} routes.", flush=True)
        except Exception:
            cache = {}

    for rname in target_routes:
        if rname in cache and len(cache[rname]) > 0:
            print(f"Route '{rname}' already cached ({len(cache[rname])} coords).", flush=True)
            continue
        if rname not in data['routes']:
            continue
        
        route = data['routes'][rname]
        pts = route['points']
        print(f"Fetching OSRM for '{rname}' ({len(pts)} points)...", flush=True)
        coords = fetch_osrm_route(pts)
        cache[rname] = coords
        save_cache(cache)
        print(f"  -> Generated {len(coords)} road coords for '{rname}' and saved to disk.", flush=True)

    print(f"\nAll target routes processed. Total cached: {len(cache)} routes.", flush=True)

if __name__ == '__main__':
    main()
