# Boryeong City Traffic Signal Controller Route Diagram Analysis

## Overview

**Source File:** `주기표엑셀\최신본\●수정_보령 신호제어기 요도_20211214.xls`
**Total Intersections in Database:** 309
**Intersections Found in Route Diagram:** 62 (20.1%)
**Total Routes Identified:** 27 routes
- **Horizontal Routes (East-West):** 14
- **Vertical Routes (North-South):** 13

---

## Key Findings

### Coverage
Only **62 out of 309 intersections** (20.1%) are represented in the route diagram Excel file. This suggests the diagram focuses on major roads and key routes rather than showing all traffic controllers in the system.

### Major Routes Identified

1. **Route H7** (Row 47) - Largest horizontal route
   - 8 controllers along this road
   - Road label: "화진4거리 3R"
   - Controllers: 이박사 → 만평사거리 → 개도5거리 → 예탁결제원 → 2공단 → 에이마트 → 보령말방 → 청호빌딩

2. **Route V7** (Column 66) - Largest vertical route
   - 4 controllers
   - Road label: "해양경찰청입구 3R"
   - Controllers: 금은동전당 → 에이마트 → 대청 → 트윈타워

3. **Route V9** (Column 71)
   - 4 controllers
   - Road label: "보령4R"
   - Controllers: 대천여중 → 남리넷 → 홈플러스 → 죽정

---

## Detailed Route Breakdown

### Horizontal Routes (East-West)

| Route ID | Excel Row | Road Name | # Controllers | Controller Sequence |
|----------|-----------|-----------|---------------|---------------------|
| H1 | 22 | 원의교차로 | 3 | BC-208 (선촌교차로) → BC-104 (원의교차로) → BC-288 (코리아휠앞) |
| H2 | 27 | Unnamed | 2 | BC-109 (한촌설렁탕) → BC-017 (연기보신원) |
| H3 | 32 | Unnamed | 2 | BC-283 (청파초) → BC-067 (대천여고) |
| H4 | 35 | Unnamed | 2 | BC-074 (대천여중) → BC-231 (연세병원앞) |
| H5 | 37 | Unnamed | 4 | BC-287 (충남해양경찰서) → BC-292 (남리넷) → BC-265 (보령시청) → BC-056 (시청) |
| H6 | 38 | 보령4R | 2 | BC-105 (주봉천) → BC-058 (대명) |
| **H7** | **47** | **화진4거리 3R** | **8** | BC-183 (이박사) → BC-300 (만평사거리) → BC-048 (개도5거리) → BC-084 (예탁결제원) → BC-085 (2공단) → BC-293 (에이마트) → BC-198 (보령말방) → BC-277 (청호빌딩) |
| H8 | 49 | 보령4R | 3 | BC-021 (대천점) → BC-056 (시청) → BC-087 (대성점) |
| H9 | 50 | Unnamed | 2 | BC-252 (병원점) → BC-063 (리베라타운) |
| H10 | 51 | 시청3R | 2 | BC-023 (한남점) → BC-276 (청소 대천점) |
| H11 | 57 | 대청교차로 | 2 | BC-302 (홈플러스) → BC-080 (대청교차로) |
| H12 | 63 | Unnamed | 2 | BC-026 (우리금융점) → BC-205 (트윈타워) |
| H13 | 66 | Unnamed | 2 | BC-258 (주산점) → BC-194 (원의점) |
| H14 | 72 | 웅천IC | 2 | BC-257 (주산동면사무소) → BC-160 (낙동제일점) |

### Vertical Routes (North-South)

| Route ID | Excel Column | Road Name | # Controllers | Controller Sequence |
|----------|--------------|-----------|---------------|---------------------|
| V1 | 4 | 원의교차로 | 2 | BC-104 (원의교차로) ↓ BC-177 (대천점) |
| V2 | 11 | 충청남도경찰청 청문감사 | 2 | BC-108 (주공아파트) ↓ BC-287 (충남해양경찰서) |
| V3 | 55 | 보령4R | 3 | BC-109 (한촌설렁탕) ↓ BC-235 (남포제일점) ↓ BC-160 (낙동제일점) |
| V4 | 57 | 대천3R | 3 | BC-021 (대천점) ↓ BC-023 (한남점) ↓ BC-194 (원의점) |
| V5 | 61 | Unnamed | 2 | BC-288 (코리아휠앞) ↓ BC-076 (대흥병원) |
| V6 | 62 | 창천3R | 2 | BC-026 (우리금융점) ↓ BC-239 (공세) |
| **V7** | **66** | **해양경찰청입구 3R** | **4** | BC-154 (금은동전당) ↓ BC-293 (에이마트) ↓ BC-219 (대청) ↓ BC-205 (트윈타워) |
| V8 | 70 | 보령4R | 2 | BC-015 (보령온천) ↓ BC-018 (대천중점) |
| **V9** | **71** | **보령4R** | **4** | BC-074 (대천여중) ↓ BC-292 (남리넷) ↓ BC-302 (홈플러스) ↓ BC-163 (죽정) |
| V10 | 77 | 대청교차로 | 2 | BC-231 (연세병원앞) ↓ BC-080 (대청교차로) |
| V11 | 80 | Unnamed | 2 | BC-056 (시청) ↓ BC-198 (보령말방) |
| V12 | 84 | Unnamed | 2 | BC-171 (대천세무서앞) ↓ BC-088 (롯데시네마) |
| V13 | 90 | Unnamed | 2 | BC-185 (보령2차혁신회관) ↓ BC-069 (대병원) |

---

## Missing Intersections

**258 out of 309 intersections** are NOT represented in the route diagram. This includes many intersections with IDs like:
- BC-001 through BC-013 (various 거리 intersections)
- BC-016, BC-019, BC-020, BC-022, BC-024, BC-025, BC-027-033, BC-035-036
- And 228+ more controllers

These missing intersections likely represent:
1. Secondary/minor roads
2. Standalone controllers not on major routes
3. Controllers added after the diagram was created (last updated 2021-12-14)

---

## Recommendations for routes.json

### Structure
```json
{
  "routes": [
    {
      "id": "H1",
      "name": "Route display name",
      "type": "horizontal",
      "road_label": "Road name from diagram",
      "controllers": ["BC-XXX", "BC-YYY", "BC-ZZZ"]
    }
  ]
}
```

### Considerations

1. **Use Diagram Data as Starting Point**
   - The 27 routes identified provide a good foundation
   - Road labels (like "보령4R", "대천3R") should be preserved

2. **Handle Missing Controllers**
   - 258 controllers are not in any diagram route
   - These may need to be added manually or left without route assignment

3. **Verify Road Names**
   - Some routes have no road name label in the Excel
   - These may need to be researched or left as "Unnamed"

4. **Controller Ordering**
   - Horizontal routes are ordered left-to-right (west to east)
   - Vertical routes are ordered top-to-bottom (north to south)
   - This ordering should be preserved in the JSON

5. **Duplicate Controllers**
   - Some controllers appear in multiple routes (e.g., BC-056 시청)
   - This is normal for intersections where roads cross
   - The routes.json should allow controllers to be in multiple routes

---

## File Locations

- **Route Diagram Excel:** `C:\JJUN_DEV\TopIt-Traffic-DB\주기표엑셀\최신본\●수정_보령 신호제어기 요도_20211214.xls`
- **Alternative Diagram:** `C:\JJUN_DEV\TopIt-Traffic-DB\요도\A3size_보령 신호제어기 요도(적색점멸용)20240522.xls`
- **Master Database:** `C:\JJUN_DEV\TopIt-Traffic-DB\보령시_신호DB\master.json`
- **Analysis Output:** `C:\JJUN_DEV\TopIt-Traffic-DB\route_analysis.json`
