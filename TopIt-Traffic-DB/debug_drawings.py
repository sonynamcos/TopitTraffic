import fitz
import json
from collections import Counter

doc = fitz.open(r'C:\JJUN_DEV\TopIt-Traffic-DB\복사본 A3size_보령 신호제어기 요도(적색점멸용)20240710.pdf')
page = doc[0]
drawings = page.get_drawings()

# Analyze item types across all drawings
op_counts = Counter()
item_lengths = Counter()
for d in drawings:
    items = d.get('items', [])
    for item in items:
        op_counts[item[0]] += 1
        item_lengths[(item[0], len(item))] += 1

print("Operation type counts:")
for op, cnt in op_counts.most_common():
    print(f"  {op}: {cnt}")

print("\n(op, item_length) counts:")
for (op, length), cnt in item_lengths.most_common():
    print(f"  ({op}, len={length}): {cnt}")

# Check for 're' (rectangle) items that might represent connections
print("\nDrawing keys sample (first 5):")
for d in drawings[:5]:
    print(f"  keys: {list(d.keys())}")
    items = d.get('items', [])
    for item in items[:3]:
        print(f"    item[0]={item[0]}, len={len(item)}, types={[type(x).__name__ for x in item]}")

# Check path properties - color, width, fill
print("\nPath property analysis:")
colors = Counter()
widths = Counter()
for d in drawings:
    c = d.get('color')
    w = d.get('width')
    colors[str(c)] += 1
    widths[w] += 1

print("Colors (top 10):")
for c, cnt in colors.most_common(10):
    print(f"  {c}: {cnt}")
print("Widths (top 10):")
for w, cnt in widths.most_common(10):
    print(f"  {w}: {cnt}")

# Look at fill vs stroke
fill_counts = Counter()
for d in drawings:
    has_fill = d.get('fill') is not None
    has_color = d.get('color') is not None
    fill_counts[(has_fill, has_color)] += 1
print("\n(has_fill, has_stroke) counts:")
for k, cnt in fill_counts.most_common():
    print(f"  fill={k[0]}, stroke={k[1]}: {cnt}")

doc.close()
