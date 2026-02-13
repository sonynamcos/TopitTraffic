import fitz
import json
import math

with open(r'C:\JJUN_DEV\TopIt-Traffic-DB\pdf_extracted_nodes.json', 'r', encoding='utf-8') as f:
    nodes = json.load(f)

node_pts = [(n['node_cx'], n['node_cy']) for n in nodes]
node_codes = [n['code'] for n in nodes]

# Isolated nodes from previous run
isolated_codes = ['002','003','004','005','007','009','010','011','023',
                  '041','042','043','046','048','049','055','056','057',
                  '063','064','066','090','106','108','118','124','129',
                  '132','135','137','140','141','142','147','148','149',
                  '150','154','155','161','165','166','171','173','176']

code_to_idx = {n['code']: i for i, n in enumerate(nodes)}

doc = fitz.open(r'C:\JJUN_DEV\TopIt-Traffic-DB\복사본 A3size_보령 신호제어기 요도(적색점멸용)20240710.pdf')
page = doc[0]
drawings = page.get_drawings()

# For each isolated node, find the closest line endpoint in any drawing
for code in isolated_codes:
    idx = code_to_idx[code]
    nx, ny = node_pts[idx]
    
    best_dist = float('inf')
    best_info = None
    
    for d_i, d in enumerate(drawings):
        for item in d['items']:
            pts = []
            if item[0] == 'l':
                pts = [(item[1].x, item[1].y), (item[2].x, item[2].y)]
            elif item[0] == 'c':
                pts = [(item[1].x, item[1].y), (item[4].x, item[4].y)]
            elif item[0] == 're':
                # Rectangle: item[1] is Rect
                continue
            
            for px, py in pts:
                d_val = math.hypot(px - nx, py - ny)
                if d_val < best_dist:
                    best_dist = d_val
                    best_info = (d_i, item[0], px, py, d.get('color'), d.get('width'))
    
    n = nodes[idx]
    if best_dist < 60:
        print(f"[{code}] {n['name']:<14s} node=({nx:.1f},{ny:.1f})  closest_pt=({best_info[2]:.1f},{best_info[3]:.1f})  dist={best_dist:.1f}  op={best_info[1]}  color={best_info[4]}  width={best_info[5]}")
    else:
        print(f"[{code}] {n['name']:<14s} node=({nx:.1f},{ny:.1f})  FARAWAY  closest_dist={best_dist:.1f}")

doc.close()
