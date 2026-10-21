import { SplashSwap } from './splash';
import { useKept } from './kept';
import { useMemo, useState, type ReactNode } from 'react';
import { CHAMPIONS, CHAMPION_LIST, ROLE_KO, cdragon, matchName } from '@prism/core';
import { ChampImg } from './basics';
import { FavMark, FavStar, useFavs } from './favs';
import { HeartIcon } from './likeheart';
import { ToolSearch } from './ltools';
import { Icon } from './icons';
import { imgIn } from './skeleton';

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

export const ROLE_DOT: Record<string, string> = { marksman: 'var(--spectrum-1)', fighter: 'var(--spectrum-2)', tank: 'var(--spectrum-4)', support: 'var(--spectrum-5)', mage: 'var(--spectrum-6)', assassin: 'var(--spectrum-7)' };

/** 챔피언 목록: 붙는 도구 줄(검색·역할·내 챔프) + 내 챔프 줄 + 전체 격자. record 가 있으면 내 판수·승률 (앱) */
export function ChampGrid({ onPick, query = '', onQuery, record }: { onPick: (id: number) => void; query?: string; onQuery?: (q: string) => void; record?: Record<number, { n: number; w: number }> }) {
  // 거르기는 챔프 상세에 다녀와도 그대로 (v3.102)
  const [role, setRole] = useKept<string>('champ.role', 'all');
  const [mine, setMine] = useKept('champ.mine', false);
  const [fav, setFav] = useKept('champ.fav', false);
  const favs = useFavs();
  const list = CHAMPION_LIST.filter((c) => matchName(c.name, query) && (role === 'all' || c.roles.includes(role)) && (!mine || record?.[c.id]) && (!fav || favs.champs.includes(c.id)));
  // 아무것도 거르지 않았을 때만 위에 '내 챔프' 줄
  const showFavs = favs.champs.length > 0 && !query && role === 'all' && !mine && !fav;
  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="ltools">
        {onQuery && <ToolSearch value={query} onChange={onQuery} label="챔프 검색" placeholder="챔프 이름 (예: 아리, ㅇㄹ)" />}
        <div className="ltools-chips">
          {/* 아무것도 고르지 않으면 전체. 고른 것을 다시 누르면 풀린다 */}
          {ROLES.map((r) => <button key={r} type="button" aria-pressed={role === r} className={`chip ${role === r ? 'on' : ''}`} onClick={() => setRole(role === r ? 'all' : r)}><i className="role-dot" style={{ background: ROLE_DOT[r] }} />{ROLE_KO[r]}</button>)}
          {favs.connected && <button type="button" aria-pressed={fav} className={`chip ${fav ? 'on' : ''}`} onClick={() => setFav(!fav)}><HeartIcon size={13} />내 챔프<small>{favs.champs.length}</small></button>}
          {record && <button type="button" aria-pressed={mine} className={`chip ${mine ? 'on' : ''}`} onClick={() => setMine(!mine)}>해 본 챔프</button>}
        </div>
        <span className="ltools-cnt"><b>{list.length}</b> 챔프</span>
      </div>
      {showFavs && <section className="cfav">
        <div className="cfav-h"><HeartIcon size={16} /><h3>내 챔프</h3></div>
        <div className="cfav-row">{favs.champs.filter((id) => CHAMPIONS[id]).map((id) => {
          const r = record?.[id];
          return (
            <button key={id} type="button" className="cfav-card" onClick={() => onPick(id)}>
              <img className="fi" {...imgIn} src={cdragon(CHAMPIONS[id].splash)} alt="" loading="lazy" />
              <span className="cfav-txt"><b>{CHAMPIONS[id].name}</b><small>{ROLE_KO[CHAMPIONS[id].roles[0]]}{r ? ` · ${r.n}판 ${Math.round((r.w / r.n) * 100)}%` : ''}</small></span>
            </button>
          );
        })}</div>
      </section>}
      <div className="champ-grid">
        {list.map((c) => {
          const r = record?.[c.id];
          return (
            <button key={c.id} type="button" className={record && !r ? 'unmet' : ''} onClick={() => onPick(c.id)}>
              <span className="cg-pic"><ChampImg id={c.id} size={64} /><FavMark kind="champ" id={c.id} />{r && <span className={`cg-rec ${r.w / r.n >= 0.5 ? 'w' : 'l'}`}>{Math.round((r.w / r.n) * 100)}%</span>}</span>
              <span className="cg-nm">{c.name}</span>
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
export function ChampBanner({ id, eyebrow, actions, foot, children }: { id: number; eyebrow?: string; actions?: ReactNode; foot?: ReactNode; children?: ReactNode }) {
  const c = CHAMPIONS[id];
  if (!c) return null;
  const tags = [ROLE_KO[c.roles[0]], c.roles[1] && ROLE_KO[c.roles[1]], c.damage === 'MIX' ? 'AP·AD' : c.damage, c.range === 'ranged' ? '원거리' : '근접'].filter(Boolean) as string[];
  return (
    <div className="banner">
      <SplashSwap className="bg" src={cdragon(c.splash)} />
      {/* 오른쪽 위 구석: 좋아요 + 페이지 버튼 */}
      <div className="actions"><FavStar kind="champ" id={id} />{actions}</div>
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{c.name}</h1>
        <div className="row wrapr" style={{ gap: 8 }}>{tags.map((t) => <span key={t} className="pill dark">{t}</span>)}</div>
        {children}
      </div>
      {foot && <div className="banner-foot">{foot}</div>}
    </div>
  );
}
