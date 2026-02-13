import json
import math
import fitz
from collections import defaultdict, Counter

with open(r"C:\JJUN_DEV\TopIt-Traffic-DB\pdf_extracted_nodes.json", "r", encoding="utf-8") as f:
    nodes = json.load(f)
print(f"Loaded {len(nodes)} nodes")

node_pts = [(n["node_cx"], n["node_cy"]) for n in nodes]
node_codes = [n["code"] for n in nodes]
code_to_node = {n["code"]: n for n in nodes}

def nearest_node(px, py, max_dist=40.0):
    best_i, best_d = None, float("inf")
    for i, (nx, ny) in enumerate(node_pts):
        d = math.hypot(px - nx, py - ny)
        if d < best_d:
            best_i, best_d = i, d
    if best_d <= max_dist:
        return best_i, best_d
    return None, best_d
