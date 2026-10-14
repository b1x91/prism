/**
 * 한 판 카드: 승패 색, 챔피언 일러스트, KDA, 증강(등급 테두리), 아이템 6칸, 피해량·골드.
 * 앱의 최근 판과 회원 페이지가 함께 쓴다.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AUGMENT, CHAMPIONS, ITEM, RARITY_KO, ago, cdragon, loadItemDetail, type ItemDetail } from '@prism/core';
import { AugImg, ChampImg, Empty, Hover } from './basics';
import { AugmentLink } from './augment';
import { Icon } from './icons';

/** 아이템 능력치·효과는 처음 마우스를 올릴 때 한 번 불러온다 */
let details: Record<number, ItemDetail> | null = null;
function useItemDetail(on: boolean) {
  const [d, setD] = useState(details);
  useEffect(() => { if (on && !d) loadItemDetail().then((x) => { details = x; setD(x); }).catch(() => {}); }, [on, d]);
  return d;
}

function ItemTip({ id }: { id: number }) {
  const d = useItemDetail(true)?.[id];
  const it = ITEM[id];
  return (
    <div className="itip">
      <div className="itip-head"><img src={cdragon(it.icon)} alt="" /><div><b>{it.name}</b>{it.price > 0 && <small>{it.price.toLocaleString()} 골드</small>}</div></div>
      {d ? <>
        {d.stats.length > 0 && <ul className="itip-stats">{d.stats.map((x) => <li key={x}>{x}</li>)}</ul>}
        {d.effects.map(([n, t]) => <p key={n}><b>{n}</b> {t}</p>)}
      </> : <small className="meta">불러오는 중…</small>}
    </div>
  );
}

export function ItemIcon({ id, size = 28 }: { id: number; size?: number }) {
  if (!id || !ITEM[id]) return <span className="item-empty" style={{ width: size, height: size }} />;
  return <Hover tip={() => <ItemTip id={id} />} className="item-ic"><img src={cdragon(ITEM[id].icon)} width={size} height={size} alt={ITEM[id].name} loading="lazy" /></Hover>;
}

export type CardGame = {
  gameId: number; playedAt: number; duration: number; championId: number; win: boolean;
  kills: number; deaths: number; assists: number; augments: number[]; items?: number[];
  damageToChampions?: number | null; goldEarned?: number | null; custom?: boolean;
};

const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

export function GameCard({ g, onChampion }: { g: CardGame; onChampion?: (id: number) => void }) {
  const c = CHAMPIONS[g.championId];
  const ratio = g.deaths ? ((g.kills + g.assists) / g.deaths).toFixed(2) : 'Perfect';
  const items = [...(g.items ?? [])].slice(0, 6);
  while (items.length < 6) items.push(0);
  return (
    <article className={`gcard ${g.win ? 'win' : 'lose'}`}>
      {c?.tile && <img className="gbg" src={cdragon(c.tile)} alt="" loading="lazy" />}
      <button type="button" className="gchamp" onClick={() => onChampion?.(g.championId)} disabled={!onChampion}>
        <ChampImg id={g.championId} size={56} />
        <span className="gname"><b>{c?.name ?? `#${g.championId}`}</b><span className="gsub"><span className={`gres ${g.win ? 'w' : 'l'}`}>{g.win ? '승리' : '패배'}</span>{g.custom && <span className="gtag">사용자 설정</span>}</span></span>
      </button>
      <div className="gkda">
        <b>{g.kills}<i>/</i><span className="l">{g.deaths}</span><i>/</i>{g.assists}</b>
        <span className={`gratio ${ratio === 'Perfect' || Number(ratio) >= 4 ? 'hot' : ''}`}>{ratio} KDA</span>
      </div>
      <div className="gaugs">
        {g.augments.length ? g.augments.slice(0, 6).map((a, i) => {
          const x = AUGMENT[a];
          return <AugmentLink key={`${a}-${i}`} id={a} champion={g.championId} className={`gaug ${x?.rarity ?? 'silver'}`}><AugImg id={a} size={24} /><span>{x?.name ?? `#${a}`}</span></AugmentLink>;
        }) : <span className="meta">증강 기록 없음</span>}
      </div>
      <div className="gitems">
        {items.map((id, i) => <ItemIcon key={i} id={id} />)}
      </div>
      <div className="gmeta">
        <span>{Math.round(g.duration / 60)}분 · {ago(g.playedAt)}</span>
        {(g.damageToChampions || g.goldEarned) ? <span className="meta">{g.damageToChampions ? `피해 ${k(g.damageToChampions)}` : ''}{g.damageToChampions && g.goldEarned ? ' · ' : ''}{g.goldEarned ? `골드 ${k(g.goldEarned)}` : ''}</span> : null}
      </div>
    </article>
  );
}

export function GameList({ games, onChampion, limit = 12 }: { games: CardGame[]; onChampion?: (id: number) => void; limit?: number }) {
  return <div className="glist">{games.slice(0, limit).map((g) => <GameCard key={g.gameId} g={g} onChampion={onChampion} />)}</div>;
}

// ───────── 최근 판: 접으면 카드 띠, 펼치면 자세히 ─────────

const KEY = 'prism-recent-open';
const readOpen = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };

/** 접힌 띠에서 챔피언에 마우스를 올리면 뜨는 요약 */
function GameTip({ g }: { g: CardGame }) {
  const c = CHAMPIONS[g.championId];
  const items = (g.items ?? []).filter((x) => x && ITEM[x]);
  return (
    <div className="gtip">
      <div className="gtip-head"><b>{c?.name}</b><span className={`gres ${g.win ? 'w' : 'l'}`}>{g.win ? '승리' : '패배'}</span>{g.custom && <span className="gtag">사용자 설정</span>}</div>
      <div className="gtip-line"><b>{g.kills} / <span className="l">{g.deaths}</span> / {g.assists}</b><span className="meta">{Math.round(g.duration / 60)}분 · {ago(g.playedAt)}</span></div>
      {g.augments.length > 0 && <div className="gtip-augs">{g.augments.slice(0, 6).map((a, i) => <span key={`${a}-${i}`} className={`gaug ${AUGMENT[a]?.rarity ?? 'silver'}`}><AugImg id={a} size={20} /><span>{AUGMENT[a]?.name ?? `#${a}`}</span></span>)}</div>}
      {items.length > 0 && <div className="gtip-items">{items.slice(0, 6).map((x, i) => <img key={i} src={cdragon(ITEM[x].icon)} alt={ITEM[x].name} />)}</div>}
    </div>
  );
}

export function RecentGames({ games, onChampion, limit = 12, title = '최근 판' }: { games: CardGame[]; onChampion?: (id: number) => void; limit?: number; title?: string }) {
  const [open, setOpen] = useState(readOpen);
  const toggle = () => { const v = !open; setOpen(v); try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* 저장소 없음 */ } };
  const ten = games.slice(0, 10), w = ten.filter((g) => g.win).length;
  return (
    <section className="card pad recent">
      <div className="card-head">
        <h2>{title}</h2>
        {ten.length > 0 && <span className="rsum"><b className="w">{w}승</b> <b className="l">{ten.length - w}패</b><span className="meta"> · 최근 {ten.length}판</span></span>}
        <span className="sp" />
        {games.length > 0 && <button type="button" className={`btn ghost sm rtoggle ${open ? 'on' : ''}`} onClick={toggle} aria-expanded={open}>{open ? '접기' : '자세히 보기'}<Icon name="arrow" /></button>}
      </div>
      {!games.length ? <Empty>아직 기록된 판이 없습니다. 첫 판이 끝나면 여기에 나타납니다.</Empty> : open
        ? <div className="rbody" key="open"><GameList games={games} onChampion={onChampion} limit={limit} /></div>
        : <div className="rstrip rbody" key="strip">{ten.map((g) => {
          const c = CHAMPIONS[g.championId];
          return (
            <Hover key={g.gameId} tip={<GameTip g={g} />} className={`rcard ${g.win ? 'is-w' : 'is-l'}`}>
              <button type="button" onClick={() => onChampion?.(g.championId)} disabled={!onChampion} aria-label={`${c?.name} ${g.win ? '승리' : '패배'}`}>
                <img src={cdragon(c?.tile)} alt="" loading="lazy" />
                <span className="res">{g.win ? '승' : '패'}</span>
                <span className="kda">{g.kills}/{g.deaths}/{g.assists}</span>
              </button>
            </Hover>
          );
        })}</div>}
    </section>
  );
}
