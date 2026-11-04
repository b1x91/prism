/**
 * 앱 홈 (CLAUDE.md v3.164, 시안 B '검색이 먼저').
 * 오늘의 챔프 그림이 홈 화면 전체의 배경으로 크게 깔리고, 그 위에 아주 큰 통합 검색(멤버 · 챔프 · 증강 · 아이템/도감).
 * 아래는 오늘의 챔프 이야기 → 어울리는 증강 판 → 이번 시즌 랭킹 맛보기(Top 5 + 내 순위).
 * 앱 창은 좁다 (최소 980 → 본문 약 730px): 어느 폭에서도 글자가 줄바꿈되지 않게 칸을 나눈다.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CHAMPIONS, ROLE_KO, cdragon, pct, rankScore, shortNick, todayPicks, type Ranking, type RankingRow } from '@prism/core';
import { Bone, FramedFace, GlassBtn, Icon, NickName, OmniSearch, PendingChip, SplashSwap, preloadSplash, setKept, useLoad, useSplashHold, type SearchKind } from '@prism/ui';
import { api } from '../bridge';
import type { State } from '../controller';
import { TodayAugBoard } from './Game';

/** 아이템을 고르면 도감의 그 아이템 칸을 연다 (거르기는 풀어서 보이게) */
function openItemInDex(id: number) {
  setKept('dex.kind', 'items');
  setKept('dex.show', 'all');
  setKept('dex.group', 'all');
  setKept('dex.q', '');
  setKept('dex.sel', { champions: null, augments: null, items: id });
}

export function HomePage({ s }: { s: State }) {
  const nav = useNavigate();
  const P = s.personal;
  const picks = todayPicks(P, Object.keys(CHAMPIONS).map(Number));
  const [i, setI] = useState(0);
  const want = picks.length ? picks[i % picks.length] : null;
  // '다른 추천': 새 그림이 준비될 때까지 지금 글·그림·증강 판을 두었다가 한 번에 (v3.122)
  const hold = useSplashHold(want?.id, i);
  const swapped = useRef(false);
  if (hold.value !== 0) swapped.current = true;
  const nextId = picks.length > 1 ? picks[(i + 1) % picks.length].id : null;
  useEffect(() => { if (nextId) preloadSplash([nextId]); }, [nextId]);
  const pick = picks.length ? picks[hold.value % picks.length] : null;
  const c = pick ? CHAMPIONS[pick.id] : null;
  const rec = pick ? P.champions[pick.id] : null;

  const open = (kind: SearchKind, id: string) => {
    if (kind === 'member') nav(`/members/${id}`);
    else if (kind === 'champ') nav(`/champions/${id}`);
    else if (kind === 'augment') nav(`/augments/${id}`);
    else { openItemInDex(Number(id)); nav('/dex'); }
  };
  // 비어 있을 때 바로가기: 내가 많이 한 챔프
  const quick = Object.entries(P.champions).sort((a, b) => b[1].n - a[1].n).slice(0, 6).map(([id]) => Number(id));
  const tags = c ? [ROLE_KO[c.roles[0]], c.damage === 'MIX' ? 'AP·AD' : c.damage, c.range === 'ranged' ? '원거리' : '근접'].filter(Boolean) as string[] : [];

  return (
    <div className="home">
      {/* 홈 전체의 배경: 오늘의 챔프 그림 (아래로 갈수록 바탕색에 녹는다) */}
      <div className="home-bg" aria-hidden="true">{c && <SplashSwap className="home-splash" src={cdragon(c.splash)} />}</div>

      <section className="home-search">
        <span className="home-k">PRISM</span>
        <h1>누구의 기록이 궁금하세요?</h1>
        <p>멤버 전적, 챔프, 증강, 아이템까지 한 칸에서 찾아요.</p>
        <OmniSearch api={s.me ? api : null} variant="hero" hotkey scopes={['member', 'champ', 'augment', 'item']} onOpen={open} quick={quick}
          placeholder="멤버 이름 · 챔프 · 증강 · 아이템" />
      </section>

      {pick && c && <section className={`home-champ ${hold.pending ? 'swapping' : ''}`} aria-busy={hold.pending}>
        <div className={`hc-txt ${swapped.current ? 'bn-in' : ''}`} key={pick.id}>
          <span className="hc-k">{pick.why === 'best' ? '오늘은 이 챔프 어때요? · 내 기록에서 가장 잘 이긴 챔프' : '오늘은 이 챔프 어때요? · 아직 만나지 못한 챔프'}</span>
          <h2>{c.name}</h2>
          <div className="hc-tags">{tags.map((t) => <span key={t}>{t}</span>)}</div>
          <p className="hc-why">{rec ? <>내 기록 <b>{rec.n}판 {rec.w}승</b> ({pct(rec.w, rec.n)}). 주사위나 대기석에서 보이면 잡아보세요.</> : <>도감을 채울 기회예요. 주사위나 대기석에서 보이면 잡아보세요.</>}</p>
        </div>
        <div className="hc-act">
          {picks.length > 1 && <GlassBtn icon="shuffle" label="다른 추천" onClick={() => setI(i + 1)} />}
          <button type="button" className="btn primary hc-go" onClick={() => nav(`/champions/${pick.id}`)}>증강 가이드<Icon name="arrow" /></button>
        </div>
      </section>}

      {pick && <TodayAugBoard champion={pick.id} personal={P} swapped={swapped.current} pending={hold.pending} />}

      {s.me && <HomeRanking s={s} />}
    </div>
  );
}

/** 랭킹 맛보기: 이번 시즌 Top 5 + 내 순위. 랭킹이 아직 닫혀 있으면 모인 수만 */
function HomeRanking({ s }: { s: State }) {
  const nav = useNavigate();
  const openRank = s.me?.perms?.ranking !== false;
  const { data } = useLoad<Ranking>(api, openRank ? '/api/ranking?period=season&by=score' : null);
  if (!openRank) {
    const have = s.me?.rankingGate?.have ?? 0, need = s.me?.rankingGate?.need ?? 30;
    return (
      <section className="card pad home-rank soon">
        <div className="hr-head"><h3>시즌 랭킹</h3><span className="meta">준비 중</span></div>
        <div className="hr-soon"><span>회원이 {need}명 모이면 모두에게 열려요</span><span className="hr-gauge"><i style={{ width: `${Math.min(100, (have / need) * 100)}%` }} /></span><b className="tn">{have}<small>/{need}명</small></b></div>
      </section>
    );
  }
  const rows = data?.rows ?? [];
  const top = rows.slice(0, 5);
  const meId = s.me?.id;
  const myIdx = rows.findIndex((r) => r.id === meId);
  const mine: (RankingRow & { rank: number }) | null = myIdx >= 0 ? { ...rows[myIdx], rank: myIdx + 1 } : data?.limited?.mine ?? null;
  const showMine = mine && mine.rank > 5;
  const gap = showMine && top[4] ? rankScore(top[4].w, top[4].n) - rankScore(mine.w, mine.n) : 0;
  return (
    <section className="card pad home-rank">
      <div className="hr-head"><h3>{data?.season?.label ?? '이번 시즌'} 랭킹</h3><button type="button" className="hr-all" onClick={() => nav('/ranking')}>전체 보기<Icon name="chevR" /></button></div>
      {!data ? <div className="hr-list">{[0, 1, 2, 3, 4].map((k) => <div key={k} className="hr-row sk"><Bone w={20} h={16} /><Bone w={36} h={36} r="m" /><Bone w="60%" h={14} /><Bone w={36} h={16} /></div>)}</div>
        : !top.length ? <p className="hr-empty">이번 시즌 기록이 쌓이면 여기에 순위가 떠요.</p>
        : <div className="hr-list">
          {top.map((r, k) => <Row key={r.key ?? r.id} r={r} rank={k + 1} me={r.id === meId} onOpen={() => nav(`/members/${r.id}`)} />)}
          {showMine && <>
            <span className="hr-dots" aria-hidden="true">···</span>
            <Row r={mine} rank={mine.rank} me extra onOpen={() => nav('/me')} note={gap > 0 ? `5위까지 ${gap}점` : undefined} />
          </>}
        </div>}
    </section>
  );
}

function Row({ r, rank, me, extra, onOpen, note }: { r: RankingRow; rank: number; me?: boolean; extra?: boolean; onOpen: () => void; note?: string }) {
  return (
    <button type="button" className={`hr-row ${me ? 'me' : ''} ${extra ? 'extra' : ''} ${rank <= 3 ? `p${rank}` : ''}`} onClick={onOpen}>
      <span className="hr-n tn">{rank}</span>
      <FramedFace frame={r.frame} nick={r.nick} skin={r.skin} champion={r.mainChampion} size={36} />
      <span className="hr-who"><b><NickName nick={shortNick(r.nick)} /></b>{r.pending && <PendingChip />}<small className="tn">{note ?? `${r.n}판 · ${pct(r.w, r.n)}`}</small></span>
      <span className="hr-s tn">{rankScore(r.w, r.n)}</span>
    </button>
  );
}
