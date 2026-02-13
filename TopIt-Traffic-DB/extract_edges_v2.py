import json
import math
import fitz

# == 1. Load nodes ==
with open(r"C:\JJUN_DEV\TopIt-Traffic-DB\pdf_extracted_nodes.json", "r", encoding="utf-8") as f:
    nodes = json.load(f)

print(f"Loaded {len(nodes)} nodes")

node_pts = [(n["node_cx"], n["node_cy"]) for n in nodes]
node_codes = [n["code"] for n in nodes]
node_names = [n["name"] for n in nodes]
code_to_node = {n["code"]: n for n in nodes}
code_to_idx = {n["code"]: i for i, n in enumerate(nodes)}

def nearest_node(px, py, max_dist=40.0):
    best_i, best_d = None, float("inf")
    for i, (nx, ny) in enumerate(node_pts):
        d = math.hypot(px - nx, py - ny)
        if d < best_d:
            best_i, best_d = i, d
    if best_d <= max_dist:
        return best_i, best_d
    return None, best_d

# == 2. Open PDF ==
doc = fitz.open(r"C:\JJUN_DEV\TopIt-Traffic-DB\복사본 A3size_보령 신호제어기 요도(적색점멸용)20240710.pdf")
page = doc[0]
print(f"Page size: {page.rect.width:.0f} x {page.rect.height:.0f} pts")

drawings = page.get_drawings()
print(f"Total drawing paths: {len(drawings)}")

# == 3. Build edge set ==
edge_set = set()
MAX_DIST = 40.0

def add_edge(ni1, ni2):
    if ni1 is not None and ni2 is not None and ni1 != ni2:
        a, b = node_codes[ni1], node_codes[ni2]
        edge_set.add(tuple(sorted([a, b])))

# Strategy A: path-level first/last + waypoint transitions
for d in drawings:
    items = d.get("items", [])
    if not items:
        continue
    path_points = []
    for item in items:
        op = item[0]
        if op == "l":
            p1, p2 = item[1], item[2]
            path_points.append((p1.x, p1.y))
            path_points.append((p2.x, p2.y))
        elif op == "c":
            p1, p4 = item[1], item[4]
            path_points.append((p1.x, p1.y))
            path_points.append((p4.x, p4.y))
    if len(path_points) < 2:
        continue
    deduped = [path_points[0]]
    for pt in path_points[1:]:
        if abs(pt[0] - deduped[-1][0]) > 0.1 or abs(pt[1] - deduped[-1][1]) > 0.1:
            deduped.append(pt)
    path_points = deduped
    first = path_points[0]
    last = path_points[-1]
    ni1, d1 = nearest_node(first[0], first[1], MAX_DIST)
    ni2, d2 = nearest_node(last[0], last[1], MAX_DIST)
    add_edge(ni1, ni2)
    prev_node = None
    for pt in path_points:
        ni, nd = nearest_node(pt[0], pt[1], MAX_DIST)
        if ni is not None and ni != prev_node:
            if prev_node is not None:
                add_edge(prev_node, ni)
            prev_node = ni

# Strategy B: individual segments
for d in drawings:
    items = d.get("items", [])
    for item in items:
        op = item[0]
        if op == "l":
            p1, p2 = item[1], item[2]
            ni1, _ = nearest_node(p1.x, p1.y, MAX_DIST)
            ni2, _ = nearest_node(p2.x, p2.y, MAX_DIST)
            add_edge(ni1, ni2)
        elif op == "c":
            p1, p4 = item[1], item[4]
            ni1, _ = nearest_node(p1.x, p1.y, MAX_DIST)
            ni2, _ = nearest_node(p4.x, p4.y, MAX_DIST)
            add_edge(ni1, ni2)

print(f"After Strategy A+B: {len(edge_set)} unique edges")

# Strategy C: chain projection on line segments
def point_to_segment_dist(px, py, x1, y1, x2, y2):
    dx, dy = x2 - x1, y2 - y1
    seg_len_sq = dx*dx + dy*dy
    if seg_len_sq < 1e-10:
        return math.hypot(px - x1, py - y1)
    t = max(0, min(1, ((px - x1)*dx + (py - y1)*dy) / seg_len_sq))
    proj_x = x1 + t * dx
    proj_y = y1 + t * dy
    return math.hypot(px - proj_x, py - proj_y)

PROX_DIST = 15.0
chain_added = 0
for d in drawings:
    for item in d.get("items", []):
        if item[0] == "l":
            p1, p2 = item[1], item[2]
            x1, y1, x2, y2 = p1.x, p1.y, p2.x, p2.y
        elif item[0] == "c":
            p1, p4 = item[1], item[4]
            x1, y1, x2, y2 = p1.x, p1.y, p4.x, p4.y
        else:
            continue
        seg_len = math.hypot(x2 - x1, y2 - y1)
        if seg_len < 5:
            continue
        dx, dy = x2 - x1, y2 - y1
        seg_len_sq = dx*dx + dy*dy
        close_nodes = []
        for i, (nx, ny) in enumerate(node_pts):
            d_val = point_to_segment_dist(nx, ny, x1, y1, x2, y2)
            if d_val <= PROX_DIST:
                t = ((nx - x1)*dx + (ny - y1)*dy) / seg_len_sq
                close_nodes.append((t, i))
        if len(close_nodes) < 2:
            continue
        close_nodes.sort()
        for j in range(len(close_nodes) - 1):
            ni1 = close_nodes[j][1]
            ni2 = close_nodes[j+1][1]
            key = tuple(sorted([node_codes[ni1], node_codes[ni2]]))
            if key not in edge_set:
                edge_set.add(key)
                chain_added += 1

print(f"Strategy C (chain projection): +{chain_added} edges")
print(f"Total: {len(edge_set)} unique edges")

# == 4. Build final list ==
edges = []
for a, b in sorted(edge_set):
    na = code_to_node[a]
    nb = code_to_node[b]
    dist = math.hypot(na["node_cx"] - nb["node_cx"], na["node_cy"] - nb["node_cy"])
    edges.append({
        "from_code": a,
        "from_name": na["name"],
        "to_code": b,
        "to_name": nb["name"],
        "distance_pts": round(dist, 1)
    })

# == 5. Print ==
print(f"\n{'='*80}")
print(f"COMPLETE EDGE LIST ({len(edges)} edges)")
print(f"{'='*80}")
for i, e in enumerate(edges, 1):
    print(f"  {i:3d}. [{e['from_code']}] {e['from_name']:<16s} <-> [{e['to_code']}] {e['to_name']:<16s}  (dist={e['distance_pts']:.1f} pts)")

# == 6. Summary ==
from collections import Counter
dists = [e["distance_pts"] for e in edges]
deg = Counter()
for e in edges:
    deg[e["from_code"]] += 1
    deg[e["to_code"]] += 1
isolated = [n["code"] for n in nodes if deg[n["code"]] == 0]

print(f"\n{'='*80}")
print(f"SUMMARY")
print(f"{'='*80}")
print(f"  Total edges:     {len(edges)}")
print(f"  Total nodes:     {len(nodes)}")
print(f"  Connected nodes: {len(nodes) - len(isolated)}")
print(f"  Isolated nodes:  {len(isolated)}")
print(f"  Avg degree:      {2*len(edges)/len(nodes):.2f}")
print(f"  Distance stats:  min={min(dists):.1f}, max={max(dists):.1f}, avg={sum(dists)/len(dists):.1f} pts")

if isolated:
    print(f"\n  Isolated nodes ({len(isolated)}):")
    for code in isolated:
        n = code_to_node[code]
        print(f"    [{code}] {n['name']}")

max_deg_nodes = deg.most_common(10)
print(f"\n  Top-10 highest degree nodes:")
for c, d in max_deg_nodes:
    print(f"    [{c}] {code_to_node[c]['name']}: degree {d}")

deg_dist = Counter(deg.values())
print(f"\n  Degree distribution:")
for d_val in sorted(deg_dist.keys()):
    print(f"    degree {d_val}: {deg_dist[d_val]} nodes")

# == 7. SAVE JSON ==
output_path = r"C:\JJUN_DEV\TopIt-Traffic-DB\pdf_extracted_edges.json"
with open(output_path, "w", encoding="utf-8") as f:
    json.dump(edges, f, ensure_ascii=False, indent=2)
print(f"\n*** Saved {len(edges)} edges to: {output_path} ***")
doc.close()
