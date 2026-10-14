import { useState } from 'react';
import { AUGMENT, CHAMPIONS, ago, guideOf, pct, streakOf, todayPicks, type Personal } from '@prism/core';
import { AugRing, AugmentLink, TierBadge } from '@prism/ui';
import { GAME_DATA, fitPoints, tierOf } from '@prism/core';
import { AugmentCompare, AugmentGuide, ChampBanner, ChampSearch, Empty, MemberFace, RecentGames, Seg, partyTime, useParties } from '@prism/ui';
import { api } from '../bridge';
import { useNavigate } from 'react-router-dom';
import type { State } from '../controller';
import { ChampSelectPanel } from './ChampSelect';
import { useSeenAugments } from '../vision';

/** 게임 중: Alt+Tab 하면 바로 보이는 내 챔피언 증강 가이드 + 3개 비교 */
function InGame({ championId }: { championId: number | null }) {
  const [tab, setTab] = useState<'compare' | 'guide'>('compare');
  const [pick, setPick] = useState<number | null>(null);
  const seen = useSeenAugments();
  const id = pick ?? championId;
  if (!id) return <section className="card pad"><Empty>이번 판 챔피언을 고르면 증강 가이드가 나옵니다.</Empty><ChampSearch onPick={setPick} /></section>;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <ChampBanner id={id} eyebrow="게임 중 · 증강 고를 때 Alt+Tab" actions={<button type="button" className="btn sm" onClick={() => setPick(null)}>{pick ? '내 챔피언으로' : '다른 챔피언'}</button>} />
      <div className="row"><Seg value={tab} options={[['compare', '뜬 증강 3개 비교'], ['guide', '등급별 가이드']]} onChange={setTab} /></div>
      {tab === 'compare' ? <AugmentCompare championId={id} preset={seen.ids} /> : <AugmentGuide championId={id} compact={false} />}
    </div>
  );
}

/** 오늘은 이 챔피언 어때요? 내 기록으로 고른 챔피언 + 등급별로 잘 맞는 증강 */
function TodayPick({ personal }: { personal: Personal }) {
  const nav = useNavigate();
  const picks = todayPicks(personal, Object.keys(CHAMPIONS).map(Number));
  const [i, setI] = useState(0);
  if (!picks.length) return null;
  const pick = picks[i % picks.length];
  const rec = personal.champions[pick.id];
  const guide = guideOf(GAME_DATA, pick.id);
  const mine = personal.augmentsByChampion[pick.id] ?? [];
  const rows = guide ? (['prismatic', 'gold', 'silver'] as const).map((r) => [r, guide[r].slice(0, 2)] as const) : [];
  return (
    <section className="today">
      <ChampBanner id={pick.id} eyebrow={pick.why === 'best' ? '오늘은 이 챔피언 어때요? · 내 기록에서 가장 잘 이긴 챔피언' : '오늘은 이 챔피언 어때요? · 아직 만나지 못한 챔피언'}
        actions={<>{picks.length > 1 && <button type="button" className="btn sm" onClick={() => setI(i + 1)}>다른 추천</button>}<button type="button" className="btn sm primary" onClick={() => nav(`/champions/${pick.id}`)}>증강 가이드</button></>}>
        <p className="today-why">{rec ? <>내 기록 <b>{rec.n}판 {rec.w}승</b> ({pct(rec.w, rec.n)}). 주사위나 대기석에서 보이면 잡아보세요.</> : <>도감을 채울 기회예요. 주사위나 대기석에서 보이면 잡아보세요.</>}</p>
      </ChampBanner>
      <div className="today-augs">
        {rows.map(([r, list]) => (
          <div key={r} className="ta-col">
            <span className={`k ${r}`}>{r === 'prismatic' ? '프리즘' : r === 'gold' ? '골드' : '실버'}</span>
            {list.map((f) => (
              <AugmentLink key={f.id} id={f.id} champion={pick.id} className="ta-row"><AugRing id={f.id} size={36} /><span className="nm">{AUGMENT[f.id]?.name}</span><TierBadge tier={tierOf(fitPoints(f))} /></AugmentLink>
            ))}
          </div>
        ))}
        {mine.length > 0 && <div className="ta-col mine">
          <span className="k">내가 이 챔피언으로 고른 증강</span>
          {mine.slice(0, 3).map((a) => <AugmentLink key={a.id} id={a.id} champion={pick.id} className="ta-row"><AugRing id={a.id} size={36} /><span className="nm">{AUGMENT[a.id]?.name ?? `#${a.id}`}</span><span className="meta">{a.n}번 · {pct(a.w, a.n)}</span></AugmentLink>)}
        </div>}
      </div>
    </section>
  );
}

/** 게임이 없을 때 맨 위: 지금 상태를 크게, 옆에 다음 모임 */
function NoGame({ s }: { s: State }) {
  const nav = useNavigate();
  const { data } = useParties(s.me ? api : null);
  const next = data?.parties.find((p) => p.members.length < data.size) ?? data?.parties[0];
  const sub = s.status === 'no-client' ? '롤을 켜면 바로 연결돼요. 챔프 선택에 들어가면 팀 구성과 어울리는 증강을 여기서 보여드려요.'
    : s.status === 'error' ? `롤 클라이언트와 연결이 끊겼어요. ${s.message ?? ''}`
    : '챔프 선택에 들어가면 팀 구성과 어울리는 증강이 여기에 떠요.';
  return (
    <section className={`nogame ${s.status}`}>
      <div className="ng-main">
        <span className="ng-state"><i className="dot" />{s.status === 'no-client' ? '롤 꺼짐' : s.status === 'error' ? '연결 오류' : '롤 연결됨 · 대기 중'}</span>
        <h1>현재 진행 중인 게임이 없습니다</h1>
        <p>{sub}</p>
      </div>
      <button type="button" className="ng-party" onClick={() => nav('/crew')}>
        <span className="k">같이 할 판</span>
        {next ? <>
          <b>{partyTime(next.startAt, data!.now)}</b>
          <span className="faces">{next.members.slice(0, 5).map((m) => <MemberFace key={m.id} nick={m.nick} skin={m.skin} champion={m.main} size={28} />)}<span className="meta">{next.members.length}/{data!.size}</span></span>
          <span className="go">{next.mine ? '참여 중' : '자리 보러 가기'} →</span>
        </> : <><b>열린 판이 없어요</b><span className="go">먼저 열기 →</span></>}
      </button>
    </section>
  );
}

export function GamePage({ s }: { s: State }) {
  const nav = useNavigate();
  if (s.status === 'in-game') return <InGame championId={s.lastChampion} />;
  const games = s.games, P = s.personal;
  const st = streakOf(games);
  return (
    <div className="stack" style={{ gap: 16 }}>
      {s.champSelect ? <ChampSelectPanel cs={s.champSelect} crew={s.crew} personal={P} /> : <NoGame s={s} />}
      {!s.champSelect && s.status !== 'champ-select' && <TodayPick personal={P} />}
      {!s.champSelect && <h2 className="h2">내 아수라장</h2>}
      {games.length > 0 && <div className="grid4">
        <section className="card stat"><span className="k">아수라장 (최근 100판 중)</span><span className="v">{P.total.n}<small>판</small></span></section>
        <section className="card stat"><span className="k">승률</span><span className="v">{pct(P.total.w, P.total.n)}</span></section>
        <section className="card stat"><span className="k">지금</span><span className={`v ${st.win ? 'w' : 'l'}`}>{st.n}<small>{st.win ? '연승' : '연패'}</small></span></section>
        <section className="card stat"><span className="k">만난 챔피언</span><span className="v">{Object.keys(P.champions).length}<small>/ {Object.keys(CHAMPIONS).length}</small></span></section>
      </div>}
      <RecentGames games={games} onChampion={(c) => nav(`/champions/${c}`)} />
    </div>
  );
}
