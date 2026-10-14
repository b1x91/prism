/**
 * 한 판 카드: 승패 색, 챔피언 일러스트, KDA, 증강(등급 테두리), 아이템 6칸, 피해량·골드.
 * 앱의 최근 판과 회원 페이지가 함께 쓴다.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { AUGMENT, CHAMPIONS, ITEM, ago, cdragon, loadItemDetail, reviewMatch, type ItemDetail, type MatchDetail, type MatchPlayer } from '@prism/core';
import { ChampImg, Empty, Hover, MemberFace } from './basics';
import { AugRing, AugmentLink } from './augment';
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

export function GameCard({ g, onOpen }: { g: CardGame; onOpen?: (g: CardGame) => void }) {
  const c = CHAMPIONS[g.championId];
  const ratio = g.deaths ? ((g.kills + g.assists) / g.deaths).toFixed(2) : 'Perfect';
  const items = [...(g.items ?? [])].slice(0, 6);
  while (items.length < 6) items.push(0);
  return (
    <article className={`gcard ${g.win ? 'win' : 'lose'} ${onOpen ? 'can-open' : ''}`} onClick={onOpen ? () => onOpen(g) : undefined}
      role={onOpen ? 'button' : undefined} tabIndex={onOpen ? 0 : undefined} aria-label={onOpen ? `${CHAMPIONS[g.championId]?.name ?? ''} ${g.win ? '승리' : '패배'} 판 자세히` : undefined}
      onKeyDown={onOpen ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(g); } } : undefined}>
      {c?.tile && <img className="gbg" src={cdragon(c.tile)} alt="" loading="lazy" />}
      <div className="gchamp">
        <ChampImg id={g.championId} size={56} />
        <span className="gname"><b>{c?.name ?? `#${g.championId}`}</b><span className="gsub"><span className={`gres ${g.win ? 'w' : 'l'}`}>{g.win ? '승리' : '패배'}</span>{g.custom && <span className="gtag">사용자 설정</span>}</span></span>
      </div>
      <div className="gkda">
        <b>{g.kills}<i>/</i><span className="l">{g.deaths}</span><i>/</i>{g.assists}</b>
        <span className={`gratio ${ratio === 'Perfect' || Number(ratio) >= 4 ? 'hot' : ''}`}>{ratio} KDA</span>
      </div>
      <div className="gaugs">
        {g.augments.length ? g.augments.slice(0, 6).map((a, i) => {
          const x = AUGMENT[a];
          return <AugmentLink key={`${a}-${i}`} id={a} champion={g.championId} className="gaug"><AugRing id={a} size={26} /><span>{x?.name ?? `#${a}`}</span></AugmentLink>;
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

export function GameList({ games, onOpen, limit = 12 }: { games: CardGame[]; onOpen?: (g: CardGame) => void; limit?: number }) {
  return <div className="glist">{games.slice(0, limit).map((g) => <GameCard key={g.gameId} g={g} onOpen={onOpen} />)}</div>;
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
      {g.augments.length > 0 && <div className="gtip-augs">{g.augments.slice(0, 6).map((a, i) => <span key={`${a}-${i}`} className="gaug"><AugRing id={a} size={22} /><span>{AUGMENT[a]?.name ?? `#${a}`}</span></span>)}</div>}
      {items.length > 0 && <div className="gtip-items">{items.slice(0, 6).map((x, i) => <img key={i} src={cdragon(ITEM[x].icon)} alt={ITEM[x].name} />)}</div>}
    </div>
  );
}

export function RecentGames({ games, onChampion, limit = 12, title = '최근 판' }: { games: CardGame[]; onChampion?: (id: number) => void; limit?: number; title?: string }) {
  const [open, setOpen] = useState(readOpen);
  const [match, setMatch] = useState<CardGame | null>(null);
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
        ? <div className="rbody" key="open"><GameList games={games} onOpen={setMatch} limit={limit} /></div>
        : <div className="rstrip rbody" key="strip">{ten.map((g) => {
          const c = CHAMPIONS[g.championId];
          return (
            <Hover key={g.gameId} tip={<GameTip g={g} />} className={`rcard ${g.win ? 'is-w' : 'is-l'}`}>
              <button type="button" onClick={() => setMatch(g)} aria-label={`${c?.name} ${g.win ? '승리' : '패배'} 판 자세히`}>
                <img src={cdragon(c?.tile)} alt="" loading="lazy" />
                <span className="res">{g.win ? '승' : '패'}</span>
                <span className="kda">{g.kills}/{g.deaths}/{g.assists}</span>
              </button>
            </Hover>
          );
        })}</div>}
      {match && <MatchDialog g={match} onClose={() => setMatch(null)} onChampion={onChampion} />}
    </section>
  );
}

// ───────── 한 판 상세 (카드를 누르면) ─────────

/** 한 판 상세를 어디서 가져올지 (웹: 서버, 앱: 서버 + 롤 클라이언트). 없으면 카드의 내 기록만 */
export const MatchSource = createContext<((gameId: number) => Promise<MatchDetail | null>) | null>(null);
/** 10명 전체가 없을 때 덧붙일 안내 (앱만: 롤을 켜 두면 볼 수 있다) */
export const MatchNote = createContext<string | null>(null);

const when = (t: number) => { const d = new Date(t); return `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const kda = (p: { kills: number; deaths: number; assists: number }) => (p.deaths ? ((p.kills + p.assists) / p.deaths).toFixed(2) : 'Perfect');

/** 카드에 있는 내 기록만으로 만든 상세 (서버에도 클라이언트에도 없을 때) */
function fromCard(g: CardGame): MatchDetail {
  return { gameId: g.gameId, playedAt: g.playedAt, duration: g.duration, custom: Boolean(g.custom), full: false, teams: {},
    players: [{ name: null, championId: g.championId, teamId: 0, win: g.win, kills: g.kills, deaths: g.deaths, assists: g.assists, damageToChampions: g.damageToChampions ?? null, damageTaken: null, goldEarned: g.goldEarned ?? null, items: g.items ?? [], augments: g.augments }] };
}

export function MatchDialog({ g, onClose, onChampion }: { g: CardGame; onClose: () => void; onChampion?: (id: number) => void }) {
  const source = useContext(MatchSource);
  const note = useContext(MatchNote);
  const [m, setM] = useState<MatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let on = true;
    setLoading(true);
    (source ? source(g.gameId).catch(() => null) : Promise.resolve(null)).then((x) => { if (on) { setM(x && x.players.length ? x : fromCard(g)); setLoading(false); } });
    return () => { on = false; };
  }, [g, source]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', esc);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { removeEventListener('keydown', esc); document.body.style.overflow = prev; };
  }, [onClose]);
  const isMe = (p: MatchPlayer) => p.championId === g.championId && p.win === g.win;
  const mine = m?.players.find(isMe);
  const myTeam = mine?.teamId ?? 0;
  const teamIds = m ? [...new Set(m.players.map((p) => p.teamId))].sort((a, b) => Number(b === myTeam) - Number(a === myTeam) || a - b) : [];
  const maxDmg = Math.max(1, ...(m?.players.map((p) => p.damageToChampions ?? 0) ?? [1]));
  const kills = (t: number) => m?.teams[t]?.kills ?? (m?.full ? m.players.filter((p) => p.teamId === t).reduce((s, p) => s + p.kills, 0) : null);
  const other = teamIds.find((t) => t !== myTeam);
  const c = CHAMPIONS[g.championId];
  return (
    <div className="md-wrap" role="dialog" aria-modal="true" aria-label="판 자세히">
      <button type="button" className="md-scrim" aria-label="닫기" onClick={onClose} />
      <div className={`md ${g.win ? 'win' : 'lose'}`}>
        <div className="md-head">
          {c?.splash && <img className="md-bg" src={cdragon(c.splash)} alt="" />}
          <div className="md-title">
            <span className={`md-res ${g.win ? 'w' : 'l'}`}>{g.win ? '승리' : '패배'}</span>
            <span className="md-sub">{g.custom ? '사용자 설정' : '아수라장'} · {Math.round(g.duration / 60)}분 · {when(g.playedAt)}</span>
          </div>
          {other !== undefined && kills(myTeam) !== null && kills(other) !== null && <div className="md-score"><b className={g.win ? 'w' : 'l'}>{kills(myTeam)}</b><span>:</span><b>{kills(other)}</b><small>킬</small></div>}
          <button type="button" className="icon-btn md-x" aria-label="닫기" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="md-body">
          {m && !loading && <Lessons m={m} g={g} />}
          {loading ? <MatchSkeleton /> : m && teamIds.map((t) => {
            const list = m.players.filter((p) => p.teamId === t).sort((a, b) => Number(isMe(b)) - Number(isMe(a)) || (b.damageToChampions ?? 0) - (a.damageToChampions ?? 0));
            const win = list[0]?.win;
            return (
              <section key={t} className={`md-team ${win ? 'w' : 'l'}`}>
                <div className="md-th"><b>{m.full ? (t === myTeam ? '우리 팀' : '상대 팀') : m.players.length === 1 ? '내 기록' : t === myTeam ? '함께한 Prism 회원' : '상대 팀의 Prism 회원'}</b><span className={win ? 'w' : 'l'}>{win ? '승리' : '패배'}</span></div>
                {list.map((p, i) => (
                  <div key={`${p.championId}-${i}`} className={`md-row ${isMe(p) ? 'me' : ''}`}>
                    <button type="button" className="md-champ" onClick={() => onChampion?.(p.championId)} disabled={!onChampion} title={CHAMPIONS[p.championId]?.name}><ChampImg id={p.championId} size={36} /></button>
                    <span className="md-who">
                      <b>{p.memberId ? <><MemberFace nick={p.nick ?? '?'} skin={p.skin} champion={p.main} size={16} />{p.nick}</> : (p.name ?? (isMe(p) ? '나' : '플레이어'))}</b>
                      <small>{CHAMPIONS[p.championId]?.name}</small>
                    </span>
                    <span className="md-kda"><b>{p.kills}/<span className="l">{p.deaths}</span>/{p.assists}</b><small>{kda(p)} KDA</small></span>
                    <span className="md-dmg">{p.damageToChampions != null ? <><span className="v">{(p.damageToChampions / 1000).toFixed(1)}k</span><span className="bar"><span style={{ width: `${(p.damageToChampions / maxDmg) * 100}%` }} /></span></> : <span className="meta">-</span>}</span>
                    <span className="md-items">{[...p.items.slice(0, 6), ...Array(Math.max(0, 6 - p.items.length)).fill(0)].map((id, j) => id ? <ItemIcon key={j} id={id} /> : <span key={j} className="item-empty" />)}</span>
                    <span className="md-augs">{p.augments.slice(0, 6).map((a, j) => <AugmentLink key={`${a}-${j}`} id={a} champion={p.championId} inline><AugRing id={a} size={24} /></AugmentLink>)}</span>
                  </div>
                ))}
              </section>
            );
          })}
          {m && !m.full && !loading && <p className="meta md-note">{m.players.length > 1 ? '함께한 Prism 회원의 기록이에요.' : '이 판은 내 기록만 있어요.'}{note ? ` ${note}` : ''}</p>}
        </div>
      </div>
    </div>
  );
}

/** 판 상세를 불러오는 동안: 실제 모양대로 자리를 잡아 두고 빛이 지나간다 (창 크기가 바뀌지 않게) */
function MatchSkeleton() {
  const row = (k: number) => <div key={k} className="md-row sk-row"><i className="sk sq" /><i className="sk ln" /><i className="sk ln s" /><i className="sk ln" /><i className="sk ln w" /></div>;
  return (
    <div className="md-skel" aria-label="불러오는 중" role="status">
      <section className="md-lessons"><i className="sk ln t" />{[0, 1, 2].map((k) => <div key={k} className="sk-l"><i className="sk dot" /><i className="sk ln" /></div>)}</section>
      {[0, 1].map((t) => <section key={t} className="md-team"><i className="sk ln t" />{[0, 1, 2, 3, 4].map(row)}</section>)}
    </div>
  );
}

/** 이 판에서 배울 점: 조합에 비춘 아이템·증강 복기 */
function Lessons({ m, g }: { m: MatchDetail; g: CardGame }) {
  const items = useItemDetail(true);
  const r = reviewMatch(m, { championId: g.championId, win: g.win }, items);
  if (!r.known) return <section className="md-lessons"><div className="md-th"><b>이 판에서 배울 점</b><span className="meta">상대 조합을 알 수 있는 판에서 보여 드려요.</span></div></section>;
  return (
    <section className="md-lessons">
      <div className="md-th"><b>이 판에서 배울 점</b><span className="meta">이번 판 조합에 비춘 아이템·증강</span></div>
      {r.lessons.length ? r.lessons.map((l, i) => (
        <div key={i} className={`mdl ${l.kind}`}>
          <span className="mdl-i" aria-hidden="true">{l.kind === 'good' ? <Icon name="check" /> : '▸'}</span>
          <div className="mdl-t">
            <b>{l.title}</b>
            {l.detail && <span>{l.detail}</span>}
            {(l.augments?.length || l.items?.length) ? <span className="mdl-x">
              {l.items?.map((id) => <ItemIcon key={id} id={id} size={24} />)}
              {l.augments?.map((id) => <AugmentLink key={id} id={id} champion={g.championId} inline className="mdl-aug"><AugRing id={id} size={24} /><span>{AUGMENT[id]?.name}</span></AugmentLink>)}
            </span> : null}
          </div>
        </div>
      )) : <div className="mdl good"><span className="mdl-i" aria-hidden="true"><Icon name="check" /></span><div className="mdl-t"><b>조합에 맞게 잘 챙겼어요</b><span>눈에 띄게 아쉬운 아이템·증강이 없어요.</span></div></div>}
    </section>
  );
}
