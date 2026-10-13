/**
 * 회원끼리 보는 화면: 랭킹, 회원 페이지(분석·나와의 시너지), 프로필 꾸미기. 웹·앱 공용.
 * 이동은 onOpen(회원 ID) 으로 화면 쪽에 맡긴다 (웹은 /members/:id, 앱은 #/members/:id).
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AUGMENT, CHAMPIONS, CHAMPION_LIST, ROLE_KO, RARITY_KO, SKIN_TIERS, TAG_KO, augmentHabits, baseSkin, cdragon, loadSkins, matchName, pct, shortDate, skinNeed, streakOf, styleOf, synergyOf,
  type Api, type Game, type MemberPage, type Ranking, type RankingRow, type Skin,
} from '@prism/core';
import { AugImg, ChampImg, Empty, Gem, MemberFace, Seg, useSkins } from './basics';
import { Icon } from './icons';
import { useLoad } from './crew';
import { RecentGames } from './game';

const ROLE_COLOR: Record<string, string> = { marksman: 'var(--spectrum-1)', fighter: 'var(--spectrum-2)', tank: 'var(--spectrum-4)', support: 'var(--spectrum-5)', mage: 'var(--spectrum-6)', assassin: 'var(--spectrum-7)' };
const TIER_KO = { admin: '관리자', member: '회원', guest: '새 회원' } as const;

// ───────── 랭킹 ─────────

type RankBy = 'games' | 'winrate' | 'month';

export function RankingView({ api, meId, onOpen }: { api: Api; meId?: string; onOpen: (id: string) => void }) {
  const [by, setBy] = useState<RankBy>('games');
  const { data, error } = useLoad<Ranking>(api, by === 'month' ? '/api/ranking?period=month' : '/api/ranking');
  const skins = useSkins();
  const rows = useMemo(() => {
    const r = (data?.rows ?? []).slice();
    if (by === 'winrate') return r.filter((x) => x.n >= (data?.minWinrate ?? 10)).sort((a, b) => b.w / b.n - a.w / a.n || b.n - a.n);
    return r.sort((a, b) => b.n - a.n || b.w - a.w);
  }, [data, by]);
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row wrapr"><Seg value={by} options={[['games', '판수'], ['winrate', '승률'], ['month', '이번 달']]} onChange={setBy} />
        <span className="meta">{by === 'winrate' ? `${data?.minWinrate ?? 10}판 이상 기록한 회원만` : by === 'month' ? '이번 달 판수' : '지금까지 기록된 판수'}</span></div>
      {error && <p className="l">{error}</p>}
      {data && !rows.length && <Empty>{by === 'winrate' ? '아직 조건을 채운 회원이 없습니다.' : '아직 기록된 판이 없습니다.'}</Empty>}
      {rows.length >= 3 && <div className="podium">{[1, 0, 2].map((i) => <Podium key={rows[i].id} r={rows[i]} rank={i + 1} by={by} skins={skins} onOpen={onOpen} />)}</div>}
      {rows.length > (rows.length >= 3 ? 3 : 0) && <div className="card rank-list">
        {rows.map((r, i) => (rows.length >= 3 && i < 3 ? null : <RankRow key={r.id} r={r} rank={i + 1} by={by} me={r.id === meId} skins={skins} onOpen={onOpen} />))}
      </div>}
    </div>
  );
}

function Podium({ r, rank, by, skins, onOpen }: { r: RankingRow; rank: number; by: RankBy; skins: Record<number, Skin> | null; onOpen: (id: string) => void }) {
  const art = r.skin && skins?.[r.skin] ? skins[r.skin].splash : r.mainChampion ? cdragon(CHAMPIONS[r.mainChampion]?.splash) : '';
  return (
    <button type="button" className={`pod p${rank}`} onClick={() => onOpen(r.id)}>
      {art && <img className="bg" src={art} alt="" loading="lazy" />}
      <span className="place">{rank === 1 && <Gem size={18} src="/brand/prism-32.png" />}{rank}위</span>
      <span className="nm">{r.nick}</span>
      <span className="st"><b>{by === 'winrate' ? pct(r.w, r.n) : `${r.n}판`}</b><span>{by === 'winrate' ? `${r.n}판` : `승률 ${pct(r.w, r.n)}`}</span></span>
    </button>
  );
}

function RankRow({ r, rank, by, me, skins, onOpen }: { r: RankingRow; rank: number; by: RankBy; me: boolean; skins: Record<number, Skin> | null; onOpen: (id: string) => void }) {
  return (
    <button type="button" className={`rank-row ${me ? 'me' : ''} ${rank === 1 ? 'first' : ''}`} onClick={() => onOpen(r.id)}>
      <span className="rk">{rank}</span>
      <MemberFace nick={r.nick} skin={r.skin} champion={r.mainChampion} skins={skins} size={40} />
      <span className="who"><b>{r.nick}</b>{r.mainChampion ? <span className="meta">주 챔피언 {CHAMPIONS[r.mainChampion]?.name}</span> : null}</span>
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
  if (error) return <Empty>{error}</Empty>;
  if (!data) return <p className="meta">불러오는 중…</p>;
  const { member: m, total } = data;
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
      <div className="banner mbanner">
        {art && <img className="bg" alt="" src={art} />}
        <div className="actions">{m.self && <button type="button" className="btn sm" onClick={() => setEdit(!edit)}>{edit ? '닫기' : '프로필 꾸미기'}</button>}{actions}</div>
        <div>
          <div className="eyebrow">{TIER_KO[m.tier]} · 판수 {data.rank}위 · {shortDate(m.joinedAt)} 가입</div>
          <h1>{m.nick}</h1>
          {m.intro && <p className="intro">{m.intro}</p>}
          {skin && <span className="pill dark">{skin.name}</span>}
        </div>
      </div>
      {edit && m.self && <ProfileEditor api={api} page={data} skins={skins} onSaved={() => { setEdit(false); reload(); }} />}
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
          <div className="card-head"><h2>주 챔피언</h2><span className="sp" /><span className="meta">만난 챔피언 {data.champions.length} / {Object.keys(CHAMPIONS).length}</span></div>
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
          <p className="meta" style={{ margin: 0 }}>앞라인 챔피언 {Math.round(S.front * 100)}% · {S.cc >= 2.3 ? 'CC 많은 챔피언 선호' : S.cc < 1.8 ? 'CC 적은 챔피언 위주' : 'CC 보통'}</p>
        </section>
      </div>}
      {picksN > 0 && <>
        <AugmentHabits data={data} />
        <section className="card pad">
          <div className="card-head"><h2>자주 고른 증강</h2><span className="sp" /><span className="meta">{picksN}회 선택</span></div>
          <div className="list cols2">{data.augments.slice(0, 8).map((a) => (
            <div key={a.id} className="item"><AugImg id={a.id} size={28} /><span className="title">{AUGMENT[a.id]?.name ?? `#${a.id}`}</span><span><b>{pct(a.w, a.n)}</b> <span className="meta">{a.n}회</span></span></div>))}</div>
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
        <div className="fc-row"><span className="k">챔피언에 잘 맞는 증강 (S·A)</span><span className="tr"><span style={{ width: p(f.good.n ? f.good.w / f.good.n : 0) }} /></span><b>{f.good.n ? pct(f.good.w, f.good.n) : '–'}</b><span className="meta">{f.good.n}개</span></div>
        <div className="fc-row rest"><span className="k">그 밖의 증강</span><span className="tr"><span style={{ width: p(f.rest.n ? f.rest.w / f.rest.n : 0) }} /></span><b>{f.rest.n ? pct(f.rest.w, f.rest.n) : '–'}</b><span className="meta">{f.rest.n}개</span></div>
        <p className="insight">{fitGap === null ? '양쪽 모두 5개 이상 쌓이면 차이를 알려드려요.' : fitGap >= 0.03 ? <>챔피언에 맞는 증강을 골랐을 때 <b className="w">{d(fitGap)}</b> 더 이겼어요. 가이드를 믿어도 좋아요.</> : fitGap <= -0.03 ? <>맞는 증강보다 <b>다른 증강을 골랐을 때</b> 더 이겼어요 ({d(-fitGap)}). 나만의 조합이 있는 편이에요.</> : <>어떤 증강을 골라도 승률 차이가 크지 않아요.</>}</p>
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

/** 나와의 시너지: 같이 한 판(사실)을 먼저, 성향 예상은 따로 표시 */
function SynergyCard({ data }: { data: MemberPage }) {
  const t = data.together ?? { n: 0, w: 0 }, v = data.against ?? { n: 0, w: 0 };
  const syn = data.viewer ? synergyOf(data.viewer.champions, data.champions) : null;
  const LV = { good: '잘 맞을 것 같아요', ok: '무난해요', weak: '서로 보완이 필요해요' } as const;
  return (
    <section className="card pad syn">
      <div className="card-head"><h2>나와의 시너지</h2></div>
      <div className="syn-grid">
        <div><span className="k">같은 팀으로</span><b className={t.n ? (t.w / t.n >= 0.5 ? 'w' : 'l') : ''}>{t.n ? pct(t.w, t.n) : '–'}</b><span className="meta">{t.n ? `${t.n}판 ${t.w}승` : '아직 같이 한 판이 없어요'}</span></div>
        <div><span className="k">상대 팀으로 (내 승률)</span><b>{v.n ? pct(v.w, v.n) : '–'}</b><span className="meta">{v.n ? `${v.n}판` : '맞붙은 적 없음'}</span></div>
        <div><span className="k">성향으로 본 궁합</span>{syn ? <><b>{LV[syn.level]}</b><span className="meta">{syn.reasons.join(' · ') || '특별히 겹치거나 비는 곳이 없음'}</span></> : <><b>–</b><span className="meta">두 사람 모두 5판 이상 기록되면 보여요</span></>}</div>
      </div>
    </section>
  );
}

// ───────── 프로필 꾸미기 ─────────

function ProfileEditor({ api, page, skins, onSaved }: { api: Api; page: MemberPage; skins: Record<number, Skin> | null; onSaved: () => void }) {
  const m = page.member;
  const [nick, setNick] = useState(m.nick);
  const [intro, setIntro] = useState(m.intro);
  const [pick, setPick] = useState<number | null>(m.skin);
  const [champ, setChamp] = useState<number | null>(m.skin ? Math.floor(m.skin / 1000) : page.champions[0]?.id ?? null);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');
  const n = page.total.n;
  const list = useMemo(() => (skins && champ ? Object.values(skins).filter((s) => s.championId === champ).sort((a, b) => a.tier - b.tier || a.id - b.id) : []), [skins, champ]);
  const champs = useMemo(() => CHAMPION_LIST.filter((c) => !q || matchName(c.name, q)).slice(0, q ? 24 : 0), [q]);
  const next = SKIN_TIERS.find((t) => t.need > n);
  const save = async () => {
    setMsg('');
    try { await api.post('/api/me/profile', { nick, intro, skin: pick }); onSaved(); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <section className="card pad stack" style={{ gap: 16 }}>
      <div className="card-head" style={{ margin: 0 }}><h2>프로필 꾸미기</h2><span className="sp" /><span className="meta">기록된 {n}판{next ? ` · ${next.need}판이 되면 ${next.name} 스킨` : ' · 모든 스킨 사용 가능'}</span></div>
      <div className="grid2">
        <label className="field"><span className="k">닉네임</span><input className="input" maxLength={20} value={nick} onChange={(e) => setNick(e.target.value)} /></label>
        <label className="field"><span className="k">한 줄 소개</span><input className="input" maxLength={60} value={intro} onChange={(e) => setIntro(e.target.value)} placeholder="예: 탱커 좋아합니다" /></label>
      </div>
      <div className="tiers">{SKIN_TIERS.map((t) => <span key={t.name} className={`pill ${n >= t.need ? 'ok' : ''}`}>{t.name} {t.need ? `${t.need}판` : '바로'}</span>)}</div>
      <div className="row wrapr" style={{ gap: 8 }}>
        <span className="k">챔피언</span>
        {champ && <span className="pill accent"><ChampImg id={champ} size={18} />{CHAMPIONS[champ]?.name}</span>}
        {page.champions.slice(0, 6).filter((c) => c.id !== champ).map((c) => <button key={c.id} type="button" className="pill btnlike" onClick={() => setChamp(c.id)}><ChampImg id={c.id} size={18} />{CHAMPIONS[c.id]?.name}</button>)}
        <input className="input sm" style={{ maxWidth: 200 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="다른 챔피언 (초성 가능)" />
      </div>
      {champs.length > 0 && <div className="row wrapr" style={{ gap: 8 }}>{champs.map((c) => <button key={c.id} type="button" className="pill btnlike" onClick={() => { setChamp(c.id); setQ(''); }}><ChampImg id={c.id} size={18} />{c.name}</button>)}</div>}
      {!skins ? <p className="meta">스킨 불러오는 중…</p> : champ && (
        <div className="skin-grid">
          {list.map((s) => {
            const need = skinNeed(s.tier), locked = n < need;
            return (
              <button key={s.id} type="button" className={`skin ${pick === s.id ? 'on' : ''} ${locked ? 'locked' : ''} t${s.tier}`} disabled={locked} onClick={() => setPick(s.id)} title={locked ? `${SKIN_TIERS[s.tier].name} · ${need}판부터` : s.name}>
                <img src={s.tile} alt="" loading="lazy" />
                <span className="nm">{s.id === baseSkin(champ) ? '기본' : s.name}</span>
                <span className="tg">{locked ? <><Icon name="lock" />{need}판</> : SKIN_TIERS[s.tier].name}</span>
              </button>
            );
          })}
        </div>
      )}
      <div className="row"><button type="button" className="btn primary" onClick={save}>저장</button>{pick && <button type="button" className="btn ghost" onClick={() => setPick(null)}>스킨 빼기</button>}{msg && <span className="l">{msg}</span>}</div>
    </section>
  );
}
