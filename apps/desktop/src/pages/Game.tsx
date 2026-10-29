import { FullscreenNote } from '../fullscreen';
import { useEffect, useRef, useState } from 'react';
import { AUGMENT, CHAMPIONS, ago, guideOf, pct, streakOf, todayPicks, type MissionState, type Personal } from '@prism/core';
import { AugRing, AugmentLink, Bone, GlassBtn, Icon, TierBadge } from '@prism/ui';
import { GAME_DATA, fitPoints, tierOf } from '@prism/core';
import { AugmentCompare, AugmentGuide, LatestMatch, ChampBanner, ChampSearch, Empty, PieceIcon, RecentGames, Seg, preloadSplash, useLoad, useSplashHold } from '@prism/ui';
import { api } from '../bridge';
import { useNavigate } from 'react-router-dom';
import { editMatchup, type State } from '../controller';
import { ChampSelectPanel, CheckNow } from './ChampSelect';
import { useSeenAugments, useVisionState, visionStatus } from '../vision';

/** 게임 중: Alt+Tab 하면 바로 보이는 내 챔피언 증강 가이드 + 3개 비교 */
function InGame({ championId, matchup }: { championId: number | null; matchup: State['matchup'] }) {
  const [tab, setTab] = useState<'compare' | 'guide'>('compare');
  const [pick, setPick] = useState<number | null>(null);
  const seen = useSeenAugments();
  const vs = visionStatus(useVisionState());
  const id = pick ?? championId;
  if (!id) return <section className="card pad"><Empty>이번 판 챔프를 고르면 증강 가이드가 나옵니다.</Empty><ChampSearch onPick={setPick} /></section>;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <ChampBanner id={id} fav={false} eyebrow="게임 중 · 증강 고를 때 Alt+Tab" actions={pick ? <GlassBtn icon="back" label="내 챔프로" onClick={() => setPick(null)} /> : undefined} />
      <div className="row"><Seg value={tab} options={[['compare', '뜬 증강 3개 비교'], ['guide', '등급별 가이드']]} onChange={setTab} />{vs.text && <span className={`vs ${vs.tone}`} title="게임 중 증강 자동 인식"><i />{vs.text}</span>}</div>
      {tab === 'compare' ? <AugmentCompare championId={id} preset={seen.ids} matchup={matchup ? { allies: matchup.allies, enemies: matchup.enemies } : { allies: [], enemies: [] }} onMatchup={editMatchup} autoMatchup={matchup?.source === 'game' || matchup?.source === 'champ-select'} /> : <AugmentGuide championId={id} compact={false} />}
    </div>
  );
}

/** 오늘은 이 챔피언 어때요? 내 기록으로 고른 챔피언 + 등급별로 잘 맞는 증강 */
function TodayPick({ personal }: { personal: Personal }) {
  const nav = useNavigate();
  const picks = todayPicks(personal, Object.keys(CHAMPIONS).map(Number));
  const [i, setI] = useState(0);
  // '다른 추천'을 누르면 새 그림이 준비될 때까지 지금 챔프·증강 표를 두었다가 한 번에 바꾼다 (v3.122)
  const want = picks.length ? picks[i % picks.length] : null;
  const hold = useSplashHold(want?.id, i);
  const swapped = useRef(false);
  if (hold.value !== 0) swapped.current = true;
  // 다음 추천 그림은 미리 받아 둔다 → 누르면 바로 바뀐다
  const nextId = picks.length > 1 ? picks[(i + 1) % picks.length].id : null;
  useEffect(() => { if (nextId) preloadSplash([nextId]); }, [nextId]);
  if (!picks.length) return null;
  const pick = picks[hold.value % picks.length];
  const rec = personal.champions[pick.id];
  const guide = guideOf(GAME_DATA, pick.id);
  const mine = personal.augmentsByChampion[pick.id] ?? [];
  // 칸마다 줄 수를 같게: 내가 고른 증강이 있으면 그 수(2~3)에, 없으면 3에 맞춘다 (v3.117)
  const per = mine.length ? Math.min(3, Math.max(2, mine.length)) : 3;
  const rows = guide ? (['prismatic', 'gold', 'silver'] as const).map((r) => [r, guide[r].slice(0, per)] as const) : [];
  return (
    <section className="today">
      <ChampBanner id={pick.id} fav={false} waiting={hold.pending} eyebrow={pick.why === 'best' ? '오늘은 이 챔프 어때요? · 내 기록에서 가장 잘 이긴 챔프' : '오늘은 이 챔프 어때요? · 아직 만나지 못한 챔프'}
        actions={picks.length > 1 ? <GlassBtn icon="shuffle" label="다른 추천" onClick={() => setI(i + 1)} /> : undefined}
        foot={<button type="button" className="btn sm primary" onClick={() => nav(`/champions/${pick.id}`)}>증강 가이드<Icon name="arrow" /></button>}>
        <p className="today-why">{rec ? <>내 기록 <b>{rec.n}판 {rec.w}승</b> ({pct(rec.w, rec.n)}). 주사위나 대기석에서 보이면 잡아보세요.</> : <>도감을 채울 기회예요. 주사위나 대기석에서 보이면 잡아보세요.</>}</p>
      </ChampBanner>
      <div key={pick.id} className={`today-augs ${mine.length ? 'n4' : 'n3'} ${swapped.current ? 'bn-in' : ''} ${hold.pending ? 'swapping' : ''}`}>
        {rows.map(([r, list]) => (
          <div key={r} className="ta-col">
            <span className={`k ${r}`}>{r === 'prismatic' ? '프리즘' : r === 'gold' ? '골드' : '실버'}</span>
            {list.map((f) => (
              <AugmentLink key={f.id} id={f.id} champion={pick.id} className="ta-row"><AugRing id={f.id} size={36} /><span className="nm">{AUGMENT[f.id]?.name}</span><TierBadge tier={tierOf(fitPoints(f))} /></AugmentLink>
            ))}
          </div>
        ))}
        {mine.length > 0 && <div className="ta-col mine">
          <span className="k">내가 이 챔프로 고른 증강</span>
          {mine.slice(0, per).map((a) => <AugmentLink key={a.id} id={a.id} champion={pick.id} className="ta-row"><AugRing id={a.id} size={36} /><span className="nm">{AUGMENT[a.id]?.name ?? `#${a.id}`}</span><span className="meta">{a.n}번 · {pct(a.w, a.n)}</span></AugmentLink>)}
        </div>}
      </div>
    </section>
  );
}

/** 게임이 없을 때 맨 위: 지금 상태를 크게, 옆에 이번 주 미션 */
function NoGame({ s }: { s: State }) {
  const nav = useNavigate();
  const { data } = useLoad<MissionState>(api, s.me ? '/api/me/missions' : null);
  const ms = data?.week.missions ?? [];
  const todo = ms.find((m) => !m.done);
  const sub = s.status === 'no-client' ? '롤을 켜면 바로 연결돼요. 챔프 선택에 들어가면 팀 구성과 어울리는 증강을 여기서 보여드려요.'
    : s.status === 'error' ? `롤 클라이언트와 연결이 끊겼어요. ${s.message ?? ''}`
    : '챔프 선택에 들어가면 팀 구성과 어울리는 증강이 여기에 떠요.';
  return (
    <section className={`nogame ${s.status}`}>
      <div className="ng-main">
        <div className="ng-top"><span className="ng-state"><i className="dot" />{s.status === 'no-client' ? '롤 꺼짐' : s.status === 'error' ? '연결 오류' : '롤 연결됨 · 대기 중'}</span>
          {s.status !== 'no-client' && <CheckNow label="챔프 선택 바로 확인" />}</div>
        <h1>현재 진행 중인 게임이 없습니다</h1>
        <p>{sub}</p>
      </div>
      {s.me && <button type="button" className="ng-party" onClick={() => nav('/missions')}>
        <span className="k">이번 주 미션 · {ms.filter((m) => m.done).length}/{ms.length || 3}{(data?.ready ?? 0) > 0 && <> · 받을 보상 {data!.ready}<PieceIcon size={12} /></>}</span>
        {todo ? <>
          <b>{todo.title}</b>
          <span className="ng-mprog"><span className="bar"><span style={{ width: `${(todo.progress / todo.target) * 100}%` }} /></span><span className="meta">{todo.progress}/{todo.target}</span><span className="rew">{todo.reward}<PieceIcon size={12} /></span></span>
          <span className="go">미션 보기 →</span>
        </> : ms.length ? <><b>이번 주 미션을 다 깼어요!</b><span className="go">미션 보기 →</span></>
          // 받는 동안: 미션 제목(두 줄)·진행 막대와 같은 틀로 자리를 잡는다 — 나중에 칸이 커지며 아래를 밀지 않게 (v3.93)
          : <><span className="ng-skb" aria-hidden="true"><Bone w="85%" h={20} /><Bone w="55%" h={20} /></span><span className="ng-mprog"><Bone w="100%" h={6} r="pill" /><span className="meta">&nbsp;</span></span><span className="go">미션 보기 →</span></>}
      </button>}
    </section>
  );
}

export function GamePage({ s }: { s: State }) {
  const nav = useNavigate();
  // 롤이 전체 화면이면 게임 화면 맨 위에 늘 (게임 중·챔프 선택·대기 모두 — 왜 작은 창이 안 뜨는지 미리 알게)
  if (s.status === 'in-game') return <div className="stack" style={{ gap: 16 }}><FullscreenNote /><InGame championId={s.lastChampion} matchup={s.matchup} /></div>;
  const games = s.games, P = s.personal;
  const st = streakOf(games);
  return (
    <div className="stack" style={{ gap: 16 }}>
      <FullscreenNote />
      {s.champSelect ? <ChampSelectPanel cs={s.champSelect} crew={s.crew} pending={Boolean(s.me) && !s.crew} personal={P} /> : <NoGame s={s} />}
      {!s.champSelect && s.status !== 'champ-select' && <TodayPick personal={P} />}
      {!s.champSelect && <h2 className="h2">내 아수라장</h2>}
      {games.length > 0 && <div className="grid4">
        <section className="card stat"><span className="k">아수라장 (최근 100판 중)</span><span className="v">{P.total.n}<small>판</small></span></section>
        <section className="card stat"><span className="k">승률</span><span className="v">{pct(P.total.w, P.total.n)}</span></section>
        <section className="card stat"><span className="k">지금</span><span className={`v ${st.win ? 'w' : 'l'}`}>{st.n}<small>{st.win ? '연승' : '연패'}</small></span></section>
        <section className="card stat"><span className="k">만난 챔프</span><span className="v">{Object.keys(P.champions).length}<small>/ {Object.keys(CHAMPIONS).length}</small></span></section>
      </div>}
      {!s.champSelect && games[0] && <LatestMatch g={games[0]} onChampion={(c) => nav(`/champions/${c}`)} />}
      <RecentGames games={games} onChampion={(c) => nav(`/champions/${c}`)} />
    </div>
  );
}
