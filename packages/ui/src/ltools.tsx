/**
 * 목록 도구 줄의 검색 (v3.38). 처음에는 돋보기 단추만 있고, 누르면 그 자리에서 검색 칸이 펼쳐진다.
 * 비어 있는 채로 밖을 누르거나 Esc 를 누르면 다시 접힌다. 도구 줄은 늘 한 줄.
 */
import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons';

export function ToolSearch({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  const [open, setOpen] = useState(Boolean(value));
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (value) setOpen(true); }, [value]);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  return (
    <div className={`lq ${open ? 'open' : ''}`}>
      <button type="button" className="lq-btn" aria-label={label} aria-expanded={open} title={label} onClick={() => (open && !value ? setOpen(false) : setOpen(true))}><Icon name="search" /></button>
      <input ref={input} tabIndex={open ? 0 : -1} aria-hidden={!open} aria-label={label} value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => { if (!value) setOpen(false); }}
        onKeyDown={(e) => { if (e.key === 'Escape') { onChange(''); setOpen(false); } }} />
      {value && <button type="button" className="lq-x" aria-label="지우기" onClick={() => { onChange(''); input.current?.focus(); }}><Icon name="x" /></button>}
    </div>
  );
}
