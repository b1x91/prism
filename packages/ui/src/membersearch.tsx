/**
 * 멤버 검색 (CLAUDE.md v3.149) — 멤버 화면 머리. 롤 이름·디스코드 이름으로 찾아 누르면 회원 페이지.
 * 글자를 멈추고 0.2초 뒤에 묻는다. 위아래 화살표·Enter·Esc. 담아 두지 않는 주소(/api/members/search).
 */
import { useEffect, useRef, useState } from 'react';
import { shortNick, type Api } from '@prism/core';
import { MemberFace, PendingChip } from './basics';
import { Icon } from './icons';

type Hit = { id: string; nick: string; skin: number | null; main: number | null; pending?: boolean };

export function MemberSearch({ api, onOpen }: { api: Api; onOpen: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const seq = useRef(0);
  useEffect(() => {
    const t = q.trim();
    if (!t) { setHits(null); return; }
    const n = ++seq.current;
    const h = window.setTimeout(() => {
      api.get<{ members: Hit[] }>(`/api/members/search?q=${encodeURIComponent(t)}`).then((r) => { if (n === seq.current) { setHits(r.members); setHi(0); } }).catch(() => { if (n === seq.current) setHits([]); });
    }, 200);
    return () => window.clearTimeout(h);
  }, [q, api]);
  useEffect(() => {
    const out = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', out);
    return () => document.removeEventListener('pointerdown', out);
  }, []);
  const go = (h: Hit) => { setOpen(false); setQ(''); onOpen(h.id); };
  const show = open && q.trim().length > 0;
  return (
    <div className="msearch" ref={box}>
      <label className="msearch-in">
        <Icon name="search" />
        <input value={q} placeholder="멤버 검색" aria-label="멤버 검색" role="combobox" aria-expanded={show} aria-controls="msearch-list" autoComplete="off"
          onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { setOpen(false); (e.target as HTMLInputElement).blur(); }
            if (!hits?.length) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); setHi((i) => (i + 1) % hits.length); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setHi((i) => (i - 1 + hits.length) % hits.length); }
            if (e.key === 'Enter') { e.preventDefault(); go(hits[hi]); }
          }} />
        {q && <button type="button" className="msearch-x" aria-label="지우기" onClick={() => { setQ(''); setHits(null); }}><Icon name="x" /></button>}
      </label>
      {show && (
        <div className="msearch-pop" id="msearch-list" role="listbox">
          {hits === null ? <p className="msearch-msg">찾는 중…</p> : !hits.length ? <p className="msearch-msg">'{q.trim()}'에 맞는 멤버가 없어요</p>
            : hits.map((h, i) => (
              <button key={h.id} type="button" role="option" aria-selected={i === hi} className={`msearch-row ${i === hi ? 'on' : ''}`} onPointerEnter={() => setHi(i)} onClick={() => go(h)}>
                <MemberFace nick={h.nick} skin={h.skin} champion={h.main} size={32} />
                <span className="msearch-nick">{shortNick(h.nick)}<small>{h.nick.includes('#') ? `#${h.nick.split('#')[1]}` : ''}</small></span>
                {h.pending && <PendingChip />}
                <Icon name="chevR" />
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
