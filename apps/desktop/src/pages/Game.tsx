import { useState } from 'react';
import { CHAMPIONS, ago, pct, streakOf } from '@prism/core';
import { AugmentCompare, AugmentGuide, ChampBanner, ChampSearch, Empty, GameList, Recent10, Seg } from '@prism/ui';
import { useNavigate } from 'react-router-dom';
import type { State } from '../controller';
import { ChampSelectPanel } from './ChampSelect';

/** 게임 중: Alt+Tab 하면 바로 보이는 내 챔피언 증강 가이드 + 3개 비교 */
function InGame({ championId }: { championId: number | null }) {
  const [tab, setTab] = useState<'compare' | 'guide'>('compare');
  const [pick, setPick] = useState<number | null>(null);
  const id = pick ?? championId;
  if (!id) return <section className="card pad"><Empty>이번 판 챔피언을 고르면 증강 가이드가 나옵니다.</Empty><ChampSearch onPick={setPick} /></section>;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <ChampBanner id={id} eyebrow="게임 중 · 증강 고를 때 Alt+Tab" actions={<button type="button" className="btn sm" onClick={() => setPick(null)}>{pick ? '내 챔피언으로' : '다른 챔피언'}</button>} />
      <div className="row"><Seg value={tab} options={[['compare', '뜬 증강 3개 비교'], ['guide', '등급별 가이드']]} onChange={setTab} /></div>
      {tab === 'compare' ? <AugmentCompare championId={id} /> : <AugmentGuide championId={id} compact={false} />}
    </div>
  );
}

export function GamePage({ s }: { s: State }) {
  const nav = useNavigate();
  if (s.status === 'in-game') return <InGame championId={s.lastChampion} />;
  const games = s.games, P = s.personal;
  const st = streakOf(games);
  return (
    <div className="stack" style={{ gap: 16 }}>
      {!s.champSelect && <h1 className="h1">내 아수라장</h1>}
      {s.champSelect && <ChampSelectPanel cs={s.champSelect} crew={s.crew} personal={P} />}
      {s.status === 'no-client' && <section className="card pad row" style={{ gap: 16 }}><div className="pulse" /><div><b>롤 클라이언트를 기다리는 중</b><div className="muted">클라이언트를 켜면 자동으로 연결됩니다. 챔프 선택에 들어가면 팀 구성과 어울리는 증강이 여기에 뜹니다.</div></div></section>}
      {s.status === 'error' && <section className="card pad"><b>클라이언트 연결 오류</b><div className="muted">{s.message}</div></section>}
      {games.length > 0 && <div className="grid4">
        <section className="card stat"><span className="k">아수라장 (최근 100판 중)</span><span className="v">{P.total.n}<small>판</small></span></section>
        <section className="card stat"><span className="k">승률</span><span className="v">{pct(P.total.w, P.total.n)}</span></section>
        <section className="card stat"><span className="k">지금</span><span className={`v ${st.win ? 'w' : 'l'}`}>{st.n}<small>{st.win ? '연승' : '연패'}</small></span></section>
        <section className="card stat"><span className="k">만난 챔피언</span><span className="v">{Object.keys(P.champions).length}<small>/ {Object.keys(CHAMPIONS).length}</small></span></section>
      </div>}
      <section className="card pad"><div className="card-head"><h2>최근 10판</h2></div><Recent10 games={games} /></section>
      {games.length > 0 && <section className="card pad"><div className="card-head"><h2>최근 판</h2><span className="sp" /><span className="meta">챔피언을 누르면 증강 가이드</span></div><GameList games={games} onChampion={(c) => nav(`/champions/${c}`)} /></section>}
    </div>
  );
}
