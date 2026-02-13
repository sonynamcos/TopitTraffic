import fitz
import json
import math

with open(r'C:\JJUN_DEV\TopIt-Traffic-DB\pdf_extracted_nodes.json', 'r', encoding='utf-8') as f:
    nodes = json.load(f)

node_pts = [(n['node_cx'], n['node_cy']) for n in nodes]
node_codes = [n['code'] for n in nodes]

def nearest_node_info(px, py):
    best_i, best_d = None, float('inf')
    for i, (nx, ny) in enumerate(node_pts):
        d = math.hypot(px - nx, py - ny)
        if d < best_d:
            best_i, best_d = i, d
    return best_i, best_d

doc = fitz.open(r'C:\JJUN_DEV\TopIt-Traffic-DB\복사본 A3size_보령 신호제어기 요도(적색점멸용)20240710.pdf')
page = doc[0]
drawings = page.get_drawings()

# Focus on line ('l') items: look at segments near nodes
# and also look at curves ('c') items
print("=== Analysis of 'l' (line) segments ===")
l_near_count = 0
l_total = 0
for d in drawings:
    for item in d['items']:
        if item[0] == 'l':
            l_total += 1
            p1, p2 = item[1], item[2]
            _, d1 = nearest_node_info(p1.x, p1.y)
            _, d2 = nearest_node_info(p2.x, p2.y)
            if d1 < 40 or d2 < 40:
                l_near_count += 1

print(f"Total 'l' segments: {l_total}")
print(f"Segments with at least one end near a node (<40pt): {l_near_count}")

print("\n=== Analysis of 'c' (curve) segments ===")
c_near_count = 0
c_total = 0
for d in drawings:
    for item in d['items']:
        if item[0] == 'c':
            c_total += 1
            p1, p4 = item[1], item[4]
            _, d1 = nearest_node_info(p1.x, p1.y)
            _, d2 = nearest_node_info(p4.x, p4.y)
            if d1 < 40 or d2 < 40:
                c_near_count += 1

print(f"Total 'c' curves: {c_total}")
print(f"Curves with at least one end near a node (<40pt): {c_near_count}")

# Look at multi-segment paths that start/end near nodes
# but travel through intermediate waypoints
print("\n=== Multi-segment path analysis ===")
for d in drawings:
    items = d['items']
    # Only look at paths with multiple l/c items
    lc_items = [it for it in items if it[0] in ('l', 'c')]
    if len(lc_items) < 2:
        continue
    
    # Collect all unique points along the path
    all_points = []
    for it in lc_items:
        if it[0] == 'l':
            all_points.append((it[1].x, it[1].y))
            all_points.append((it[2].x, it[2].y))
        elif it[0] == 'c':
            all_points.append((it[1].x, it[1].y))
            all_points.append((it[4].x, it[4].y))
    
    # Check which points are near nodes
    near_nodes = []
    for px, py in all_points:
        ni, nd = nearest_node_info(px, py)
        if nd < 40:
            near_nodes.append((ni, nd, px, py))
    
    # Deduplicate by node index
    seen = set()
    unique_near = []
    for ni, nd, px, py in near_nodes:
        if ni not in seen:
            seen.add(ni)
            unique_near.append((ni, nd, px, py))
    
    if len(unique_near) >= 2:
        color = d.get('color')
        width = d.get('width')
        print(f"\n  Path with {len(lc_items)} segments, color={color}, width={width}")
        print(f"  Near nodes ({len(unique_near)}):")
        for ni, nd, px, py in unique_near:
            print(f"    [{node_codes[ni]}] {nodes[ni]['name']} (dist={nd:.1f})")

# Also check: paths with color that is the dominant line color
# The main line color seems to be (0.29, 0.49, 0.73) - bluish
print("\n\n=== Checking ALL points in blue-ish paths ===")
blue_paths = [d for d in drawings if d.get('color') and 
              abs(d['color'][0] - 0.29) < 0.05 and abs(d['color'][1] - 0.49) < 0.05]
print(f"Blue paths: {len(blue_paths)}")

# Also check orange paths 
orange_paths = [d for d in drawings if d.get('color') and 
                abs(d['color'][0] - 0.89) < 0.05 and abs(d['color'][1] - 0.42) < 0.05]
print(f"Orange paths: {len(orange_paths)}")

# Green paths
green_paths = [d for d in drawings if d.get('color') and 
               abs(d['color'][1] - 0.69) < 0.05 and abs(d['color'][2] - 0.31) < 0.05]
print(f"Green paths: {len(green_paths)}")

doc.close()
