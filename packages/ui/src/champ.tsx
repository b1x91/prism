import { useMemo, useState, type ReactNode } from 'react';
import { CHAMPIONS, CHAMPION_LIST, ROLE_KO, cdragon, matchName } from '@prism/core';
import { ChampImg } from './basics';
import { Icon } from './icons';

/** 이름·초성으로 챔피언 찾기 (위아래 키, Enter) */
export function ChampSearch({ onPick, placeholder = "챔피언 이름 (예: '아리' 혹은 'ㅇㄹ')", autoFocus }: { onPick: (id: number) => void; placeholder?: string; autoFocus?: boolean }) {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const hits = useMemo(() => (q.trim() ? CHAMPION_LIST.filter((c) => matchName(c.name, q)).slice(0, 6) : []), [q]);
  const pick = (id: number) => { setQ(''); onPick(id); };
  return (
    <div className="csearch">
      <Icon name="search" />
      <input className="input" value={q} autoFocus={autoFocus} placeholder={placeholder} autoComplete="off"
        onChange={(e) => { setQ(e.target.value); setIdx(0); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { setIdx((i) => Math.min(i + 1, hits.length - 1)); e.preventDefault(); }
          else if (e.key === 'ArrowUp') { setIdx((i) => Math.max(i - 1, 0)); e.preventDefault(); }
          else if (e.key === 'Enter' && hits[idx]) pick(hits[idx].id);
          else if (e.key === 'Escape') setQ('');
        }} />
      {hits.length > 0 && (
        <div className="suggest">
          {hits.map((c, i) => (
            <button key={c.id} type="button" className={i === idx ? 'on' : ''} onMouseEnter={() => setIdx(i)} onClick={() => pick(c.id)}>
              <ChampImg id={c.id} size={32} />{c.name}<span className="meta">{ROLE_KO[c.roles[0]] ?? ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ChampGrid({ onPick, query = '' }: { onPick: (id: number) => void; query?: string }) {
  const list = CHAMPION_LIST.filter((c) => matchName(c.name, query));
  return (
    <div className="champ-grid">
      {list.map((c) => <button key={c.id} type="button" onClick={() => onPick(c.id)}><ChampImg id={c.id} size={64} />{c.name}</button>)}
    </div>
  );
}

/** 챔피언 일러스트 배너 */
export function ChampBanner({ id, eyebrow, actions, children }: { id: number; eyebrow?: string; actions?: ReactNode; children?: ReactNode }) {
  const c = CHAMPIONS[id];
  if (!c) return null;
  const tags = [ROLE_KO[c.roles[0]], c.roles[1] && ROLE_KO[c.roles[1]], c.damage === 'MIX' ? 'AP·AD' : c.damage, c.range === 'ranged' ? '원거리' : '근접'].filter(Boolean) as string[];
  return (
    <div className="banner">
      <img className="bg" alt="" src={cdragon(c.splash)} />
      {actions && <div className="actions">{actions}</div>}
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{c.name}</h1>
        <div className="row wrapr" style={{ gap: 8 }}>{tags.map((t) => <span key={t} className="pill dark">{t}</span>)}</div>
        {children}
      </div>
    </div>
  );
}
