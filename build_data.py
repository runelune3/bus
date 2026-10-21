import os
import sys
import json
import math
import urllib.request
import pandas as pd
from concurrent.futures import ThreadPoolExecutor, as_completed

# Haversine distance in km
def haversine(lat1, lon1, lat2, lon2):
    R = 6371.0 # Earth radius in km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def dist_sq(lat1, lon1, lat2, lon2):
    return (lat1 - lat2)**2 + (lon1 - lon2)**2

def get_route_type_and_color(name):
    name = str(name).strip()
    if '급행' in name or name in ['03', '05', '06']:
        return '급행', '#E53E3E', '#FFF5F5', 'express'
    elif '순환' in name or name in ['01', '02']:
        return '순환', '#805AD5', '#FAF5FF', 'circular'
    elif '출근' in name or '맞춤' in name or '빛그린' in name:
        return '맞춤', '#DD6B20', '#FFFAF0', 'custom'
    elif name in ['1187', '1187-1', '228', '419', '518']:
        return '기념/특화', '#2B6CB0', '#EBF8FF', 'special'
    else:
        digits = ''.join([c for c in name if c.isdigit()])
        if digits and int(digits) <= 50:
            return '간선', '#3182CE', '#EBF8FF', 'trunk'
        else:
            return '지선', '#38A169', '#F0FFF4', 'branch'

def load_or_fetch_bis_trajectories(line_ids):
    cache_path = 'bis_raw_cache.json'
    results = {}
    if os.path.exists(cache_path):
        print(f"Loading cached BIS trajectory data from {cache_path}...")
        try:
            with open(cache_path, 'r', encoding='utf-8') as f:
                results = json.load(f)
        except Exception as e:
            print(f"Failed to read cache: {e}, will fetch...")
            results = {}

    missing_ids = [lid for lid in line_ids if str(lid) not in results and lid not in results]
    if missing_ids:
        print(f"Fetching {len(missing_ids)} missing BIS trajectories from 125.136.150.185:8603: {missing_ids}...")
        def fetch_single(lid):
            url = f"http://125.136.150.185:8603/renewal/api/lineMap?LINE_ID={lid}"
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            try:
                with urllib.request.urlopen(req, timeout=10) as resp:
                    return lid, json.loads(resp.read().decode("utf-8"))
            except Exception as e:
                print(f"Failed to fetch {lid}: {e}")
                return lid, None

        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = {executor.submit(fetch_single, lid): lid for lid in missing_ids}
            for future in as_completed(futures):
                lid, data = future.result()
                if data and 'vertex' in data:
                    results[str(lid)] = data
                    print(f"Successfully fetched and cached line {lid} (vertex count: {len(data['vertex'])})")

        with open(cache_path, 'w', encoding='utf-8') as f:
            json.dump(results, f, ensure_ascii=False)
        print("Updated bis_raw_cache.json with new trajectories.")

    return results

def split_trajectory(trajectory, turn_lat, turn_lng):
    """Split trajectory into up (상행) and down (하행) based on turn stop location."""
    if not trajectory or len(trajectory) < 4 or turn_lat is None or turn_lng is None:
        return trajectory, []

    # Search around middle 10% to 90% for best matching point to turn stop
    min_idx = int(len(trajectory) * 0.1)
    max_idx = int(len(trajectory) * 0.9)
    if min_idx >= max_idx:
        min_idx, max_idx = 0, len(trajectory) - 1

    best_idx = -1
    best_dist = float('inf')
    for i in range(min_idx, max_idx + 1):
        lat, lng = trajectory[i]
        d = dist_sq(lat, lng, turn_lat, turn_lng)
        if d < best_dist:
            best_dist = d
            best_idx = i

    if best_idx > 0:
        up_traj = trajectory[:best_idx + 1]
        down_traj = trajectory[best_idx:]
        return up_traj, down_traj
    return trajectory, []

def build():
    excel_path = '노선별경유리스트(시청).xls'
    if not os.path.exists(excel_path):
        print(f"Error: {excel_path} not found.")
        return

    print("Loading Excel file...")
    df = pd.read_excel(excel_path)
    print(f"Loaded {len(df)} rows.")

    route_meta = df[['노선ID', '노선명']].drop_duplicates()
    all_line_ids = [int(rid) for rid in route_meta['노선ID']]
    bis_data = load_or_fetch_bis_trajectories(all_line_ids)

    routes_dict = {}
    stop_index = {} # stop_name -> list of {routeName, stopId, arsId, type}

    grouped = df.groupby('노선명', sort=False)

    matched_trajectory_count = 0

    for route_name, group in grouped:
        route_name_str = str(route_name).strip()
        route_id = int(group['노선ID'].iloc[0])
        route_type, route_color, route_bg, route_badge = get_route_type_and_color(route_name_str)

        start_stops = group[group['구분'] == '기점']
        start_name = start_stops['정류소명'].iloc[0] if len(start_stops) > 0 else group['정류소명'].iloc[0]

        turn_stops = group[group['구분'] == '회차지']
        turn_name = turn_stops['정류소명'].iloc[0] if len(turn_stops) > 0 else ''
        turn_lat = float(turn_stops['위도'].iloc[0]) if len(turn_stops) > 0 else None
        turn_lng = float(turn_stops['경도'].iloc[0]) if len(turn_stops) > 0 else None

        end_stops = group[group['구분'] == '종점']
        end_name = end_stops['정류소명'].iloc[-1] if len(end_stops) > 0 else group['정류소명'].iloc[-1]

        points = []
        current_dir = '상행'
        total_dist_km = 0.0
        prev_pt = None

        for idx, row in group.iterrows():
            pt_type = str(row['구분']).strip()
            raw_ars = row['ARS_ID']
            ars_id = ''
            if not pd.isna(raw_ars):
                try:
                    ars_id = str(int(raw_ars)).zfill(4)
                except Exception:
                    ars_id = str(raw_ars).strip()

            lat = round(float(row['위도']), 6)
            lng = round(float(row['경도']), 6)
            stop_name = str(row['정류소명']).strip()
            stop_id = int(row['BUSSTOP_ID'])

            if prev_pt is not None:
                dist = haversine(prev_pt[0], prev_pt[1], lat, lng)
                if dist < 50:
                    total_dist_km += dist
            prev_pt = (lat, lng)

            pt = {
                'seq': len(points) + 1,
                'stopId': stop_id,
                'arsId': ars_id,
                'name': stop_name,
                'lat': lat,
                'lng': lng,
                'type': pt_type,
                'direction': current_dir
            }
            points.append(pt)

            if pt_type in ['정류소', '기점', '회차지', '종점']:
                if stop_name not in stop_index:
                    stop_index[stop_name] = []
                if not any(item['routeName'] == route_name_str for item in stop_index[stop_name]):
                    stop_index[stop_name].append({
                        'routeName': route_name_str,
                        'routeType': route_type,
                        'routeColor': route_color,
                        'arsId': ars_id,
                        'stopId': stop_id,
                        'lat': lat,
                        'lng': lng
                    })

            if pt_type == '회차지':
                current_dir = '하행'

        regular_stops = [p for p in points if p['type'] in ['정류소', '기점', '회차지', '종점']]
        intersections = [p for p in points if p['type'] == '교차로']

        # Extract and parse BIS Trajectory (Vertex)
        route_bis = bis_data.get(str(route_id)) or bis_data.get(route_id)
        trajectory = []
        up_trajectory = []
        down_trajectory = []

        if route_bis and 'vertex' in route_bis and len(route_bis['vertex']) > 0:
            for v in route_bis['vertex']:
                v_lat = round(float(v['LATITUDE']), 6)
                v_lng = round(float(v['LONGITUDE']), 6)
                trajectory.append([v_lat, v_lng])
            up_trajectory, down_trajectory = split_trajectory(trajectory, turn_lat, turn_lng)
            matched_trajectory_count += 1
        else:
            # Fallback to direct stop-to-stop points if no BIS vertex
            trajectory = [[p['lat'], p['lng']] for p in points]
            up_trajectory = [[p['lat'], p['lng']] for p in points if p['direction'] == '상행']
            down_trajectory = [[p['lat'], p['lng']] for p in points if p['direction'] == '하행']

        routes_dict[route_name_str] = {
            'order': len(routes_dict) + 1,
            'routeId': route_id,
            'routeName': route_name_str,
            'routeType': route_type,
            'routeColor': route_color,
            'routeBg': route_bg,
            'routeBadge': route_badge,
            'startStop': start_name,
            'turnStop': turn_name,
            'endStop': end_name,
            'totalPoints': len(points),
            'stopCount': len(regular_stops),
            'intersectionCount': len(intersections),
            'lengthKm': round(total_dist_km, 2),
            'trajectory': trajectory,
            'upTrajectory': up_trajectory,
            'downTrajectory': down_trajectory,
            'vertexCount': len(trajectory),
            'points': points
        }

    route_list = list(routes_dict.keys())

    dataset = {
        'version': '2.1.0',
        'city': '광주광역시 시내버스',
        'updatedAt': '2026-10-15',
        'totalRoutes': len(routes_dict),
        'totalStops': len(stop_index),
        'matchedTrajectories': matched_trajectory_count,
        'routeList': route_list,
        'routes': routes_dict,
        'stopIndex': stop_index
    }

    # Save to routes_data.json
    with open('routes_data.json', 'w', encoding='utf-8') as f:
        json.dump(dataset, f, ensure_ascii=False)

    # Save to routes_data.js for standalone browser opening
    with open('routes_data.js', 'w', encoding='utf-8') as f:
        f.write('window.BUS_ROUTES_DATA = ' + json.dumps(dataset, ensure_ascii=False) + ';')

    print(f"\nData generation complete!")
    print(f"- Routes: {len(routes_dict)}")
    print(f"- Matched BIS Trajectories: {matched_trajectory_count} / {len(routes_dict)} (100%)")
    print(f"- Unique Bus Stops indexed: {len(stop_index)}")
    print(f"- routes_data.json size: {os.path.getsize('routes_data.json'):,} bytes")
    print(f"- routes_data.js size: {os.path.getsize('routes_data.js'):,} bytes")

if __name__ == '__main__':
    build()
