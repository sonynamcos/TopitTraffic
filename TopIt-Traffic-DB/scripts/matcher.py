"""
매칭 엔진 - DAT 파일과 주기표 엑셀을 교차로명 기준으로 매칭한다.

매칭 전략:
  1. 정확 매칭: 교차로명 완전 일치
  2. 번호 매칭: intersection_number 일치
  3. 유사 매칭: 편집거리 기반 퍼지 매칭
  4. 부분 매칭: 한쪽이 다른 쪽을 포함

중복 해소:
  - 제조사: 서돌전자 > 서돌전자(추정) > 한진이엔씨 > unknown
  - 날짜: 최신 수정일 우선
  - 파일 크기: 14,784B 우선
  - 파일명: 깔끔한 이름 우선
"""

import re
from typing import Optional


# 제조사 우선순위 (높을수록 우선)
MANUFACTURER_PRIORITY = {
    '서돌전자': 4,
    '서돌전자(추정)': 3,
    'LCsim': 2,
    '한진이엔씨': 1,
    'unknown': 0,
    'error': -1,
}

# 교차로명 동의어/별칭 매핑
ALIASES = {
    '보령IC': ['보령ic', '대천IC', '대천ic'],
    '대천역사거리': ['대천역'],
    '요암삼거리': ['후동삼거리'],
    '삼현입구': ['삼현삼거리'],
    '한내초사거리': ['대천중학교', '대천중'],
}


def normalize_name(name: str) -> str:
    """교차로명을 정규화한다."""
    if not name:
        return ''
    n = name.strip()
    # 공백/언더스코어/하이픈 제거
    n = re.sub(r'[\s_\-]+', '', n)
    # 소문자 변환 (영문 부분)
    n = n.lower()
    # 괄호+내용 제거
    n = re.sub(r'\([^)]*\)', '', n)
    n = re.sub(r'\($', '', n)
    # old/new/구/신 접미사 제거
    n = re.sub(r'(old|new|구|신|변경|수정|기존|최신)$', '', n, flags=re.I)
    # 날짜 제거
    n = re.sub(r'\d{6,8}$', '', n)
    # 숫자R 제거: "4r"
    n = re.sub(r'\d+r$', '', n)
    # 후행 숫자 제거
    n = re.sub(r'\d+$', '', n)
    n = n.strip()
    return n


def edit_distance(s1: str, s2: str) -> int:
    """두 문자열 간 레벤슈타인 편집거리를 계산한다."""
    if len(s1) < len(s2):
        return edit_distance(s2, s1)

    if len(s2) == 0:
        return len(s1)

    prev_row = list(range(len(s2) + 1))
    for i, c1 in enumerate(s1):
        curr_row = [i + 1]
        for j, c2 in enumerate(s2):
            cost = 0 if c1 == c2 else 1
            curr_row.append(min(
                curr_row[j] + 1,
                prev_row[j + 1] + 1,
                prev_row[j] + cost,
            ))
        prev_row = curr_row

    return prev_row[-1]


def name_similarity(name1: str, name2: str) -> float:
    """두 교차로명의 유사도를 0.0~1.0으로 반환한다."""
    n1 = normalize_name(name1)
    n2 = normalize_name(name2)

    if not n1 or not n2:
        return 0.0

    # 정확 일치
    if n1 == n2:
        return 1.0

    # 포함 관계
    if n1 in n2 or n2 in n1:
        shorter = min(len(n1), len(n2))
        longer = max(len(n1), len(n2))
        return shorter / longer * 0.95

    # 별칭 확인
    for canonical, aliases in ALIASES.items():
        norm_aliases = [normalize_name(a) for a in aliases + [canonical]]
        if n1 in norm_aliases and n2 in norm_aliases:
            return 0.9

    # 편집거리 기반
    dist = edit_distance(n1, n2)
    max_len = max(len(n1), len(n2))
    similarity = 1.0 - (dist / max_len)

    return max(0.0, similarity)


def match_dat_to_cycles(dat_entries: list[dict], cycle_entries: list[dict],
                         threshold: float = 0.7) -> list[dict]:
    """DAT 파싱 결과와 주기표 시트 정보를 매칭한다.

    Args:
        dat_entries: dat_parser.scan_dat_directory() 결과
        cycle_entries: xlsx_parser.scan_excel_directory() 결과
        threshold: 매칭 임계값 (0.0~1.0)

    Returns:
        교차로별 매칭 결과 리스트:
        [{
            'intersection_name': str,        # 대표 교차로명
            'intersection_number': int|None,
            'dat_files': [dict],             # 매칭된 DAT 파싱 결과들 (중복 포함)
            'selected_dat': dict|None,       # 최종 선택된 DAT
            'cycle_files': [dict],           # 매칭된 주기표 시트들
            'selected_cycle': dict|None,     # 최종 선택된 주기표
            'match_confidence': str,         # high/medium/low
            'match_details': str,            # 매칭 근거 설명
        }]
    """
    # 1단계: DAT 파일 그룹화 (교차로명 기준)
    dat_groups = _group_by_intersection(dat_entries, key='intersection_name')

    # 2단계: 주기표 그룹화
    cycle_groups = _group_by_intersection(cycle_entries, key='intersection_name')

    # 3단계: 매칭
    matched = []
    used_cycles = set()

    for dat_name, dat_list in dat_groups.items():
        if not dat_name:
            continue

        result = {
            'intersection_name': dat_name,
            'intersection_number': dat_list[0].get('intersection_number'),
            'dat_files': dat_list,
            'selected_dat': None,
            'cycle_files': [],
            'selected_cycle': None,
            'match_confidence': 'low',
            'match_details': '',
        }

        # DAT 최우선 파일 선택
        result['selected_dat'] = _select_best_dat(dat_list)

        # 주기표 매칭 시도
        best_match = None
        best_score = 0.0

        for cycle_name, cycle_list in cycle_groups.items():
            if not cycle_name:
                continue

            score = name_similarity(dat_name, cycle_name)
            if score > best_score and score >= threshold:
                best_score = score
                best_match = (cycle_name, cycle_list)

        # 번호 기반 매칭 폴백
        if best_match is None and result['intersection_number'] is not None:
            for cycle_entry in cycle_entries:
                if cycle_entry.get('intersection_number') == result['intersection_number']:
                    if cycle_entry.get('intersection_name'):
                        cycle_name = cycle_entry['intersection_name']
                        if cycle_name in cycle_groups:
                            best_match = (cycle_name, cycle_groups[cycle_name])
                            best_score = 0.75
                            break

        if best_match:
            cycle_name, cycle_list = best_match
            result['cycle_files'] = cycle_list
            result['selected_cycle'] = cycle_list[0]  # 첫번째 사용
            used_cycles.add(cycle_name)

            if best_score >= 0.95:
                result['match_confidence'] = 'high'
                result['match_details'] = f'교차로명 정확 매칭 (유사도: {best_score:.2f})'
            elif best_score >= 0.8:
                result['match_confidence'] = 'medium'
                result['match_details'] = f'교차로명 유사 매칭 (유사도: {best_score:.2f}, DAT: "{dat_name}" ↔ 주기표: "{cycle_name}")'
            else:
                result['match_confidence'] = 'low'
                result['match_details'] = f'교차로명 부분 매칭 (유사도: {best_score:.2f}, DAT: "{dat_name}" ↔ 주기표: "{cycle_name}")'
        else:
            result['match_details'] = '주기표 매칭 없음'

        matched.append(result)

    # 4단계: 미매칭 주기표 (DAT 없는 교차로)
    for cycle_name, cycle_list in cycle_groups.items():
        if cycle_name and cycle_name not in used_cycles:
            # DAT는 없지만 주기표만 있는 교차로
            norm = normalize_name(cycle_name)
            if not norm:
                continue
            # 이미 매칭된 교차로와 유사한지 확인
            already_matched = False
            for m in matched:
                m_norm = normalize_name(m['intersection_name'])
                if not m_norm:
                    continue
                if m_norm == norm:
                    already_matched = True
                    break
                if name_similarity(norm, m_norm) >= 0.8:
                    already_matched = True
                    break
                # 포함 관계
                if norm in m_norm or m_norm in norm:
                    shorter = min(len(norm), len(m_norm))
                    longer = max(len(norm), len(m_norm))
                    if shorter >= 2 and shorter / longer >= 0.6:
                        already_matched = True
                        break

            if not already_matched:
                matched.append({
                    'intersection_name': cycle_name,
                    'intersection_number': cycle_list[0].get('intersection_number'),
                    'dat_files': [],
                    'selected_dat': None,
                    'cycle_files': cycle_list,
                    'selected_cycle': cycle_list[0],
                    'match_confidence': 'low',
                    'match_details': 'DAT 파일 없음 (주기표만 존재)',
                })

    # 정렬: 번호 → 이름
    matched.sort(key=lambda m: (
        m['intersection_number'] if m['intersection_number'] is not None else 9999,
        m['intersection_name'] or '',
    ))

    return matched


def _group_by_intersection(entries: list[dict], key: str) -> dict[str, list[dict]]:
    """교차로명 기준으로 그룹화한다. 정규화된 이름으로 그룹핑하되 원래 이름을 대표로 사용."""
    groups: dict[str, list[dict]] = {}
    norm_to_canonical: dict[str, str] = {}

    for entry in entries:
        name = entry.get(key)
        if not name:
            groups.setdefault(None, []).append(entry)
            continue

        norm = normalize_name(name)
        if not norm:
            groups.setdefault(None, []).append(entry)
            continue

        # 기존 그룹에서 정확 일치 또는 유사한 이름 찾기
        matched_key = None
        if norm in norm_to_canonical:
            matched_key = norm_to_canonical[norm]
        else:
            # 정규화 이름의 포함 관계 확인 (더 공격적 매칭)
            for existing_norm, canonical in norm_to_canonical.items():
                if not existing_norm:
                    continue
                # 정규화 이름이 동일
                if norm == existing_norm:
                    matched_key = canonical
                    norm_to_canonical[norm] = canonical
                    break
                # 한쪽이 다른쪽을 포함하고 길이 차이가 작음
                if (norm in existing_norm or existing_norm in norm):
                    shorter = min(len(norm), len(existing_norm))
                    longer = max(len(norm), len(existing_norm))
                    if shorter >= 2 and shorter / longer >= 0.7:
                        matched_key = canonical
                        norm_to_canonical[norm] = canonical
                        break
                # 편집거리 기반
                if name_similarity(norm, existing_norm) >= 0.85:
                    matched_key = canonical
                    norm_to_canonical[norm] = canonical
                    break

        if matched_key:
            groups[matched_key].append(entry)
        else:
            norm_to_canonical[norm] = name
            groups[name] = [entry]

    return groups


def _select_best_dat(dat_list: list[dict]) -> Optional[dict]:
    """동일 교차로의 DAT 파일 중 최우선 파일을 선택한다."""
    if not dat_list:
        return None
    if len(dat_list) == 1:
        return dat_list[0]

    def sort_key(d):
        # 1. 제조사 우선순위
        mfr = MANUFACTURER_PRIORITY.get(d.get('manufacturer', 'unknown'), 0)
        # 2. 날짜 (최신 우선)
        date = d.get('date_modified') or '0000-00-00'
        # 3. 표준 파일 크기
        size_match = 1 if d.get('size') == 14784 else 0
        # 4. 파일명 깔끔함 (짧을수록)
        name_len = len(d.get('filename', ''))

        return (-mfr, date, -size_match, name_len)

    # 내림차순 정렬 후 마지막 = 최우선
    sorted_list = sorted(dat_list, key=sort_key)
    return sorted_list[0]


if __name__ == '__main__':
    # 단독 테스트용
    print('matcher.py - DAT ↔ 주기표 매칭 엔진')
    print('사용법: classify.py에서 호출됩니다.')

    # 유사도 테스트
    test_pairs = [
        ('신설사거리', '신설사거리'),
        ('신설사거리', '신설 사거리'),
        ('대천역사거리', '대천역'),
        ('보령IC', '대천IC'),
        ('한내초', '한내초사거리'),
        ('해날아파트', '해날APT'),
        ('궁촌사거리', '궁촌4거리'),
    ]
    for a, b in test_pairs:
        sim = name_similarity(a, b)
        print(f'  "{a}" ↔ "{b}" = {sim:.2f}')
