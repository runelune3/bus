import json
import os
import shapefile

def export_trajectories_to_shp(json_path='routes_data.json', output_dir='shp_output'):
    if not os.path.exists(json_path):
        print(f"Error: {json_path} not found")
        return

    os.makedirs(output_dir, exist_ok=True)
    shp_base = os.path.join(output_dir, "gwangju_bus_routes")

    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    routes = data.get('routes', {})
    print(f"Found {len(routes)} routes in {json_path}")

    # 1. PolyLine Shapefile (LineString per route)
    w = shapefile.Writer(shp_base, shapeType=shapefile.POLYLINE)
    w.encoding = 'utf-8'

    # Attribute table fields
    w.field('ROUTE_ID', 'N', decimal=0)
    w.field('ROUTE_NAME', 'C', size=50)
    w.field('ROUTE_TYPE', 'C', size=20)
    w.field('START_STOP', 'C', size=80)
    w.field('TURN_STOP', 'C', size=80)
    w.field('END_STOP', 'C', size=80)
    w.field('STOP_CNT', 'N', decimal=0)
    w.field('VERTEX_CNT', 'N', decimal=0)
    w.field('LENGTH_KM', 'F', decimal=2)

    exported_count = 0
    for route_name, r in routes.items():
        traj = r.get('trajectory', [])
        if not traj or len(traj) < 2:
            continue

        # Shapefile expects coordinates as [longitude, latitude]
        line_coords = [[round(p[1], 6), round(p[0], 6)] for p in traj]

        w.line([line_coords])
        w.record(
            ROUTE_ID=r.get('routeId', 0),
            ROUTE_NAME=str(r.get('routeName', route_name)),
            ROUTE_TYPE=str(r.get('routeType', '')),
            START_STOP=str(r.get('startStop', '')),
            TURN_STOP=str(r.get('turnStop', '')),
            END_STOP=str(r.get('endStop', '')),
            STOP_CNT=r.get('stopCount', 0),
            VERTEX_CNT=len(traj),
            LENGTH_KM=float(r.get('lengthKm', 0.0))
        )
        exported_count += 1

    w.close()

    # 2. Write WGS84 (.prj) projection file for QGIS / ArcGIS compatibility
    prj_content = (
        'GEOGCS["GCS_WGS_1984",'
        'DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],'
        'PRIMEM["Greenwich",0.0],'
        'UNIT["Degree",0.0174532925199433]]'
    )
    with open(f"{shp_base}.prj", "w", encoding="utf-8") as prj_file:
        prj_file.write(prj_content)

    print(f"Shapefile export complete!")
    print(f"- Exported routes: {exported_count}")
    print(f"- Output files:")
    for ext in ['.shp', '.shx', '.dbf', '.prj']:
        p = f"{shp_base}{ext}"
        if os.path.exists(p):
            print(f"  * {p} ({os.path.getsize(p):,} bytes)")

if __name__ == '__main__':
    export_trajectories_to_shp()
