"""
DAT 파일 파서 - 서돌전자(SUHDOL), 한진이엔씨(Remote Data Ver), LCsim, Plain 포맷 지원

서돌전자 바이너리 구조 (14,784 bytes):
  - 0x0000: 타이밍 계획 (20바이트 × N plans)
  - 0x0CDA: LSU 활성 플래그
  - 0x2F6A: LSU 타입
  - 0x391D: "SUHDOL" 시그니처 #1
  - 0x3936: 날짜 (BE uint16 year + uint8 month + uint8 day)
  - 0x393B: 전화번호 ASCII
  - 0x395A: "SUHDOL" 시그니처 #2
"""

import os
import re
import struct
from pathlib import Path
from typing import Optional


# ── 상수 ──

SUHDOL_SIZE = 14784          # 0x39C0
SUHDOL_EXT_SIZE = 14846      # 0x39FE
SUHDOL_SIG = b'SUHDOL'

# 서돌 표준 오프셋
SUHDOL_OFFSETS = {
    'sig1': 0x391D,
    'sig2': 0x395A,
    'date': 0x3936,
    'phone': 0x393B,
    'lsu_type_base': 0x2F6A,
    'lsu_active_base': 0x0CDA,
    'timing_base': 0x0000,
}

# 서돌 확장 오프셋 (62바이트 시프트)
SUHDOL_EXT_OFFSETS = {
    'sig1': 0x3955,
    'sig2': 0x3992,
    'date': 0x396E,
    'phone': 0x3973,
    'lsu_type_base': 0x2F6A,
    'lsu_active_base': 0x0CDA,
    'timing_base': 0x0000,
}

LSU_TYPE_MAP = {
    0x44: '차량4색',
    0x33: '차량3색',
    0x88: '보행2색',
}

MAX_PLANS = 48       # 최대 타이밍 계획 수
MAX_LSU = 16         # 최대 LSU 수
TIMING_PLAN_SIZE = 20


def parse_dat(filepath: str) -> dict:
    """DAT 파일을 파싱하여 메타데이터 딕셔너리를 반환한다."""
    filepath = str(filepath)
    with open(filepath, 'rb') as f:
        data = f.read()

    result = {
        'path': filepath,
        'filename': os.path.basename(filepath),
        'size': len(data),
        'manufacturer': 'unknown',
        'format': 'unknown',
        'intersection_name': None,
        'intersection_number': None,
        'date_created': None,
        'date_modified': None,
        'phone': None,
        'phases': 0,
        'plans': [],
        'lsu_active': [],
        'lsu_types': [],
        'confidence': 'low',
        'raw_errors': [],
    }

    # 파일명에서 교차로명 추출
    _extract_name_from_filename(result)

    # 포맷 판별 & 파싱
    if _is_remote_data(data):
        _parse_remote_data(data, result)
    elif len(data) == SUHDOL_SIZE:
        if _has_suhdol_sig(data, SUHDOL_OFFSETS):
            _parse_suhdol(data, result, SUHDOL_OFFSETS)
        else:
            _parse_plain(data, result)
    elif len(data) == SUHDOL_EXT_SIZE:
        if _has_suhdol_sig(data, SUHDOL_EXT_OFFSETS):
            _parse_suhdol(data, result, SUHDOL_EXT_OFFSETS)
        else:
            _parse_plain(data, result)
    elif len(data) == 61472:  # LCsim
        _parse_lcsim(data, result)
    else:
        # 크기만으로 판별 불가 → SUHDOL 시그니처 전체 검색
        sig_pos = data.find(SUHDOL_SIG)
        if sig_pos >= 0:
            result['manufacturer'] = '서돌전자'
            result['format'] = 'suhdol_nonstandard'
            result['confidence'] = 'medium'
            result['raw_errors'].append(f'비표준 크기({len(data)}B)이나 SUHDOL 시그니처 발견 at 0x{sig_pos:04X}')
        elif data[:15].startswith(b'Remote Data'):
            _parse_remote_data(data, result)
        else:
            result['format'] = 'unknown'
            result['confidence'] = 'low'

    return result


# ── 포맷 판별 ──

def _is_remote_data(data: bytes) -> bool:
    return data[:11] == b'Remote Data'


def _has_suhdol_sig(data: bytes, offsets: dict) -> bool:
    sig1_pos = offsets['sig1']
    if sig1_pos + 6 <= len(data):
        return data[sig1_pos:sig1_pos + 6] == SUHDOL_SIG
    return False


# ── 서돌전자 파싱 ──

def _parse_suhdol(data: bytes, result: dict, offsets: dict):
    result['manufacturer'] = '서돌전자'
    result['confidence'] = 'high'

    if len(data) == SUHDOL_EXT_SIZE:
        result['format'] = 'suhdol_extended'
    else:
        result['format'] = 'suhdol'

    # 날짜
    date_off = offsets['date']
    if date_off + 4 <= len(data):
        year = struct.unpack('>H', data[date_off:date_off + 2])[0]
        month = data[date_off + 2]
        day = data[date_off + 3]
        if 2000 <= year <= 2030 and 1 <= month <= 12 and 1 <= day <= 31:
            result['date_modified'] = f'{year:04d}-{month:02d}-{day:02d}'
        else:
            result['raw_errors'].append(f'날짜 범위 이상: {year}-{month}-{day}')

    # 전화번호
    phone_off = offsets['phone']
    if phone_off + 13 <= len(data):
        phone_bytes = data[phone_off:phone_off + 20]
        # NULL 종료 또는 비 ASCII 까지
        phone_str = ''
        for b in phone_bytes:
            if b == 0 or b > 127:
                break
            phone_str += chr(b)
        phone_str = phone_str.strip()
        if phone_str and re.match(r'[\d\-]+', phone_str):
            result['phone'] = phone_str

    # 타이밍 계획
    _parse_timing_plans(data, result, offsets['timing_base'])

    # LSU
    _parse_lsu(data, result, offsets['lsu_type_base'], offsets['lsu_active_base'])


# ── Plain 포맷 (14,784B, 시그니처 없음) ──

def _parse_plain(data: bytes, result: dict):
    result['manufacturer'] = '서돌전자(추정)'
    result['format'] = 'plain'
    result['confidence'] = 'medium'

    # 타이밍 계획은 동일 구조
    _parse_timing_plans(data, result, 0x0000)

    # LSU (같은 오프셋 시도)
    _parse_lsu(data, result, 0x2F6A, 0x0CDA)


# ── 한진이엔씨 파싱 ──

def _parse_remote_data(data: bytes, result: dict):
    result['manufacturer'] = '한진이엔씨'
    result['confidence'] = 'high'

    # 버전 추출
    header = data[:30]
    try:
        header_str = header.decode('ascii', errors='ignore').strip('\x00')
        ver_match = re.search(r'Remote Data Ver\s*([\d.]+)', header_str)
        if ver_match:
            result['format'] = f'remote_data_v{ver_match.group(1)}'
        else:
            result['format'] = 'remote_data'
    except Exception:
        result['format'] = 'remote_data'

    # 한진 포맷의 세부 파싱은 추후 확장
    # 현재는 제조사 식별까지만 수행


# ── LCsim 파싱 ──

def _parse_lcsim(data: bytes, result: dict):
    result['manufacturer'] = 'LCsim'
    result['format'] = 'lcsim'
    result['confidence'] = 'medium'


# ── 타이밍 계획 파싱 (서돌/Plain 공통) ──

def _parse_timing_plans(data: bytes, result: dict, base_offset: int):
    plans = []
    for i in range(MAX_PLANS):
        off = base_offset + i * TIMING_PLAN_SIZE
        if off + TIMING_PLAN_SIZE > len(data):
            break

        plan_data = data[off:off + TIMING_PLAN_SIZE]
        cycle = plan_data[2]
        offset_val = plan_data[3]

        if cycle == 0:
            continue

        # 현시 추출 (바이트 4~11)
        phase_times = list(plan_data[4:12])

        # 검증: 합계 = 2 × 주기
        phase_sum = sum(phase_times)

        # 유효 현시만 (0이 아닌 것) - 중복 쌍 제거
        unique_phases = []
        for j in range(0, len(phase_times), 2):
            val = phase_times[j]
            if val > 0:
                unique_phases.append(val)

        valid = (phase_sum == 2 * cycle) if cycle > 0 else False

        plan = {
            'plan_index': i,
            'cycle': cycle,
            'offset': offset_val,
            'splits': unique_phases,
            'raw_phases': phase_times,
            'valid': valid,
        }

        if not valid and cycle > 0:
            plan['warning'] = f'현시 합계({phase_sum}) != 2×주기({2 * cycle})'
            result['raw_errors'].append(f'Plan {i}: {plan["warning"]}')

        plans.append(plan)

    result['plans'] = plans
    if plans:
        result['phases'] = len(plans[0]['splits'])


# ── LSU 파싱 ──

def _parse_lsu(data: bytes, result: dict, type_base: int, active_base: int):
    # LSU 활성 상태
    lsu_active = []
    for i in range(MAX_LSU):
        off = active_base + i
        if off < len(data):
            lsu_active.append(data[off] == 1)
        else:
            break
    result['lsu_active'] = lsu_active

    # LSU 타입
    lsu_types = []
    for i in range(MAX_LSU):
        off = type_base + i
        if off < len(data):
            type_byte = data[off]
            lsu_types.append(LSU_TYPE_MAP.get(type_byte, f'0x{type_byte:02X}'))
        else:
            break
    result['lsu_types'] = lsu_types


# ── 파일명에서 교차로명 추출 ──

def _extract_name_from_filename(result: dict):
    basename = os.path.splitext(result['filename'])[0]

    # 앞쪽 숫자+언더스코어 제거: "47_신설사거리" → "신설사거리"
    num_match = re.match(r'^(\d+)[_\-](.+)$', basename)
    if num_match:
        result['intersection_number'] = int(num_match.group(1))
        cleaned = num_match.group(2)
    else:
        cleaned = basename

    # "@" 접두사 제거 (템플릿 파일)
    cleaned = re.sub(r'^@', '', cleaned)

    # 날짜 접미사 제거: "20240531", "20220524", "2024.05.31", "22.08.18"
    cleaned = re.sub(r'[\._\- ]?\d{4}\.\d{2}\.\d{2}\.?$', '', cleaned)
    cleaned = re.sub(r'[\._\- ]?\d{2}\.\d{2}\.\d{2}\.?$', '', cleaned)
    cleaned = re.sub(r'[\._\- ]?\d{8}$', '', cleaned)
    cleaned = re.sub(r'[\._\- ]?서?\d{6}$', '', cleaned)  # "서240812"

    # 모든 괄호 내용 제거 (교차로명 자체에 괄호가 포함된 경우는 거의 없음)
    # "궁촌사거리(한진 3.5.2)" → "궁촌사거리"
    # "대천중(한내초사거리)" → "대천중"
    # "센트럴파크(센트럴이편한정문)" → "센트럴파크"
    cleaned = re.sub(r'\([^)]*\)', '', cleaned)
    # 닫히지 않은 괄호도 제거: "관산사거리(" → "관산사거리"
    cleaned = re.sub(r'\($', '', cleaned)

    # 접미사 키워드 제거 (반복 적용)
    for _ in range(3):
        cleaned = re.sub(
            r'[_\- ]?(백업|copy|old|최신|수정|원본|임시|test|new|기존|잘못|정문|_수정)$',
            '', cleaned, flags=re.I
        )

    # "서돌", "한진" 등 제조사명 접미사 제거
    cleaned = re.sub(r'[_\- ]?(서돌|한진|서|LCsim)$', '', cleaned, flags=re.I)

    # 숫자 접미사 제거: "3R", "4R" 등
    cleaned = re.sub(r'\d+[Rr]$', '', cleaned)

    # 후행 숫자/특수문자 제거
    cleaned = re.sub(r'[\d]*$', '', cleaned)

    cleaned = cleaned.strip(' _-.')
    result['intersection_name'] = cleaned if cleaned else None


def scan_dat_directory(directory: str) -> list[dict]:
    """디렉토리 내 모든 .dat 파일을 스캔하여 파싱 결과 리스트를 반환한다."""
    results = []
    dir_path = Path(directory)
    for dat_file in sorted(dir_path.rglob('*.dat')):
        try:
            parsed = parse_dat(str(dat_file))
            results.append(parsed)
        except Exception as e:
            results.append({
                'path': str(dat_file),
                'filename': dat_file.name,
                'size': dat_file.stat().st_size if dat_file.exists() else 0,
                'manufacturer': 'error',
                'format': 'error',
                'intersection_name': None,
                'confidence': 'none',
                'raw_errors': [str(e)],
            })
    return results


if __name__ == '__main__':
    import json
    import sys

    target = sys.argv[1] if len(sys.argv) > 1 else '.'

    if os.path.isfile(target):
        result = parse_dat(target)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        results = scan_dat_directory(target)
        print(f'총 {len(results)}개 DAT 파일 스캔 완료')
        for r in results:
            status = '✅' if r['confidence'] in ('high', 'medium') else '❌'
            name = r.get('intersection_name', '?')
            print(f"  {status} {r['filename']:40s} → {r['manufacturer']:12s} | {r['format']:20s} | {name}")
