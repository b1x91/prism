/**
 * 한 판 카드: 승패 색, 챔피언 일러스트, KDA, 증강(등급 테두리), 아이템 6칸, 피해량·골드.
 * 앱의 최근 판과 회원 페이지가 함께 쓴다.
 */
import { AUGMENT, CHAMPIONS, ITEM, RARITY_KO, ago, cdragon } from '@prism/core';
import { AugImg, ChampImg } from './basics';

export type CardGame = {
  gameId: number; playedAt: number; duration: number; championId: number; win: boolean;
  kills: number; deaths: number; assists: number; augments: number[]; items?: number[];
  damageToChampions?: number | null; goldEarned?: number | null;
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
        <span className="gname"><b>{c?.name ?? `#${g.championId}`}</b><span className={`gres ${g.win ? 'w' : 'l'}`}>{g.win ? '승리' : '패배'}</span></span>
      </button>
      <div className="gkda">
        <b>{g.kills}<i>/</i><span className="l">{g.deaths}</span><i>/</i>{g.assists}</b>
        <span className={`gratio ${ratio === 'Perfect' || Number(ratio) >= 4 ? 'hot' : ''}`}>{ratio} KDA</span>
      </div>
      <div className="gaugs">
        {g.augments.length ? g.augments.slice(0, 6).map((a, i) => {
          const x = AUGMENT[a];
          return <span key={`${a}-${i}`} className={`gaug ${x?.rarity ?? 'silver'}`} title={x ? `${x.name} · ${RARITY_KO[x.rarity]}\n${x.note}` : `#${a}`}><AugImg id={a} size={24} /><span>{x?.name ?? `#${a}`}</span></span>;
        }) : <span className="meta">증강 기록 없음</span>}
      </div>
      <div className="gitems">
        {items.map((id, i) => (id && ITEM[id]
          ? <img key={i} src={cdragon(ITEM[id].icon)} alt={ITEM[id].name} title={ITEM[id].name} loading="lazy" />
          : <span key={i} className="empty" />))}
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
