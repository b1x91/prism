import { useMemo, useState, type ReactNode } from 'react';
import { CHAMPIONS, CHAMPION_LIST, ROLE_KO, cdragon, matchName } from '@prism/core';
import { ChampImg } from './basics';
import { FavMark, FavStar, useFavs } from './favs';
import { Icon } from './icons';

/** 이름·초성으로 챔피언 찾기 (위아래 키, Enter) */
export function ChampSearch({ onPick, placeholder = "챔프 이름 (예: '아리' 혹은 'ㅇㄹ')", autoFocus }: { onPick: (id: number) => void; placeholder?: string; autoFocus?: boolean }) {
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

const ROLES = ['marksman', 'mage', 'assassin', 'fighter', 'tank', 'support'] as const;

/** 챔피언 목록: 역할로 거르기, record 가 있으면 내 판수·승률 표시 (앱) */
export function ChampGrid({ onPick, query = '', record }: { onPick: (id: number) => void; query?: string; record?: Record<number, { n: number; w: number }> }) {
  const [role, setRole] = useState<string>('all');
  const [mine, setMine] = useState(false);
  const [fav, setFav] = useState(false);
  const favs = useFavs();
  const list = CHAMPION_LIST.filter((c) => matchName(c.name, query) && (role === 'all' || c.roles.includes(role)) && (!mine || record?.[c.id]) && (!fav || favs.champs.includes(c.id)));
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="role-chips">
        {/* 아무것도 고르지 않으면 전체. 고른 것을 다시 누르면 풀린다 */}
        {ROLES.map((r) => <button key={r} type="button" aria-pressed={role === r} className={`chip ${role === r ? 'on' : ''}`} onClick={() => setRole(role === r ? 'all' : r)}>{ROLE_KO[r]}</button>)}
        {(record || favs.connected) && <span className="sp" />}
        {favs.connected && <button type="button" aria-pressed={fav} className={`chip ${fav ? 'on' : ''}`} onClick={() => setFav(!fav)}><Icon name="star" />내 챔프<small>{favs.champs.length}</small></button>}
        {record && <button type="button" aria-pressed={mine} className={`chip ${mine ? 'on' : ''}`} onClick={() => setMine(!mine)}>내가 해 본 챔프</button>}
      </div>
      <div className="champ-grid">
        {list.map((c) => {
          const r = record?.[c.id];
          return (
            <button key={c.id} type="button" className={record && !r ? 'unmet' : ''} onClick={() => onPick(c.id)}>
              <span className="cg-pic"><ChampImg id={c.id} size={64} /><FavMark kind="champ" id={c.id} />{r && <span className={`cg-rec ${r.w / r.n >= 0.5 ? 'w' : 'l'}`}>{Math.round((r.w / r.n) * 100)}%</span>}</span>
              {c.name}
              {r && <small className="meta">{r.n}판</small>}
            </button>
          );
        })}
        {!list.length && <p className="meta">찾는 챔프가 없어요</p>}
      </div>
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
        <h1>{c.name}<FavStar kind="champ" id={id} /></h1>
        <div className="row wrapr" style={{ gap: 8 }}>{tags.map((t) => <span key={t} className="pill dark">{t}</span>)}</div>
        {children}
      </div>
    </div>
  );
}
