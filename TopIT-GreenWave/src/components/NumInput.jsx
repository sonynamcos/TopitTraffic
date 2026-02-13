import { useState, useEffect, useRef } from 'react';

/**
 * 편집 중에는 자유 입력, blur/Enter 시 검증하는 숫자 입력
 */
export default function NumInput({ value, min, max, onChange, style }) {
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);
  const ref = useRef(null);

  // 외부 값 변경 시 동기화 (편집 중이 아닐 때만)
  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [value, editing]);

  const commit = () => {
    setEditing(false);
    let v = Number(draft);
    if (isNaN(v) || draft.trim() === '') v = value; // 잘못된 입력은 원래 값 유지
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    setDraft(String(v));
    onChange(v);
  };

  return (
    <input
      ref={ref}
      type="text"
      inputMode="numeric"
      value={draft}
      onFocus={() => {
        setEditing(true);
        setTimeout(() => ref.current?.select(), 0);
      }}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') { e.target.blur(); } }}
      style={style}
    />
  );
}
