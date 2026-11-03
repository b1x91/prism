/**
 * 통합 검색 (v3.156) — 웹 홈(멤버·챔프·증강)과 멤버 화면(멤버만)이 같은 검색 경험을 쓴다.
 * - 비어 있을 때 누르면: 최근 검색 + 바로가기
 * - 글자를 치면: 묶음(멤버 · 챔프 · 증강)마다 결과, 맞은 글자 강조, 멤버는 판수·승률
 * - 위아래 화살표는 묶음을 넘나들고, Enter 로 열고, Esc 로 닫는다. '/' 를 누르면 바로 검색 칸으로 (hotkey)
 * - 멤버는 서버에 묻는다(0.16초 멈추면, 같은 글자는 다시 묻지 않음). 받는 동안 같은 틀의 자리표시
 * - 회원이 아니면(api 없음) 멤버 묶음 대신 '로그인하면 멤버 전적을 볼 수 있어요' 한 줄
 */
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { CHAMPION_LIST, LISTED_AUGMENTS, RARITY_KO, ROLE_KO, initials, shortNick, type Api } from '@prism/core';
import { AugImg, ChampImg, MemberFace, PendingChip } from './basics';
import { Icon } from './icons';

export type SearchKind = 'member' | 'champ' | 'augment';
type MemberHit = { id: string; nick: string; skin: number | null; main: number | null; pending?: boolean; n?: number; w?: number };
type Row = { kind: SearchKind; key: string; id: string; label: string; meta?: ReactNode; icon: ReactNode; tag?: ReactNode; sub?: string };
type Recent = { kind: SearchKind; id: string; label: string; ts: number };

const RECENT_KEY = 'prism-search-recent';
const KIND_KO: Record<SearchKind, string> = { member: '멤버', champ: '챔프', augment: '증강' };
const readRecent = (): Recent[] => { try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(v) ? v.slice(0, 8) : []; } catch { return []; } };
const writeRecent = (list: Recent[]) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 8))); } catch { /* 저장 못 하면 이번만 */ } };

/** 맞은 글자 강조 (초성으로 맞은 것은 강조 없이) */
function Mark({ text, q }: { text: string; q: string }) {
  const t = q.trim();
  const i = t ? text.toLowerCase().indexOf(t.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + t.length)}</mark>{text.slice(i + t.length)}</>;
}

const norm = (s: string) => s.replace(/\s/g, '').toLowerCase();
/** 0 = 앞에서부터 맞음, 1 = 중간에 맞음, 2 = 초성이 앞에서부터, 3 = 초성이 중간에, -1 = 안 맞음 */
function rank(name: string, q: string) {
  const n = norm(name), t = norm(q);
  if (!t) return -1;
  if (n.startsWith(t)) return 0;
  if (n.includes(t)) return 1;
  const ini = initials(n);
  if (ini.startsWith(t)) return 2;
  if (ini.includes(t)) return 3;
  return -1;
}

export function OmniSearch({ api, scopes, onOpen, variant = 'bar', placeholder, hotkey, onLogin, quick }: {
  /** 회원이면 서버 주소. 없으면 멤버 묶음은 로그인 안내 */
  api?: Api | null;
  scopes: SearchKind[];
  onOpen: (kind: SearchKind, id: string) => void;
  variant?: 'hero' | 'bar';
  placeholder?: string;
  /** '/' 를 누르면 이 칸으로 */
  hotkey?: boolean;
  onLogin?: () => void;
  /** 비어 있을 때 보여 줄 바로가기 (챔프 번호) */
  quick?: number[];
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [members, setMembers] = useState<MemberHit[] | null>(null);
  const [recent, setRecent] = useState<Recent[]>(readRecent);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const cache = useRef(new Map<string, MemberHit[]>());
  const seq = useRef(0);
  const uid = useId();
  const t = q.trim();
  const wantMembers = scopes.includes('member') && Boolean(api);

  // 멤버: 0.16초 멈추면 묻는다, 같은 글자는 담아 둔 것
  useEffect(() => {
    if (!wantMembers || !t) { setMembers(null); return; }
    const hit = cache.current.get(t);
    if (hit) { setMembers(hit); return; }
    setMembers(null);
    const n = ++seq.current;
    const h = window.setTimeout(() => {
      api!.get<{ members: MemberHit[] }>(`/api/members/search?q=${encodeURIComponent(t)}`)
        .then((r) => { cache.current.set(t, r.members); if (n === seq.current) setMembers(r.members); })
        .catch(() => { if (n === seq.current) setMembers([]); });
    }, 160);
    return () => window.clearTimeout(h);
  }, [t, wantMembers, api]);

  // 바깥을 누르면 닫힘 · '/' 로 열기
  useEffect(() => {
    const out = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => {
      if (!hotkey || e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      e.preventDefault(); input.current?.focus();
    };
    document.addEventListener('pointerdown', out);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', out); document.removeEventListener('keydown', key); };
  }, [hotkey]);

  const champRows = useMemo<Row[]>(() => !t || !scopes.includes('champ') ? [] : CHAMPION_LIST
    .map((c) => ({ c, r: Math.min(...[c.name, ...(c.alias ? [c.alias] : [])].map((n) => { const x = rank(n, t); return x < 0 ? 9 : x; })) }))
    .filter((x) => x.r < 9).sort((a, b) => a.r - b.r || a.c.name.localeCompare(b.c.name, 'ko')).slice(0, 5)
    .map(({ c }) => ({ kind: 'champ' as const, key: `c${c.id}`, id: String(c.id), label: c.name, icon: <ChampImg id={c.id} size={36} />, sub: ROLE_KO[c.roles[0]] ?? '' })), [t, scopes]);

  const augRows = useMemo<Row[]>(() => !t || !scopes.includes('augment') ? [] : LISTED_AUGMENTS
    .map((a) => ({ a, r: rank(a.name, t) })).filter((x) => x.r >= 0).sort((x, y) => x.r - y.r || x.a.name.localeCompare(y.a.name, 'ko')).slice(0, 5)
    .map(({ a }) => ({ kind: 'augment' as const, key: `a${a.id}`, id: String(a.id), label: a.name, icon: <AugImg id={a.id} size={36} />,
      tag: <span className={`os-rar r-${a.rarity}`}>{RARITY_KO[a.rarity]}</span>, sub: a.note }))
  , [t, scopes]);

  const memberRows = useMemo<Row[]>(() => (members ?? []).map((m) => ({
    kind: 'member' as const, key: `m${m.id}`, id: m.id, label: shortNick(m.nick), icon: <MemberFace nick={m.nick} skin={m.skin} champion={m.main} size={36} />,
    meta: m.nick.includes('#') ? <small className="os-tag">#{m.nick.split('#')[1]}</small> : null,
    tag: m.pending ? <PendingChip /> : undefined,
    sub: m.n ? `${m.n.toLocaleString()}판 · 승률 ${Math.round(((m.w ?? 0) / m.n) * 100)}%` : '아직 기록된 판이 없어요',
  })), [members]);

  // 비어 있을 때: 최근 검색 + 바로가기
  const recentRows = useMemo<Row[]>(() => t ? [] : recent.filter((r) => scopes.includes(r.kind)).slice(0, 5).map((r) => ({
    kind: r.kind, key: `r${r.kind}${r.id}`, id: r.id, label: r.label, sub: KIND_KO[r.kind],
    icon: r.kind === 'champ' ? <ChampImg id={Number(r.id)} size={36} /> : r.kind === 'augment' ? <AugImg id={Number(r.id)} size={36} /> : <span className="os-ico"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M8 4.6V8l2.2 1.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg></span>,
  })), [t, recent, scopes]);
  const quickRows = useMemo<Row[]>(() => t || !quick?.length ? [] : quick.map((id) => CHAMPION_LIST.find((c) => c.id === id)).filter(Boolean).slice(0, 6).map((c) => ({
    kind: 'champ' as const, key: `q${c!.id}`, id: String(c!.id), label: c!.name, icon: <ChampImg id={c!.id} size={36} />, sub: ROLE_KO[c!.roles[0]] ?? '' })), [t, quick]);

  type Group = { kind: string; title: string; rows: Row[]; loading?: boolean; note?: ReactNode; action?: ReactNode };
  const groups: Group[] = [];
  if (!t) {
    if (recentRows.length) groups.push({ kind: 'recent', title: '최근 검색', rows: recentRows, action: <button type="button" className="os-clear" onClick={() => { writeRecent([]); setRecent([]); }}>모두 지우기</button> });
    if (quickRows.length) groups.push({ kind: 'quick', title: '많이 찾는 챔프', rows: quickRows });
  } else {
    if (scopes.includes('member')) {
      if (!api) groups.push({ kind: 'member', title: '멤버', rows: [], note: <span className="os-note"><Icon name="lock" />멤버 전적은 Prism 회원에게 열려요{onLogin && <button type="button" className="os-link" onClick={onLogin}>로그인</button>}</span> });
      else groups.push({ kind: 'member', title: '멤버', rows: memberRows, loading: members === null });
    }
    if (champRows.length) groups.push({ kind: 'champ', title: '챔프', rows: champRows });
    if (augRows.length) groups.push({ kind: 'augment', title: '증강', rows: augRows });
  }
  const flat = groups.flatMap((g) => g.rows);
  const nothing = Boolean(t) && !groups.some((g) => g.rows.length || g.loading || g.note);
  const memberEmpty = Boolean(t) && wantMembers && members !== null && !members.length;
  const showPanel = open && (groups.length > 0 || nothing);

  useEffect(() => { setHi(0); }, [t]);
  // 키보드로 고른 줄이 칸 밖이면 보이게
  useEffect(() => { list.current?.querySelector<HTMLElement>(`[data-i="${hi}"]`)?.scrollIntoView({ block: 'nearest' }); }, [hi]);

  const go = (r: Row) => {
    const next = [{ kind: r.kind, id: r.id, label: r.label, ts: Date.now() }, ...recent.filter((x) => !(x.kind === r.kind && x.id === r.id))].slice(0, 8);
    writeRecent(next); setRecent(next);
    setOpen(false); setQ(''); input.current?.blur();
    onOpen(r.kind, r.id);
  };
  const drop = (r: Row) => { const next = recent.filter((x) => !(x.kind === r.kind && x.id === r.id)); writeRecent(next); setRecent(next); };

  let i = -1;
  return (
    <div className={`omni os-v-${variant}${open ? ' open' : ''}`} ref={box}>
      <label className="os-in">
        <Icon name="search" />
        <input ref={input} value={q} placeholder={placeholder ?? (scopes.length === 1 && scopes[0] === 'member' ? '멤버 이름으로 전적 찾기' : '멤버 · 챔프 · 증강 검색')}
          aria-label="검색" role="combobox" aria-expanded={showPanel} aria-controls={`${uid}-list`} aria-autocomplete="list"
          aria-activedescendant={showPanel && flat[hi] ? `${uid}-${hi}` : undefined} autoComplete="off" spellCheck={false}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { if (q) setQ(''); else { setOpen(false); input.current?.blur(); } return; }
            if (!flat.length) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((x) => (x + 1) % flat.length); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((x) => (x - 1 + flat.length) % flat.length); }
            else if (e.key === 'Enter') { e.preventDefault(); if (flat[hi]) go(flat[hi]); }
          }} />
        {q ? <button type="button" className="os-x" aria-label="지우기" onClick={() => { setQ(''); input.current?.focus(); }}><Icon name="x" /></button>
          : hotkey && <kbd className="os-kbd" aria-hidden="true">/</kbd>}
      </label>
      {showPanel && (
        <div className="os-pop" role="listbox" id={`${uid}-list`} ref={list}>
          {nothing && <div className="os-empty"><b>'{t}'에 맞는 결과가 없어요</b><span>이름 일부나 초성(예: ㅇㄹ)으로도 찾을 수 있어요</span></div>}
          {groups.map((g) => (
            <section key={g.kind} className="os-group" aria-label={g.title}>
              <div className="os-gh"><span>{g.title}</span>{g.rows.length > 0 && t ? <small>{g.rows.length}</small> : null}{g.action}</div>
              {g.note}
              {g.loading && [0, 1].map((k) => <div key={k} className="os-row sk-row" aria-hidden="true"><i className="os-sk av" /><span className="os-txt"><i className="os-sk" style={{ width: 112 }} /><i className="os-sk" style={{ width: 72 }} /></span></div>)}
              {g.kind === 'member' && memberEmpty && <div className="os-none">'{t}'에 맞는 멤버가 없어요</div>}
              {g.rows.map((r) => { i++; const n = i; return (
                <div key={r.key} id={`${uid}-${n}`} data-i={n} role="option" aria-selected={n === hi} className={`os-row${n === hi ? ' on' : ''}`}
                  onPointerMove={() => n !== hi && setHi(n)} onClick={() => go(r)}>
                  {r.icon}
                  <span className="os-txt">
                    <span className="os-name"><b><Mark text={r.label} q={t} /></b>{r.meta}{r.tag}</span>
                    {r.sub && <small className="os-sub">{r.sub}</small>}
                  </span>
                  {g.kind === 'recent'
                    ? <button type="button" className="os-del" aria-label={`${r.label} 최근 검색에서 지우기`} onClick={(e) => { e.stopPropagation(); drop(r); }}><Icon name="x" /></button>
                    : <span className="os-go" aria-hidden="true"><Icon name="chevR" /></span>}
                </div>
              ); })}
            </section>
          ))}
          {flat.length > 0 && <div className="os-foot" aria-hidden="true"><span><kbd>↑</kbd><kbd>↓</kbd>이동</span><span><kbd>Enter</kbd>열기</span><span><kbd>Esc</kbd>닫기</span></div>}
        </div>
      )}
    </div>
  );
}
