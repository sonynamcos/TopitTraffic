import json
import math
import fitz  # PyMuPDF

# ── 1. Load nodes ──────────────────────────────────────────────────
with open(r'C:\JJUN_DEV\TopIt-Traffic-DB\pdf_extracted_nodes.json', 'r', encoding='utf-8') as f:
    nodes = json.load(f)

print(f"Loaded {len(nodes)} nodes")

node_pts = [(n['node_cx'], n['node_cy']) for n in nodes]
node_codes = [n['code'] for n in nodes]
node_names = [n['name'] for n in nodes]

def nearest_node(px, py, max_dist=40.0):
    """Return (index, distance) of closest node within max_dist, or (None, inf)."""
    best_i, best_d = None, float('inf')
    for i, (nx, ny) in enumerate(node_pts):
        d = math.hypot(px - nx, py - ny)
        if d < best_d:
            best_i, best_d = i, d
    if best_d <= max_dist:
        return best_i, best_d
    return None, best_d

# ── 2. Open PDF & get drawings ─────────────────────────────────────
doc = fitz.open(r'C:\JJUN_DEV\TopIt-Traffic-DB\복사본 A3size_보령 신호제어기 요도(적색점멸용)20240710.pdf')
page = doc[0]
print(f"Page size: {page.rect.width:.0f} x {page.rect.height:.0f} pts")

drawings = page.get_drawings()
print(f"Total drawing paths: {len(drawings)}")

# ── 3. Extract edges ───────────────────────────────────────────────
edge_set = set()       # (min_code, max_code) for dedup
edge_list_raw = []     # for debugging

MAX_DIST = 40.0

# Strategy A: per-path, first point ↔ last point
path_edges = 0
for d in drawings:
    items = d.get('items', [])
    if not items:
        continue

    # Collect all points from the path
    points = []
    for item in items:
        op = item[0]  # operation type: 'm', 'l', 'c', 'qu', 're', etc.
        if op == 'l':    # lineto: item is ('l', Point1, Point2)
            p1 = item[1]
            p2 = item[2]
            if not points or (points[-1] != (p1.x, p1.y)):
                points.append((p1.x, p1.y))
            points.append((p2.x, p2.y))
        elif op == 'm':  # moveto: item is ('m', x, y) -- but let's check actual format
            # In PyMuPDF, moveto item: ('m', x, y) -- a point
            # Actually it might be ('m', Point)
            if len(item) == 2:
                pt = item[1]
                points.append((pt.x, pt.y))
            elif len(item) == 3:
                points.append((item[1], item[2]))
        elif op == 'c':  # curve: ('c', p1, p2, p3, p4)
            # Start = p1, end = p4
            p1 = item[1]
            p4 = item[4] if len(item) > 4 else item[-1]
            if not points or (points[-1] != (p1.x, p1.y)):
                points.append((p1.x, p1.y))
            points.append((p4.x, p4.y))

    if len(points) < 2:
        continue

    first = points[0]
    last = points[-1]

    ni1, d1 = nearest_node(first[0], first[1], MAX_DIST)
    ni2, d2 = nearest_node(last[0], last[1], MAX_DIST)

    if ni1 is not None and ni2 is not None and ni1 != ni2:
        a, b = node_codes[ni1], node_codes[ni2]
        key = tuple(sorted([a, b]))
        if key not in edge_set:
            edge_set.add(key)
            path_edges += 1

print(f"\nStrategy A (first↔last per path): {path_edges} unique edges")

# Strategy B: per individual line segment within each path
seg_edges = 0
for d in drawings:
    items = d.get('items', [])
    for item in items:
        op = item[0]
        if op == 'l':
            p1, p2 = item[1], item[2]
            ni1, d1 = nearest_node(p1.x, p1.y, MAX_DIST)
            ni2, d2 = nearest_node(p2.x, p2.y, MAX_DIST)
            if ni1 is not None and ni2 is not None and ni1 != ni2:
                a, b = node_codes[ni1], node_codes[ni2]
                key = tuple(sorted([a, b]))
                if key not in edge_set:
                    edge_set.add(key)
                    seg_edges += 1
        elif op == 'c':
            p1 = item[1]
            p4 = item[4] if len(item) > 4 else item[-1]
            ni1, d1 = nearest_node(p1.x, p1.y, MAX_DIST)
            ni2, d2 = nearest_node(p4.x, p4.y, MAX_DIST)
            if ni1 is not None and ni2 is not None and ni1 != ni2:
                a, b = node_codes[ni1], node_codes[ni2]
                key = tuple(sorted([a, b]))
                if key not in edge_set:
                    edge_set.add(key)
                    seg_edges += 1

print(f"Strategy B (per segment, additional): {seg_edges} unique edges")
print(f"Total unique edges: {len(edge_set)}")

# ── 4. Build final edge list with metadata ─────────────────────────
code_to_node = {n['code']: n for n in nodes}

edges = []
for a, b in sorted(edge_set):
    na = code_to_node[a]
    nb = code_to_node[b]
    dist = math.hypot(na['node_cx'] - nb['node_cx'], na['node_cy'] - nb['node_cy'])
    edges.append({
        "from_code": a,
        "from_name": na['name'],
        "to_code": b,
        "to_name": nb['name'],
        "distance_pts": round(dist, 1)
    })

# ── 5. Print complete edge list ────────────────────────────────────
print(f"\n{'='*80}")
print(f"COMPLETE EDGE LIST ({len(edges)} edges)")
print(f"{'='*80}")
for i, e in enumerate(edges, 1):
    print(f"  {i:3d}. [{e['from_code']}] {e['from_name']:<12s} ↔ [{e['to_code']}] {e['to_name']:<12s}  (dist={e['distance_pts']:.1f} pts)")

# ── 6. Summary stats ───────────────────────────────────────────────
dists = [e['distance_pts'] for e in edges]
print(f"\n{'='*80}")
print(f"SUMMARY")
print(f"{'='*80}")
print(f"  Total edges:    {len(edges)}")
print(f"  Total nodes:    {len(nodes)}")
print(f"  Avg degree:     {2*len(edges)/len(nodes):.2f}")
print(f"  Distance stats: min={min(dists):.1f}, max={max(dists):.1f}, avg={sum(dists)/len(dists):.1f} pts")

# Count node degrees
from collections import Counter
deg = Counter()
for e in edges:
    deg[e['from_code']] += 1
    deg[e['to_code']] += 1

isolated = [n['code'] for n in nodes if deg[n['code']] == 0]
print(f"  Isolated nodes (degree 0): {len(isolated)}")
if isolated:
    for code in isolated:
        n = code_to_node[code]
        print(f"    [{code}] {n['name']}")

max_deg = max(deg.values()) if deg else 0
max_deg_nodes = [c for c, d in deg.items() if d == max_deg]
print(f"  Max degree:     {max_deg} (nodes: {max_deg_nodes})")

# ── 7. SAVE JSON ───────────────────────────────────────────────────
output_path = r'C:\JJUN_DEV\TopIt-Traffic-DB\pdf_extracted_edges.json'
with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(edges, f, ensure_ascii=False, indent=2)

print(f"\nSaved {len(edges)} edges to: {output_path}")

doc.close()
