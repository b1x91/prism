/**
 * 앱 홈 (CLAUDE.md v3.164, 시안 B '검색이 먼저').
 * 오늘의 챔프 그림이 홈 화면 전체의 배경으로 크게 깔리고, 그 위에 아주 큰 통합 검색(멤버 · 챔프 · 증강 · 아이템/도감).
 * 아래는 오늘의 챔프 이야기 → 어울리는 증강 판 → 이번 시즌 랭킹 맛보기(Top 5 + 내 순위).
 * 앱 창은 좁다 (최소 980 → 본문 약 730px): 어느 폭에서도 글자가 줄바꿈되지 않게 칸을 나눈다.
 */
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { buyerRoles, itemGuideOf, josa, AUGMENT, CHAMPIONS, GAME_DATA, ITEM, ITEM_GROUP, ITEM_GROUP_KO, RARITY_KO, ROLE_KO, cdragon, fitPoints, guideOf, pct, tierOf, rankScore, shortNick, todayPicks, type Ranking, type RankingRow } from '@prism/core';
import { AugRing, AugmentLink, Bone, ChampImg, imgIn, useItemDetail, FramedFace, TierBadge, Icon, NickName, OmniSearch, PendingChip, SplashSwap, preloadSplash, setKept, useLoad, useSplashHold, type SearchKind } from '@prism/ui';
import { api } from '../bridge';
import type { State } from '../controller';

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
  // 오늘의 챔프는 날마다 정해진 첫 추천 하나 (다른 추천·증강 가이드 단추는 두지 않는다, 사용자 결정)
  const i = 0;
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
      </section>}

      {/* 아래 두 칸: 왼쪽 어울리는 증강 · 오른쪽 랭킹 맛보기 (v3.164) */}
      <div className="home-duo">
        {pick && <HomeAugs champion={pick.id} swapped={swapped.current} pending={hold.pending} />}
        {s.me && <HomeRanking s={s} />}
      </div>

      {s.me && <HomeItem onDex={(id) => { openItemInDex(id); nav('/dex'); }} />}
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
  return (
    <section className="card pad home-rank">
      <div className="hr-head"><h3>{data?.season?.label ?? '이번 시즌'} 랭킹</h3><button type="button" className="hr-all" onClick={() => nav('/ranking')}>전체 보기<Icon name="chevR" /></button></div>
      {!data ? <div className="hr-list">{[0, 1, 2, 3, 4].map((k) => <div key={k} className="hr-row sk"><Bone w={20} h={16} /><Bone w={36} h={36} r="m" /><Bone w="60%" h={14} /><Bone w={36} h={16} /></div>)}</div>
        : !top.length ? <p className="hr-empty">이번 시즌 기록이 쌓이면 여기에 순위가 떠요.</p>
        : <div className="hr-list">
          {top.map((r, k) => <Row key={r.key ?? r.id} r={r} rank={k + 1} me={r.id === meId} onOpen={() => nav(`/members/${r.id}`)} />)}
        </div>}
    </section>
  );
}

function Row({ r, rank, me, onOpen }: { r: RankingRow; rank: number; me?: boolean; onOpen: () => void }) {
  return (
    <button type="button" className={`hr-row ${me ? 'me' : ''} ${rank <= 3 ? `p${rank}` : ''}`} onClick={onOpen}>
      <span className="hr-n tn">{rank}</span>
      <FramedFace frame={r.frame} nick={r.nick} skin={r.skin} champion={r.mainChampion} size={36} />
      <span className="hr-who"><b><NickName nick={shortNick(r.nick)} /></b>{r.pending && <PendingChip />}<small className="tn">{`${r.n}판 · ${pct(r.w, r.n)}`}</small></span>
      <span className="hr-s tn">{rankScore(r.w, r.n)}</span>
    </button>
  );
}

/** 오늘의 챔프에게 어울리는 증강 5개 — 등급을 섞어 어울림 점수 순 (오른쪽 랭킹 Top 5 와 같은 다섯 줄) */
const RANK_RARITY = { prismatic: 3, gold: 2, silver: 1 } as const;
function HomeAugs({ champion, swapped, pending }: { champion: number; swapped?: boolean; pending?: boolean }) {
  const guide = guideOf(GAME_DATA, champion);
  const top = guide ? [...guide.prismatic, ...guide.gold, ...guide.silver]
    .sort((a, b) => fitPoints(b) - fitPoints(a) || RANK_RARITY[b.rarity] - RANK_RARITY[a.rarity]).slice(0, 5) : [];
  return (
    <section className={`card pad home-augs ${pending ? 'swapping' : ''}`}>
      <div className="hr-head"><h3>{CHAMPIONS[champion]?.name}에게 어울리는 증강</h3></div>
      <div key={champion} className={`hr-list ${swapped ? 'bn-in' : ''}`}>
        {top.map((f, k) => (
          <AugmentLink key={f.id} id={f.id} champion={champion} className="hr-row ha-row">
            <span className="hr-n tn">{k + 1}</span>
            <AugRing id={f.id} size={40} />
            <span className="hr-who"><b>{AUGMENT[f.id]?.name}</b><small className={`ha-r ${f.rarity}`}>{RARITY_KO[f.rarity]}</small></span>
            <TierBadge tier={tierOf(fitPoints(f))} />
          </AugmentLink>
        ))}
      </div>
    </section>
  );
}

/** 오늘의 아이템: 도감 설명 + 최근 30일 Prism 멤버가 얼마나 고르는지 (v3.166, 서버 /api/items/today) */
type ItemDay = { id: number; days: number; games: number; players: number; picks: number; wins: number; members: number; rank: number | null; ranked: number; champs: { c: number; n: number }[] };
function HomeItem({ onDex }: { onDex: (id: number) => void }) {
  const { data } = useLoad<ItemDay>(api, '/api/items/today');
  const detail = useItemDetail(Boolean(data));
  if (!data) return <section className="card pad home-item sk" aria-hidden="true"><div className="hr-head"><Bone w={140} h={20} /></div><div className="hi-body"><div className="hi-desc"><Bone w={64} h={64} r="m" /><Bone w="70%" h={14} /><Bone w="90%" h={14} /></div><div className="hi-stats"><Bone w="100%" h={120} r="m" /></div></div></section>;
  const it = ITEM[data.id];
  if (!it) return null;
  const d = detail?.[data.id];
  const guide = itemGuideOf(data.id, detail);
  const roles = buyerRoles(data.champs);
  const rate = data.games ? data.picks / data.games : 0;
  const group = ITEM_GROUP[data.id];
  return (
    <section className="card pad home-item">
      <div className="hr-head"><h3>오늘의 아이템</h3><button type="button" className="hr-all" onClick={() => onDex(data.id)}>도감에서 보기<Icon name="chevR" /></button></div>
      <div className="hi-body">
        <div className="hi-desc">
          <div className="hi-top"><img className="hi-ic fi" {...imgIn} src={cdragon(it.icon)} width={56} height={56} alt="" />
            <div className="hi-name"><b>{it.name}</b><small>{[group && ITEM_GROUP_KO[group], it.price > 0 && `${it.price.toLocaleString()} 골드`].filter(Boolean).join(' · ')}</small></div></div>
          {d ? <>
            {d.stats.length > 0 && <ul className="hi-statl">{d.stats.map((x) => <li key={x}>{x}</li>)}</ul>}
            {d.effects.slice(0, 3).map(([n, t]) => <p key={n} className="hi-eff"><b>{n}</b> {t}</p>)}
            {guide && guide.when.length > 0 && <div className="hi-guide"><span className="hi-k">언제 가면 좋아요</span>
              <ul>{guide.when.map((x) => <li key={x}><Icon name="check" />{x}</li>)}</ul></div>}
            {guide && guide.aram.length > 0 && <div className="hi-guide aram"><span className="hi-k">증바람에서는</span>
              <ul>{guide.aram.map((x) => <li key={x}><Icon name="spark" />{x}</li>)}</ul></div>}
            {roles && <p className="hi-who"><Icon name="users" /><span>멤버들은 주로 <b>{roles}</b>{josa(roles, '이/가').slice(roles.length)} 사요</span></p>}
            {guide && guide.builds.length > 0 && <p className="hi-who"><Icon name="box" /><span>추천 빌드 <b>{guide.builds.join(' · ')}</b>에 들어가요</span></p>}
          </> : <><Bone w="60%" h={14} /><Bone w="90%" h={14} /><Bone w="80%" h={14} /><Bone w="70%" h={14} /></>}
        </div>
        {data.games === 0 ? <div className="hi-stats hi-none"><span className="hi-k">최근 {data.days}일 Prism 멤버 판</span><p>기록이 쌓이면 멤버들이 이 아이템을 얼마나 고르는지 보여 드려요.</p></div> : <div className="hi-stats">
          <span className="hi-k">최근 {data.days}일 Prism 멤버 판</span>
          <div className="hi-rate"><b className="tn">{data.games ? `${(rate * 100).toFixed(rate < 0.1 ? 1 : 0)}%` : '–'}</b><span>픽률 · {data.games.toLocaleString()}판 중 {data.picks.toLocaleString()}판</span></div>
          <span className="hi-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, rate * 100 * 3)}%` }} /></span>
          <dl className="hi-grid">
            <div><dt>이 아이템을 산 판 승률</dt><dd className="tn">{data.picks ? pct(data.wins, data.picks) : '–'}</dd></div>
            <div><dt>쓰는 멤버</dt><dd className="tn">{data.members}<small>/{data.players}명</small></dd></div>
            <div><dt>픽률 순위</dt><dd className="tn">{data.rank ? <>{data.rank}<small>/{data.ranked}위</small></> : '–'}</dd></div>
          </dl>
          {data.champs.length > 0 && <div className="hi-champs"><span className="hi-k">많이 산 챔프</span><div>{data.champs.map((x) => <span key={x.c} className="hi-ch" title={`${CHAMPIONS[x.c]?.name ?? ''} · ${x.n}판`}><ChampImg id={x.c} size={32} /><small className="tn">{x.n}</small></span>)}</div></div>}
        </div>}
      </div>
    </section>
  );
}
