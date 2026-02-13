"""
보령시 교통신호제어기 통합 분류 스크립트

사용법:
    python scripts/classify.py [--dat-dir DIR] [--xlsx-dir DIR] [--output-dir DIR]

기본값:
    --dat-dir   : 참조할dat/제어기DB/
    --xlsx-dir  : 주기표엑셀/
    --output-dir: 보령시_신호DB/

실행 결과:
    보령시_신호DB/
    ├── _원본/dat_원본/         ← 원본 DAT 복사
    ├── _원본/주기표_원본/      ← 원본 엑셀 복사
    ├── _미분류/dat_미분류/     ← 분류 실패 DAT
    ├── _미분류/주기표_미분류/  ← 분류 실패 엑셀
    ├── 교차로/{이름}/          ← 교차로별 정리 폴더
    │   ├── {이름}.dat
    │   ├── {이름}_주기표.xlsx
    │   └── info.json
    ├── master.json
    └── 분류보고서.md
"""

import argparse
import io
import json
import os
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path

# Windows CP949 콘솔 유니코드 출력 문제 해결
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# 같은 디렉토리의 모듈 임포트
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dat_parser import scan_dat_directory, parse_dat
from xlsx_parser import scan_excel_directory
from matcher import match_dat_to_cycles


def main():
    args = parse_args()

    # 프로젝트 루트 (scripts/ 의 상위)
    project_root = Path(os.path.dirname(os.path.abspath(__file__))).parent

    dat_dir = Path(args.dat_dir) if args.dat_dir else project_root / '참조할dat' / '제어기DB'
    xlsx_dir = Path(args.xlsx_dir) if args.xlsx_dir else project_root / '주기표엑셀'
    output_dir = Path(args.output_dir) if args.output_dir else project_root / '보령시_신호DB'

    print('=' * 60)
    print('  보령시 교통신호제어기 통합 분류 시스템')
    print('=' * 60)
    print(f'  DAT 소스:    {dat_dir}')
    print(f'  주기표 소스: {xlsx_dir}')
    print(f'  출력 폴더:   {output_dir}')
    print('=' * 60)

    # ── STEP 0: 출력 디렉토리 준비 ──
    print('\n[STEP 0] 출력 디렉토리 준비...')
    dirs = setup_output_dirs(output_dir)

    # ── STEP 1: DAT 파일 스캔 ──
    print('\n[STEP 1] DAT 파일 스캔 중...')
    if not dat_dir.exists():
        print(f'  ❌ DAT 디렉토리를 찾을 수 없음: {dat_dir}')
        return
    dat_results = scan_dat_directory(str(dat_dir))
    print(f'  총 {len(dat_results)}개 DAT 파일 발견')

    # 제조사별 통계
    mfr_counts = {}
    for d in dat_results:
        mfr = d.get('manufacturer', 'unknown')
        mfr_counts[mfr] = mfr_counts.get(mfr, 0) + 1
    for mfr, count in sorted(mfr_counts.items()):
        print(f'    - {mfr}: {count}개')

    # ── STEP 2: 주기표 엑셀 스캔 ──
    print('\n[STEP 2] 주기표 엑셀 스캔 중...')
    if not xlsx_dir.exists():
        print(f'  ⚠ 주기표 디렉토리를 찾을 수 없음: {xlsx_dir}')
        cycle_results = []
    else:
        cycle_results = scan_excel_directory(str(xlsx_dir))
        total_sheets = len(cycle_results)
        named_sheets = sum(1 for c in cycle_results if c['intersection_name'])
        error_sheets = sum(1 for c in cycle_results if c.get('error'))
        print(f'  총 {total_sheets}개 시트 발견 (교차로명 추출: {named_sheets}, 오류: {error_sheets})')

    # ── STEP 3: 매칭 ──
    print('\n[STEP 3] DAT ↔ 주기표 매칭 중...')
    matches = match_dat_to_cycles(dat_results, cycle_results)
    print(f'  총 {len(matches)}개 교차로 식별')

    match_stats = {'high': 0, 'medium': 0, 'low': 0}
    has_dat = 0
    has_cycle = 0
    has_both = 0
    for m in matches:
        match_stats[m['match_confidence']] += 1
        d = m['selected_dat'] is not None
        c = m['selected_cycle'] is not None
        if d:
            has_dat += 1
        if c:
            has_cycle += 1
        if d and c:
            has_both += 1

    print(f'    - DAT 있음: {has_dat}')
    print(f'    - 주기표 있음: {has_cycle}')
    print(f'    - 둘 다 있음: {has_both}')
    print(f'    - 매칭 신뢰도: high={match_stats["high"]}, medium={match_stats["medium"]}, low={match_stats["low"]}')

    # ── STEP 4: 원본 복사 ──
    print('\n[STEP 4] 원본 파일 보존 복사...')
    copy_originals(dat_dir, xlsx_dir, dirs)

    # ── STEP 5: 교차로별 폴더 생성 ──
    print('\n[STEP 5] 교차로별 폴더 생성 중...')
    intersection_infos = []
    unclassified_dats = []
    unclassified_cycles = []

    id_counter = 1
    for m in matches:
        name = m['intersection_name']
        if not name:
            # 미분류
            for d in m['dat_files']:
                unclassified_dats.append(d)
            for c in m['cycle_files']:
                unclassified_cycles.append(c)
            continue

        # 교차로 ID 부여
        bc_id = f'BC-{id_counter:03d}'
        id_counter += 1

        # 폴더 생성
        intersection_dir = dirs['intersections'] / _safe_dirname(name)
        intersection_dir.mkdir(parents=True, exist_ok=True)

        # DAT 복사
        dat_copied = False
        if m['selected_dat']:
            src = m['selected_dat']['path']
            dst = intersection_dir / f'{_safe_dirname(name)}.dat'
            try:
                shutil.copy2(src, dst)
                dat_copied = True
            except Exception as e:
                print(f'  ⚠ DAT 복사 실패 ({name}): {e}')

        # 주기표 복사
        cycle_copied = False
        if m['selected_cycle'] and m['selected_cycle'].get('source_file'):
            src = m['selected_cycle']['source_file']
            ext = os.path.splitext(src)[1]
            dst = intersection_dir / f'{_safe_dirname(name)}_주기표{ext}'
            try:
                shutil.copy2(src, dst)
                cycle_copied = True
            except Exception as e:
                print(f'  ⚠ 주기표 복사 실패 ({name}): {e}')

        # info.json 생성
        info = build_info_json(bc_id, name, m, dat_copied, cycle_copied)
        info_path = intersection_dir / 'info.json'
        with open(info_path, 'w', encoding='utf-8') as f:
            json.dump(info, f, ensure_ascii=False, indent=2)

        intersection_infos.append(info)
        print(f'  ✅ {bc_id} {name:25s} DAT:{"✅" if dat_copied else "❌"} 주기표:{"✅" if cycle_copied else "❌"} ({m["match_confidence"]})')

    # 미분류 DAT 복사
    for d in unclassified_dats:
        try:
            shutil.copy2(d['path'], dirs['unclassified_dat'] / d['filename'])
        except Exception:
            pass

    # 미분류 주기표 복사
    for c in unclassified_cycles:
        if c.get('source_file'):
            try:
                shutil.copy2(c['source_file'], dirs['unclassified_cycle'] / c['source_filename'])
            except Exception:
                pass

    # ── STEP 6: master.json 생성 ──
    print('\n[STEP 6] master.json 생성...')
    master = build_master_json(intersection_infos)
    master_path = output_dir / 'master.json'
    with open(master_path, 'w', encoding='utf-8') as f:
        json.dump(master, f, ensure_ascii=False, indent=2)
    print(f'  ✅ {master_path}')

    # ── STEP 7: 분류보고서 생성 ──
    print('\n[STEP 7] 분류보고서 생성...')
    report = build_report(dat_results, cycle_results, matches, intersection_infos,
                          unclassified_dats, unclassified_cycles)
    report_path = output_dir / '분류보고서.md'
    with open(report_path, 'w', encoding='utf-8') as f:
        f.write(report)
    print(f'  ✅ {report_path}')

    # ── 완료 ──
    print('\n' + '=' * 60)
    print(f'  분류 완료!')
    print(f'  총 교차로: {len(intersection_infos)}개')
    print(f'  출력 폴더: {output_dir}')
    print(f'  분류보고서: {report_path}')
    print('=' * 60)


def parse_args():
    parser = argparse.ArgumentParser(description='보령시 교통신호제어기 통합 분류 시스템')
    parser.add_argument('--dat-dir', help='DAT 파일 소스 디렉토리')
    parser.add_argument('--xlsx-dir', help='주기표 엑셀 소스 디렉토리')
    parser.add_argument('--output-dir', help='출력 디렉토리')
    return parser.parse_args()


def setup_output_dirs(output_dir: Path) -> dict:
    """출력 디렉토리 구조를 생성한다."""
    dirs = {
        'root': output_dir,
        'originals_dat': output_dir / '_원본' / 'dat_원본',
        'originals_cycle': output_dir / '_원본' / '주기표_원본',
        'unclassified_dat': output_dir / '_미분류' / 'dat_미분류',
        'unclassified_cycle': output_dir / '_미분류' / '주기표_미분류',
        'intersections': output_dir / '교차로',
        'yodo': output_dir / '요도',
    }
    for d in dirs.values():
        d.mkdir(parents=True, exist_ok=True)
    return dirs


def copy_originals(dat_dir: Path, xlsx_dir: Path, dirs: dict):
    """원본 파일을 보존 복사한다."""
    # DAT 원본 복사
    dat_count = 0
    for dat_file in dat_dir.rglob('*.dat'):
        dst = dirs['originals_dat'] / dat_file.name
        if not dst.exists():
            try:
                shutil.copy2(dat_file, dst)
                dat_count += 1
            except Exception:
                pass
    print(f'  DAT 원본 {dat_count}개 복사 → {dirs["originals_dat"]}')

    # 주기표 원본 복사
    xlsx_count = 0
    for pattern in ['*.xlsx', '*.xls']:
        for xlsx_file in xlsx_dir.rglob(pattern):
            if xlsx_file.name.startswith('~$'):
                continue
            dst = dirs['originals_cycle'] / xlsx_file.name
            if not dst.exists():
                try:
                    shutil.copy2(xlsx_file, dst)
                    xlsx_count += 1
                except Exception:
                    pass
    print(f'  주기표 원본 {xlsx_count}개 복사 → {dirs["originals_cycle"]}')


def build_info_json(bc_id: str, name: str, match: dict,
                    dat_copied: bool, cycle_copied: bool) -> dict:
    """교차로별 info.json을 생성한다."""
    selected_dat = match.get('selected_dat') or {}

    info = {
        'id': bc_id,
        'name': name,
        'alias': [],
        'type': _guess_intersection_type(name),
        'manufacturer': selected_dat.get('manufacturer', 'unknown'),
        'controller_model': '',
    }

    # DAT 정보
    if selected_dat:
        dat_info = {
            'filename': f'{_safe_dirname(name)}.dat' if dat_copied else None,
            'original_filename': selected_dat.get('filename', ''),
            'size': selected_dat.get('size', 0),
            'manufacturer_detected': selected_dat.get('manufacturer', 'unknown'),
            'format': selected_dat.get('format', 'unknown'),
            'date_modified': selected_dat.get('date_modified'),
            'phone': selected_dat.get('phone'),
            'phases': selected_dat.get('phases', 0),
            'plans': [],
        }

        for p in selected_dat.get('plans', []):
            dat_info['plans'].append({
                'plan': p['plan_index'],
                'cycle': p['cycle'],
                'offset': p['offset'],
                'splits': p['splits'],
                'valid': p['valid'],
            })

        # LSU 정보
        if selected_dat.get('lsu_active'):
            dat_info['lsu_active'] = selected_dat['lsu_active']
        if selected_dat.get('lsu_types'):
            dat_info['lsu_types'] = selected_dat['lsu_types']

        info['dat'] = dat_info
    else:
        info['dat'] = None

    # 주기표 정보
    if match.get('selected_cycle'):
        cycle = match['selected_cycle']
        ext = os.path.splitext(cycle.get('source_file', '.xlsx'))[1]
        info['cycle_table'] = {
            'filename': f'{_safe_dirname(name)}_주기표{ext}' if cycle_copied else None,
            'source_file': cycle.get('source_filename', ''),
            'sheet_name': cycle.get('sheet_name', ''),
        }
    else:
        info['cycle_table'] = None

    # 위치 (추후 입력)
    info['location'] = {
        'lat': None,
        'lng': None,
        'address': '',
    }

    info['routes'] = []
    info['status'] = '정상'
    info['notes'] = ''

    info['history'] = [{
        'date': datetime.now().strftime('%Y-%m-%d'),
        'action': '자동 분류 (classify.py)',
        'by': 'system',
    }]

    info['_classification'] = {
        'source_files': [d['filename'] for d in match.get('dat_files', [])],
        'selected': selected_dat.get('filename', ''),
        'reason': match.get('match_details', ''),
        'confidence': match.get('match_confidence', 'low'),
    }

    return info


def build_master_json(infos: list[dict]) -> dict:
    """전체 교차로 마스터 목록을 생성한다."""
    intersections = []
    for info in infos:
        dat = info.get('dat') or {}
        first_cycle = dat.get('plans', [{}])[0] if dat.get('plans') else {}

        intersections.append({
            'id': info['id'],
            'name': info['name'],
            'manufacturer': info.get('manufacturer', 'unknown'),
            'route': '',
            'has_dat': info.get('dat') is not None and info['dat'].get('filename') is not None,
            'has_cycle_table': info.get('cycle_table') is not None and info['cycle_table'].get('filename') is not None,
            'status': info.get('status', '정상'),
            'phases': dat.get('phases', 0),
            'cycle': first_cycle.get('cycle', 0),
        })

    return {
        'version': '1.0',
        'created': datetime.now().strftime('%Y-%m-%d'),
        'city': '보령시',
        'total': len(intersections),
        'intersections': intersections,
    }


def build_report(dat_results, cycle_results, matches, infos,
                 unclassified_dats, unclassified_cycles) -> str:
    """분류보고서 마크다운을 생성한다."""
    now = datetime.now().strftime('%Y-%m-%d %H:%M')

    lines = [
        f'# 보령시 교통신호제어기 분류보고서',
        f'',
        f'생성일시: {now}',
        f'',
        f'---',
        f'',
        f'## 요약',
        f'',
        f'| 항목 | 수 |',
        f'|------|-----|',
        f'| DAT 파일 (총) | {len(dat_results)} |',
        f'| 주기표 시트 (총) | {len(cycle_results)} |',
        f'| 식별된 교차로 | {len(infos)} |',
        f'| DAT 확보 | {sum(1 for i in infos if i.get("dat") and i["dat"].get("filename"))} |',
        f'| 주기표 확보 | {sum(1 for i in infos if i.get("cycle_table") and i["cycle_table"].get("filename"))} |',
        f'| 미분류 DAT | {len(unclassified_dats)} |',
        f'| 미분류 주기표 | {len(unclassified_cycles)} |',
        f'',
    ]

    # 제조사별 통계
    lines.extend([
        f'## 제조사별 분포',
        f'',
        f'| 제조사 | 수 |',
        f'|--------|-----|',
    ])
    mfr_counts = {}
    for d in dat_results:
        mfr = d.get('manufacturer', 'unknown')
        mfr_counts[mfr] = mfr_counts.get(mfr, 0) + 1
    for mfr, count in sorted(mfr_counts.items(), key=lambda x: -x[1]):
        lines.append(f'| {mfr} | {count} |')
    lines.append('')

    # 교차로 목록
    lines.extend([
        f'## 교차로 목록',
        f'',
        f'| ID | 교차로명 | 제조사 | 현시 | DAT | 주기표 | 매칭 |',
        f'|----|----------|--------|------|-----|--------|------|',
    ])
    for info in infos:
        dat = info.get('dat') or {}
        has_d = 'O' if info.get('dat') and info['dat'].get('filename') else 'X'
        has_c = 'O' if info.get('cycle_table') and info['cycle_table'].get('filename') else 'X'
        conf = info.get('_classification', {}).get('confidence', '?')
        lines.append(
            f'| {info["id"]} | {info["name"]} | {info.get("manufacturer", "?")} '
            f'| {dat.get("phases", "-")} | {has_d} | {has_c} | {conf} |'
        )
    lines.append('')

    # 중복 파일 목록
    duplicates = [m for m in matches if len(m.get('dat_files', [])) > 1]
    if duplicates:
        lines.extend([
            f'## 중복 DAT 파일',
            f'',
        ])
        for m in duplicates:
            selected = m.get('selected_dat', {}).get('filename', '?')
            lines.append(f'### {m["intersection_name"]}')
            lines.append(f'  선택: **{selected}**')
            for d in m['dat_files']:
                marker = ' (선택됨)' if d['filename'] == selected else ''
                date = d.get('date_modified') or '날짜없음'
                lines.append(f'  - {d["filename"]} ({d["manufacturer"]}, {d["size"]}B, {date}){marker}')
            lines.append('')

    # 미분류 파일 목록
    if unclassified_dats:
        lines.extend([
            f'## 미분류 DAT 파일',
            f'',
        ])
        for d in unclassified_dats:
            lines.append(f'  - {d["filename"]} ({d.get("manufacturer", "?")})')
        lines.append('')

    if unclassified_cycles:
        lines.extend([
            f'## 미분류 주기표',
            f'',
        ])
        for c in unclassified_cycles:
            lines.append(f'  - {c.get("source_filename", "?")} [{c.get("sheet_name", "?")}]')
        lines.append('')

    # 수동 확인 필요 목록
    manual_check = [m for m in matches if m['match_confidence'] == 'low' and m['selected_dat']]
    if manual_check:
        lines.extend([
            f'## 수동 확인 필요',
            f'',
        ])
        for m in manual_check:
            lines.append(f'  - {m["intersection_name"]}: {m["match_details"]}')
        lines.append('')

    return '\n'.join(lines)


def _safe_dirname(name: str) -> str:
    """파일시스템에 안전한 디렉토리명으로 변환한다."""
    # 파일시스템에서 사용 불가한 문자 제거
    safe = re.sub(r'[<>:"/\\|?*]', '', name)
    safe = safe.strip('. ')
    return safe if safe else 'unnamed'


def _guess_intersection_type(name: str) -> str:
    """교차로명에서 유형을 추정한다."""
    if '사거리' in name or '4거리' in name:
        return '사거리'
    elif '삼거리' in name or '3거리' in name:
        return '삼거리'
    elif '교차로' in name:
        return '교차로'
    elif '입구' in name:
        return '입구'
    elif '앞' in name:
        return '단일로'
    else:
        return '기타'


if __name__ == '__main__':
    main()
