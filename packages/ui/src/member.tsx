/**
 * 회원끼리 보는 화면: 랭킹, 회원 페이지(분석·나와의 시너지), 프로필 꾸미기. 웹·앱 공용.
 * 이동은 onOpen(회원 ID) 으로 화면 쪽에 맡긴다 (웹은 /members/:id, 앱은 #/members/:id).
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AUGMENT, CHAMPIONS, CHAMPION_LIST, ROLE_KO, RARITY_KO, SKIN_TIERS, TAG_KO, augmentHabits, baseSkin, cdragon, loadSkins, matchName, pct, shortDate, skinNeed, streakOf, styleOf, duoOf, ago, bondOf, coachOf, BOND_GRADES, BOND_POINT,
  type Api, type Game, type MemberPage, type Ranking, type RankingRow, type Skin,
} from '@prism/core';
import { AugImg, ChampImg, Empty, Gem, LockedMore, MemberFace, PresenceTag, RoleBadge, Seg, useSkins } from './basics';
import { AugmentLink } from './augment';
import { ArtisanRankingView } from './artisan';
import { Icon } from './icons';
import { useLoad } from './crew';
import { RecentGames } from './game';
import { ProfileHero, ShareButton, baseTint } from './shop';
import { BgScene } from './bgscene';
import { NickName, ProfileStudio } from './studio';

const ROLE_COLOR: Record<string, string> = { marksman: 'var(--spectrum-1)', fighter: 'var(--spectrum-2)', tank: 'var(--spectrum-4)', support: 'var(--spectrum-5)', mage: 'var(--spectrum-6)', assassin: 'var(--spectrum-7)' };
const TIER_KO = { admin: '관리자', member: '회원', guest: '새 회원' } as const;

// ───────── 랭킹 ─────────

type RankBy = 'games' | 'winrate' | 'month';

/** 랭킹. 회원이 충분히 모이기 전(open=false)에는 '준비 중' 화면 (운영진은 미리 본다) */
export function RankingView({ api, meId, onOpen, open = true, gate }: { api: Api; meId?: string; onOpen: (id: string) => void; open?: boolean; gate?: { have: number; need: number } }) {
  if (!open) return <RankingSoon gate={gate} />;
  return <RankingOpen api={api} meId={meId} onOpen={onOpen} />;
}

function RankingSoon({ gate }: { gate?: { have: number; need: number } }) {
  const have = gate?.have ?? 0, need = gate?.need ?? 30;
  return (
    <section className="rk-soon">
      <div className="rk-soon-stage" aria-hidden="true">
        {[2, 1, 3].map((r) => <span key={r} className={`rk-soon-ped p${r}`}><i />{r}</span>)}
      </div>
      <div className="rk-soon-txt">
        <span className="ss-k">PRISM LEADERBOARD</span>
        <h1>랭킹 준비 중</h1>
        <p>회원이 {need}명 모이면 모두에게 열려요. 그동안 쌓인 판은 그대로 순위에 들어가요.</p>
        <div className="rk-soon-gauge"><span className="rk-soon-bar"><span style={{ width: `${Math.min(100, (have / need) * 100)}%` }} /></span><b>{have}<small>/{need}명</small></b></div>
      </div>
    </section>
  );
}

function RankingOpen({ api, meId, onOpen }: { api: Api; meId?: string; onOpen: (id: string) => void }) {
  const [by, setBy] = useState<RankBy | 'champ-art' | 'aug-art'>('games');
  const art = by === 'champ-art' || by === 'aug-art';
  const { data, error } = useLoad<Ranking>(api, art ? null : by === 'month' ? '/api/ranking?period=month' : by === 'winrate' ? '/api/ranking?by=winrate' : '/api/ranking');
  const skins = useSkins();
  const rows = useMemo(() => {
    const r = (data?.rows ?? []).slice();
    if (by === 'winrate') return r.filter((x) => x.n >= (data?.minWinrate ?? 10)).sort((a, b) => b.w / b.n - a.w / a.n || b.n - a.n);
    return r.sort((a, b) => b.n - a.n || b.w - a.w);
  }, [data, by]);
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row wrapr"><Seg value={by} options={[['games', '판수'], ['winrate', '승률'], ['month', '이번 달'], ['champ-art', '챔프 장인'], ['aug-art', '증강 장인']]} onChange={setBy} />
        <span className="meta">{art ? '도감 마스터 여정을 모두 이룬 수 (같으면 이룬 목표 수)' : by === 'winrate' ? `${data?.minWinrate ?? 10}판 이상 기록한 회원만` : by === 'month' ? '이번 달 판수' : '지금까지 기록된 판수'}</span></div>
      {art && <ArtisanRankingView api={api} kind={by === 'champ-art' ? 'champions' : 'augments'} meId={meId} onOpen={onOpen} />}
      {error && <p className="l">{error}</p>}
      {!art && data && !rows.length && <Empty>{by === 'winrate' ? '아직 조건을 채운 회원이 없습니다.' : '아직 기록된 판이 없습니다.'}</Empty>}
      {!art && rows.length > 0 && <Leaderboard rows={rows.slice(0, 3)} by={by as RankBy} meId={meId} skins={skins} onOpen={onOpen} />}
      {!art && rows.length > 3 && <div className="card rank-list">
        {rows.slice(3).map((r, i) => <RankRow key={r.id} r={r} rank={i + 4} by={by as RankBy} me={r.id === meId} skins={skins} onOpen={onOpen} />)}
      </div>}
      {!art && data?.limited && <LockedMore more={data.limited.total - rows.length}>
        {data.limited.mine && by !== 'winrate' && <div className="card rank-list"><RankRow r={data.limited.mine} rank={data.limited.mine.rank} by={by as RankBy} me skins={skins} onOpen={onOpen} /></div>}
      </LockedMore>}
    </div>
  );
}

/** 상위 3명 무대: 가운데 1위가 가장 높고, 조명·받침대가 순서대로 올라온다 */
function Leaderboard({ rows, by, meId, skins, onOpen }: { rows: RankingRow[]; by: RankBy; meId?: string; skins: Record<number, Skin> | null; onOpen: (id: string) => void }) {
  return (
    <section className="lb" aria-label="상위 3명">
      <span className="lb-beam b1" aria-hidden="true" /><span className="lb-beam b2" aria-hidden="true" /><span className="lb-beam b3" aria-hidden="true" />
      <div className="lb-row">{[2, 1, 3].map((rank) => {
        const r = rows[rank - 1];
        return <div key={rank} className={`lb-slot p${rank}`}>
          {r ? <Podium r={r} rank={rank} by={by} me={r.id === meId} skins={skins} onOpen={onOpen} /> : <div className="lb-card empty"><span className="lb-q">?</span><span className="lb-empty">아직 비어 있어요</span></div>}
          <div className="lb-ped"><b>{rank}</b></div>
        </div>;
      })}</div>
    </section>
  );
}

function Podium({ r, rank, by, me, skins, onOpen }: { r: RankingRow; rank: number; by: RankBy; me: boolean; skins: Record<number, Skin> | null; onOpen: (id: string) => void }) {
  return (
    <button type="button" className={`lb-card ${me ? 'me' : ''}`} onClick={() => onOpen(r.id)}>
      {/* 산 배경이 있으면 그 장면, 없으면 회원마다 정해진 기본 색 (프로필 머리와 같은 규칙) */}
      {r.bg ? <BgScene id={r.bg} /> : <span className="phero-tint" style={{ ['--tint' as string]: baseTint(r.nick) }} aria-hidden="true" />}
      {rank === 1 && <span className="lb-crown" aria-hidden="true"><Gem size={28} src="/brand/prism-32.png" /></span>}
      <span className="lb-face"><MemberFace nick={r.nick} skin={r.skin} champion={r.mainChampion} skins={skins} size={rank === 1 ? 88 : 72} /></span>
      <span className="lb-nm"><NickName nick={r.nick} /></span>
      <span className="lb-st"><b>{by === 'winrate' ? pct(r.w, r.n) : `${r.n}판`}</b><small>{by === 'winrate' ? `${r.n}판` : `승률 ${pct(r.w, r.n)}`}</small></span>
    </button>
  );
}

function RankRow({ r, rank, by, me, skins, onOpen }: { r: RankingRow; rank: number; by: RankBy; me: boolean; skins: Record<number, Skin> | null; onOpen: (id: string) => void }) {
  return (
    <button type="button" className={`rank-row ${me ? 'me' : ''} ${rank === 1 ? 'first' : ''} ${r.bg ? 'has-bg' : ''}`} onClick={() => onOpen(r.id)}>
      {r.bg && <BgScene id={r.bg} row />}
      <span className="rk">{rank}</span>
      <MemberFace nick={r.nick} skin={r.skin} champion={r.mainChampion} skins={skins} size={40} />
      <span className="who"><b><NickName nick={r.nick} /></b>{r.mainChampion ? <span className="meta">주 챔프 {CHAMPIONS[r.mainChampion]?.name}</span> : null}</span>
      <span className={`num ${by !== 'winrate' ? 'key' : ''}`}>{r.n}<small>판</small></span>
      <span className={`num ${by === 'winrate' ? 'key' : ''}`}>{pct(r.w, r.n)}</span>
    </button>
  );
}

// ───────── 회원 페이지 ─────────

export function MemberView({ api, id, onChampion, actions }: { api: Api; id: string; onChampion?: (championId: number) => void; actions?: ReactNode }) {
  const { data, error, reload } = useLoad<MemberPage>(api, `/api/members/${encodeURIComponent(id)}`);
  const skins = useSkins();
  const [edit, setEdit] = useState(false);
  const [shareOn, setShared] = useState<boolean | null>(null);
  if (error) return <Empty>{error}</Empty>;
  if (!data) return <p className="meta">불러오는 중…</p>;
  const { member: m, total } = data;
  const deco = m.deco ?? {};
  const shared = shareOn ?? Boolean(m.shared);
  const main = data.champions[0]?.id ?? null;
  const skin = m.skin && skins?.[m.skin] ? skins[m.skin] : null;
  const art = skin?.splash ?? (main ? cdragon(CHAMPIONS[main]?.splash) : '');
  const games: Game[] = data.recent.map((g) => ({ ...g, damageTaken: null }));
  const st = streakOf(games);
  const S = styleOf(data.champions);
  const picksN = data.augments.reduce((n, a) => n + a.n, 0);
  const kda = total.n ? ((total.k + total.a) / Math.max(1, total.d)).toFixed(2) : '–';
  return (
    <div className="stack" style={{ gap: 16 }}>
      <ProfileHero nick={m.nick} intro={m.intro} art={art} skin={m.skin} champion={main} deco={deco}
        corner={m.role ? <RoleBadge role={m.role} /> : <span className="pill dark">{TIER_KO[m.tier]}</span>}
        actions={<>{m.self && <button type="button" className="btn sm" onClick={() => setEdit(true)}><Icon name="spark" />프로필 꾸미기</button>}
          {m.self && <ShareButton api={api} id={m.id} shared={shared} onChange={setShared} />}{actions}</>}
        chips={<><span className="pill dark">판수 {data.rank}위</span><span className="pill dark">{shortDate(m.joinedAt)} 가입</span>
          {skin && <span className="pill dark">{skin.name}</span>}{m.presence && m.presence !== 'off' && <span className="pill dark"><PresenceTag p={m.presence} /></span>}</>} />
      {edit && m.self && <ProfileStudio api={api} page={data} skins={skins} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); reload(); }} />}
      {m.self && !m.riotId && <section className="card pad"><b>아직 롤 계정이 연결되지 않았어요</b><div className="muted">PC의 Prism 앱에서 로그인한 뒤 맨 위의 <b>"동의하고 연결"</b>을 누르면, 그때부터 판이 여기에 쌓입니다. 앱에 이미 보이는 최근 판도 함께 올라와요.</div></section>}
      {!m.self && <SynergyCard data={data} />}
      <div className="grid4">
        <section className="card stat"><span className="k">기록된 판</span><span className="v">{total.n}<small>판</small></span></section>
        <section className="card stat"><span className="k">승률</span><span className="v">{pct(total.w, total.n)}</span></section>
        <section className="card stat"><span className="k">KDA</span><span className="v">{kda}</span></section>
        <section className="card stat"><span className="k">지금</span><span className={`v ${st.win ? 'w' : 'l'}`}>{st.n}<small>{st.win ? '연승' : '연패'}</small></span></section>
      </div>
      <RecentGames games={games} limit={8} onChampion={onChampion} />
      {total.n > 0 && <div className="grid2">
        <section className="card pad">
          <div className="card-head"><h2>주 챔프</h2><span className="sp" /><span className="meta">만난 챔프 {data.champions.length} / {Object.keys(CHAMPIONS).length}</span></div>
          <div className="list">{data.champions.slice(0, 6).map((c) => (
            <button type="button" key={c.id} className="item linkish" onClick={() => onChampion?.(c.id)}>
              <ChampImg id={c.id} size={32} /><span className="title">{CHAMPIONS[c.id]?.name}</span>
              <span><b>{pct(c.w, c.n)}</b> <span className="meta">{c.n}판 · {c.d ? (((c.k ?? 0) + (c.a ?? 0)) / c.d).toFixed(1) : '–'}</span></span>
            </button>))}</div>
        </section>
        <section className="card pad">
          <div className="card-head"><h2>플레이 성향</h2></div>
          <div className="k-title">역할</div>
          <Bars items={S.roles.map((r) => ({ key: r.key, label: ROLE_KO[r.key] ?? r.key, share: r.share, color: ROLE_COLOR[r.key] }))} />
          <div className="k-title">피해 유형</div>
          <Bars items={S.damage.map((d) => ({ key: d.key, label: d.key === 'MIX' ? '혼합' : d.key, share: d.share, color: d.key === 'AP' ? 'var(--spectrum-6)' : d.key === 'AD' ? 'var(--spectrum-2)' : 'var(--text-3)' }))} />
          <p className="meta" style={{ margin: 0 }}>앞라인 챔프 {Math.round(S.front * 100)}% · {S.cc >= 2.3 ? 'CC 많은 챔프 선호' : S.cc < 1.8 ? 'CC 적은 챔프 위주' : 'CC 보통'}</p>
        </section>
      </div>}
      {picksN > 0 && <>
        <AugmentHabits data={data} />
        <section className="card pad">
          <div className="card-head"><h2>자주 고른 증강</h2><span className="sp" /><span className="meta">{picksN}회 선택</span></div>
          <div className="list cols2">{data.augments.slice(0, 8).map((a) => (
            <AugmentLink key={a.id} id={a.id} className="item"><AugImg id={a.id} size={28} /><span className="title">{AUGMENT[a.id]?.name ?? `#${a.id}`}</span><span><b>{pct(a.w, a.n)}</b> <span className="meta">{a.n}회</span></span></AugmentLink>))}</div>
        </section>
      </>}
    </div>
  );
}

/** 증강 고르는 습관과 승률: 챔피언에 맞게 골랐을 때 / 성향별 (고른 증강 기준) */
function AugmentHabits({ data }: { data: MemberPage }) {
  const H = augmentHabits(data);
  const p = (x: number) => `${Math.round(x * 100)}%`;
  const d = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(Math.round(x * 100))}%p`;
  const f = H.fit;
  const fitGap = f && f.good.n >= 5 && f.rest.n >= 5 ? f.good.w / f.good.n - f.rest.w / f.rest.n : null;
  return (
    <section className="card pad habits">
      <div className="card-head"><h2>증강 고르는 습관</h2><span className="sp" /><span className="meta">고른 증강 {H.picks}개 · 평소 승률 {p(H.base)}</span></div>
      {f && (f.good.n + f.rest.n) > 0 && <div className="fitcmp">
        <div className="fc-row"><span className="k">챔프에 잘 맞는 증강 (S·A)</span><span className="tr"><span style={{ width: p(f.good.n ? f.good.w / f.good.n : 0) }} /></span><b>{f.good.n ? pct(f.good.w, f.good.n) : '–'}</b><span className="meta">{f.good.n}개</span></div>
        <div className="fc-row rest"><span className="k">그 밖의 증강</span><span className="tr"><span style={{ width: p(f.rest.n ? f.rest.w / f.rest.n : 0) }} /></span><b>{f.rest.n ? pct(f.rest.w, f.rest.n) : '–'}</b><span className="meta">{f.rest.n}개</span></div>
        <p className="insight">{fitGap === null ? '양쪽 모두 5개 이상 쌓이면 차이를 알려드려요.' : fitGap >= 0.03 ? <>챔프에 맞는 증강을 골랐을 때 <b className="w">{d(fitGap)}</b> 더 이겼어요. 가이드를 믿어도 좋아요.</> : fitGap <= -0.03 ? <>맞는 증강보다 <b>다른 증강을 골랐을 때</b> 더 이겼어요 ({d(-fitGap)}). 나만의 조합이 있는 편이에요.</> : <>어떤 증강을 골라도 승률 차이가 크지 않아요.</>}</p>
      </div>}
      <div className="k-title">성향별 승률 <span className="meta">· 오른쪽은 평소 승률과의 차이</span></div>
      <div className="tagrows">{H.tags.map((t) => (
        <div key={t.key} className={`tagrow ${t.n < 5 ? 'thin' : ''} ${H.best?.key === t.key ? 'best' : ''} ${H.worst?.key === t.key ? 'worst' : ''}`}>
          <span className="lb">{t.label}{H.best?.key === t.key && <em>가장 잘 이김</em>}{H.worst?.key === t.key && <em>아쉬움</em>}</span>
          <span className="cnt"><span className="tr"><span style={{ width: p(t.share) }} /></span><span className="meta">{t.n}개</span></span>
          <b>{p(t.rate)}</b>
          <span className={`dl ${t.n < 5 ? '' : t.delta >= 0.03 ? 'up' : t.delta <= -0.03 ? 'down' : ''}`}>{t.n < 5 ? '표본 적음' : d(t.delta)}</span>
        </div>))}</div>
      {H.best && <p className="insight"><b>{H.best.label}</b> 증강을 고른 판에서 평소보다 <b className="w">{d(H.best.delta)}</b> 더 이겼어요{H.worst ? <>. <b>{H.worst.label}</b> 쪽은 <b className="l">{d(H.worst.delta)}</b></> : ''}.</p>}
    </section>
  );
}

function Bars({ items }: { items: { key: string; label: string; share: number; color?: string }[] }) {
  return (
    <div className="bars">{items.slice(0, 6).map((x) => (
      <div key={x.key} className="bar"><span className="lb">{x.label}</span><span className="tr"><span style={{ width: `${Math.round(x.share * 100)}%`, background: x.color ?? 'var(--accent)' }} /></span><b>{Math.round(x.share * 100)}%</b></div>))}</div>
  );
}

/**
 * 나와의 시너지 (v3.28 내용 · v3.29 디자인).
 * 머리 = 두 사람의 무대(왼쪽 내 스킨, 오른쪽 상대 스킨) + 가운데 함께 승률 고리·한 줄 평가
 * 몸 = 핵심 숫자 한 줄 · 최근 함께한 판 타임라인 · 최고의 조합 카드 · 역할 궁합 · 코치 노트
 */
function SynergyCard({ data }: { data: MemberPage }) {
  const skins = useSkins();
  const nick = data.member.nick;
  const d = duoOf(data, nick);
  if (!d || !data.viewer) return null;
  const t = d.together, v = d.vs, me = data.viewer;
  const bond = bondOf(data.duo?.together ?? []);
  const coach = coachOf(data, nick);
  const LV = { good: '잘 맞을 것 같아요', ok: '무난해요', weak: '서로 보완이 필요해요' } as const;
  const p = (x: number | null) => (x === null ? '–' : `${Math.round(x * 100)}%`);
  const cn = (id: number) => CHAMPIONS[id]?.name ?? `#${id}`;
  const art = (skin: number | null | undefined, champ: number | undefined) => (skin && skins?.[skin]?.splash) || (champ ? cdragon(CHAMPIONS[champ]?.splash) : '');
  const myArt = art(me.skin, me.champions[0]?.id), theirArt = art(data.member.skin, data.champions[0]?.id);
  return (
    <section className={`card duo v-${d.verdict.key}`}>
      <header className="duo-stage">
        {myArt && <img className="duo-bg l" src={myArt} alt="" />}
        {theirArt && <img className="duo-bg r" src={theirArt} alt="" />}
        <span className="duo-k">나와의 시너지</span>
        <div className="duo-pair">
          <div className="duo-who">
            <MemberFace nick={me.nick ?? '나'} skin={me.skin} champion={me.champions[0]?.id} size={64} skins={skins} />
            <b>나</b><small>평균 {p(t.myAvg)}</small>
          </div>
          <div className="duo-core">
            <Ring value={t.n ? t.rate : 0} label={t.n ? p(t.rate) : '–'} sub="함께 승률" />
            <h2>{d.verdict.label}</h2>
            <p>{d.verdict.sub}</p>
          </div>
          <div className="duo-who">
            <MemberFace nick={nick} skin={data.member.skin} champion={data.champions[0]?.id} size={64} skins={skins} />
            <b>{nick}</b><small>평균 {p(t.theirAvg)}</small>
          </div>
        </div>
        <div className="duo-bond" title={`함께 1판 +${BOND_POINT.game} · 함께 이긴 판 +${BOND_POINT.win} · 함께한 주 +${BOND_POINT.week}`}>
          <div className="db-top">
            <span className="db-lv">Lv.{bond.grade}</span>
            <b>{bond.name}</b>
            <span className="db-score">{bond.score.toLocaleString()}<small>관계 점수</small></span>
          </div>
          <div className="db-bar"><span style={{ width: `${Math.max(3, Math.round(bond.pct * 100))}%` }} />{BOND_GRADES.slice(1).map((g, i) => <i key={g.at} className={bond.grade > i + 1 ? 'on' : ''} />)}</div>
          <div className="db-sub">
            <span>{bond.next ? <>다음 등급 <b>{bond.next.name}</b>까지 <b>{bond.toNext.toLocaleString()}</b>점</> : '최고 등급에 올랐어요'}</span>
            <span>꾸준함 <b>{bond.recentWeeks}</b>/4주 · 함께 <b>{t.n}</b>판 <b>{t.w}</b>승</span>
          </div>
        </div>
        <div className="duo-meta">
          {t.first && <span>첫 판 {shortDate(t.first)}</span>}
          {t.last && <span>마지막 {ago(t.last)}</span>}
          <span>함께한 주 {bond.weeks}주</span>
        </div>
      </header>

      <div className="duo-body">
        <div className="duo-figs">
          <div className="duo-fig">
            <small>내 평균 대비</small>
            <b className={t.lift === null || t.n < 3 ? '' : t.lift >= 0 ? 'up' : 'down'}>{t.lift === null || t.n < 3 ? '–' : `${t.lift >= 0 ? '+' : ''}${t.lift.toFixed(1)}%p`}</b>
            <span>{t.n < 10 ? '판이 적어 평균 쪽으로 보정' : `함께 ${t.n}판 기준`}</span>
          </div>
          <div className="duo-fig">
            <small>지금</small>
            <b className={t.streak > 0 ? 'up' : t.streak < 0 ? 'down' : ''}>{t.streak > 0 ? `${t.streak}연승` : t.streak < 0 ? `${-t.streak}연패` : '–'}</b>
            <span>함께 최고 {t.best}연승</span>
          </div>
          <div className="duo-fig">
            <small>함께할 때 KDA</small>
            <b>{t.kda ? <>{t.kda.me.toFixed(1)}<i>/</i>{t.kda.them.toFixed(1)}</> : '–'}</b>
            <span>{t.kda ? `나 / ${nick} · 평소 ${t.kda.meAvg?.toFixed(1) ?? '–'} / ${t.kda.themAvg?.toFixed(1) ?? '–'}` : '함께한 판이 쌓이면'}</span>
          </div>
          <div className="duo-fig">
            <small>맞대결</small>
            <b>{v.n ? <><em className="w">{v.w}</em><i>:</i><em className="l">{v.n - v.w}</em></> : '–'}</b>
            <span>{v.nemesis ? `${cn(v.nemesis.tc)}에게 ${v.nemesis.l}번 짐` : v.n ? `${v.n}번 맞붙음` : '만난 적 없음'}</span>
          </div>
        </div>

        {t.n > 0 && <div className="duo-line">
          <span className="duo-h">최근 함께한 판</span>
          <ol className="duo-tl">{t.recent.map((x, i) => <li key={i} className={x ? 'w' : 'l'} title={x ? '승' : '패'}><i />{x ? '승' : '패'}</li>)}</ol>
        </div>}

        <div className="duo-cols">
          <div>
            <span className="duo-h">최고의 조합 <small>내 챔프 + {nick}</small></span>
            {t.pairs.length ? <div className="duo-combos">{t.pairs.map((x) => (
              <div key={`${x.mc}-${x.tc}`} className="duo-combo">
                <span className="pics"><ChampImg id={x.mc} size={44} /><i>+</i><ChampImg id={x.tc} size={44} /></span>
                <span className="nm">{cn(x.mc)} · {cn(x.tc)}</span>
                <span className={`rec ${x.w * 2 >= x.n ? 'w' : 'l'}`}>{x.w}승 {x.n - x.w}패</span>
              </div>
            ))}</div> : <p className="meta">함께 이긴 조합이 여기에 모여요.</p>}
          </div>
          <div>
            <span className="duo-h">역할 궁합 <small>나 + {nick}</small></span>
            {t.roles.length ? <div className="duo-roles">{t.roles.map((r) => {
              const rate = r.w / r.n;
              return (
                <div key={`${r.mr}-${r.tr}`} className="duo-role">
                  <span className="rp"><i style={{ background: ROLE_COLOR[r.mr] }} />{ROLE_KO[r.mr]}<em>+</em><i style={{ background: ROLE_COLOR[r.tr] }} />{ROLE_KO[r.tr]}</span>
                  <span className="track"><span className={rate >= 0.5 ? 'w' : 'l'} style={{ width: `${Math.max(6, rate * 100)}%` }} /></span>
                  <b>{Math.round(rate * 100)}%</b><small>{r.n}판</small>
                </div>
              );
            })}</div> : <p className="meta">함께한 판이 쌓이면 어떤 역할끼리 잘 맞는지 보여요.</p>}
            <div className="duo-guess">
              <span className="duo-h">성향으로 본 궁합 <small>예상</small></span>
              {d.style ? <p><b>{LV[d.style.level]}</b>{d.style.reasons.length > 0 && <span> — {d.style.reasons.join(' · ')}</span>}</p> : <p className="meta">두 사람 모두 5판 이상 기록되면 보여요.</p>}
            </div>
          </div>
        </div>

        <div className="duo-report">
          <div className="dr-head">
            <span className="dr-badge">감독 리포트</span>
            <h3>더 잘 맞추려면</h3>
            <span className="meta">함께한 {t.n}판 분석 · 판이 쌓일수록 정확해져요</span>
          </div>
          {!coach.ready ? <p className="dr-wait">함께 {coach.need}판 더 하면 리포트가 열려요. 지금은 데이터를 모으는 중입니다.</p> : <>
            {coach.plan.length > 0 && <div className="dr-plan">
              <span className="k">다음 판 작전</span>
              <ol>{coach.plan.map((x, i) => <li key={x}><b>{i + 1}</b>{x}</li>)}</ol>
            </div>}
            <div className="dr-cols">
              {(['fix', 'good'] as const).map((tone) => {
                const list = coach.items.filter((x) => x.tone === tone);
                return (
                  <div key={tone} className={`dr-col ${tone}`}>
                    <span className="dr-ch"><i />{tone === 'fix' ? '보완점' : '강점'}<small>{list.length}</small></span>
                    {list.length ? list.map((x) => (
                      <article key={x.key} className="dr-item">
                        <b>{x.title}</b>
                        <span className="ev">{x.evidence}</span>
                        <p>{x.action}</p>
                      </article>
                    )) : <p className="meta">{tone === 'fix' ? '두드러진 약점이 아직 보이지 않아요.' : '판이 더 쌓이면 강점이 보여요.'}</p>}
                  </div>
                );
              })}
            </div>
          </>}
          {d.insights.length > 0 && <ul className="dr-brief">{d.insights.map((x) => <li key={x.text} className={x.tone}><i />{x.text}</li>)}</ul>}
        </div>
      </div>
    </section>
  );
}

/** 승률 고리 */
function Ring({ value, label, sub }: { value: number; label: string; sub: string }) {
  const r = 52, c = 2 * Math.PI * r;
  return (
    <span className="duo-ring">
      <svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r={r} className="bg" /><circle cx="60" cy="60" r={r} className="fg" strokeDasharray={`${c * value} ${c}`} /></svg>
      <span className="in"><b>{label}</b><small>{sub}</small></span>
    </span>
  );
}

// ───────── 프로필 꾸미기 ─────────

