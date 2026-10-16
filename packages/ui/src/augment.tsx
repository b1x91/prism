import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ACTIVE_AUGMENTS, AUGMENT, AUGMENTS, augIcon, augShift, CHAMPIONS, GAME_DATA, LEVEL_KO, RARITY_KO, augmentTraits, championsFor, guideOf, initials, pct, explainFit, fitOf, gradeUp, fitPoints, rankByPriority, rankFits, relatedAugments, tierOf, topTie, type AugmentStats, type FitTier, type Matchup, type ChampionProfile, type Fit, type Rarity } from '@prism/core';
import { ChampImg } from './basics';
import { FavMark, FavStar, useFavs } from './favs';
import { HeartIcon } from './likeheart';
import { ToolSearch } from './ltools';
import { AugImg, Empty, GlassBtn, Hover, Seg } from './basics';
import { Icon } from './icons';
import { MatchupBar } from './situation';


const ORDER: Rarity[] = ['prismatic', 'gold', 'silver'];
type StatMap = Record<number, { n: number; w: number }>;
const toMap = (rows?: { id: number; n: number; w: number }[]): StatMap => Object.fromEntries((rows ?? []).map((r) => [r.id, r]));

function StatLine({ id, champ, all }: { id: number; champ: StatMap; all: StatMap }) {
  const c = champ[id], o = all[id];
  if (c?.n) return <span className="stat2">이 챔프 <b>{pct(c.w, c.n)}</b> {c.n}판</span>;
  if (o?.n) return <span className="stat2">모임 <b>{pct(o.w, o.n)}</b> {o.n}판</span>;
  return null;
}

function GuideRow({ f, compact, champ, all, stats, c, cid }: { f: Fit; compact?: boolean; champ: StatMap; all: StatMap; stats: boolean; c: ChampionProfile; cid: number }) {
  const a = AUGMENT[f.id];
  if (!a) return null;
  const tier = tierOf(fitPoints(f));
  const e = explainFit(c, a);
  // 한 줄 이름 · 한 줄 이유. 효과 설명·'언제'는 마우스를 올리면 (설명 상자), 누르면 증강 상세
  return (
    <AugmentLink id={a.id} champion={cid} className={`ga t-${tier} ${compact ? 'cmp' : ''}`}>
      <AugRing id={a.id} size={40} />
      <span className="ga-main">
        <span className="nm"><FavMark kind="aug" id={a.id} inline /><span className="t">{a.name}</span><GradeUp rarity={a.rarity} tier={tier} /></span>
        <span className="ga-why">{e.why}</span>
      </span>
      <span className="ga-side"><TierBadge tier={tier} />{stats && <StatLine id={a.id} champ={champ} all={all} />}</span>
    </AugmentLink>
  );
}

/** 챔피언 하나의 등급별 증강 궁합 (어울림 티어 S~D 순). stats 가 있으면 Prism 실전 승률을 붙인다 (회원 전용) */
export function AugmentGuide({ championId, stats, compact }: { championId: number; stats?: AugmentStats | null; compact?: boolean }) {
  const g = useMemo(() => guideOf(GAME_DATA, championId), [championId]);
  const [all, setAll] = useState(false);
  const [more, setMore] = useState<Record<Rarity, boolean>>({ prismatic: false, gold: false, silver: false });
  const c = CHAMPIONS[championId];
  if (!g || !c) return <Empty>챔프 정보가 없습니다.</Empty>;
  const champ = toMap(stats?.champion), overall = toMap(stats?.overall);
  // 티어 점수 순 (같은 점수면 근거가 많은 쪽)
  const sorted = (r: Rarity) => [...g[r]].sort((x, y) => fitPoints(y) - fitPoints(x) || y.weight - x.weight);
  const good = (f: Fit) => { const t = tierOf(fitPoints(f)); return t === 'S' || t === 'A'; };
  return (
    <div className="stack">
      <div className="gcols">
        {ORDER.map((r) => {
          const list = all && !compact ? sorted(r) : sorted(r).filter(good);
          const limit = compact ? 4 : more[r] ? list.length : 6;
          return (
            <div key={r} className="card gcol">
              <h3 className={`gcol-h ${r}`}><i className={`rbar ${r}`} />{RARITY_KO[r]}<span className="meta">잘 맞는 증강 {g[r].filter(good).length}개</span></h3>
              {list.slice(0, limit).map((f) => <GuideRow key={f.id} f={f} compact={compact} champ={champ} all={overall} stats={Boolean(stats)} c={c} cid={championId} />)}
              {!list.length && <p className="meta">잘 맞는 증강이 없어요</p>}
              {!compact && list.length > limit && <button type="button" className="gcol-more" onClick={() => setMore({ ...more, [r]: true })}>{list.length - limit}개 더 보기<Icon name="arrow" /></button>}
            </div>
          );
        })}
      </div>
      {!compact && <button type="button" className="chip guide-all" onClick={() => setAll(!all)}>{all ? '잘 맞는 증강(S·A)만 보기' : 'B~D 티어까지 모든 증강 보기'}</button>}
    </div>
  );
}

const matchAug = (name: string, q: string) => { const t = q.trim().replace(/\s/g, ''); const n = name.replace(/\s/g, ''); return !t || n.includes(t) || initials(n).includes(t); };

/**
 * 증강 3개 비교: 게임 중 화면에 뜬 증강 3개를 직접 골라 넣으면 내 챔피언과의 어울림 순으로 보여준다.
 * 게임 화면을 읽지 않는다 (사용자가 고른다). 같은 등급끼리 뜨므로 등급 필터를 먼저 둔다.
 */
export function AugmentCompare({ championId, stats, preset, matchup: given, onMatchup, autoMatchup }: { championId: number; stats?: AugmentStats | null; preset?: number[]; matchup?: Matchup | null; onMatchup?: (m: Matchup) => void; autoMatchup?: boolean }) {
  // 조합: 앱은 자동으로 받은 것(고치면 onMatchup), 웹은 이 화면에서 직접 넣는다
  const [own, setOwn] = useState<Matchup>({ allies: [], enemies: [] });
  const matchup = given ?? own;
  const setMatchup = onMatchup ?? setOwn;
  const [rarity, setRarity] = useState<Rarity>('gold');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<number[]>([]);
  // 게임에서 자동으로 알아낸 증강이 오면 그대로 채운다
  const presetKey = (preset ?? []).join(',');
  useEffect(() => {
    if (!preset?.length) return;
    setPicked(preset.filter((id) => AUGMENT[id]).slice(0, 3));
    const r = AUGMENT[preset[0]]?.rarity;
    if (r) setRarity(r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetKey]);
  const c = CHAMPIONS[championId];
  const champ = toMap(stats?.champion), overall = toMap(stats?.overall);
  const pool = ACTIVE_AUGMENTS.filter((a) => a.rarity === rarity && matchAug(a.name, q)).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  // 순서·티어·동순위는 게임 위 작은 창과 같은 계산 (티어 = 어울림, 순위 = 어울림 + 이번 판 조합)
  const ranked = rankByPriority(c, picked.map((id) => AUGMENT[id]), matchup);
  const byId = new Map(ranked.map((f) => [f.id, f]));
  const tie = picked.length >= 2 ? topTie(ranked) : null;
  const top = picked.length >= 2 && !tie ? ranked[0] : null;
  const add = (id: number) => { if (picked.length < 3 && !picked.includes(id)) { setPicked([...picked, id]); setQ(''); } };
  return (
    <div className="stack">
      <MatchupBar me={championId} matchup={matchup} onChange={setMatchup} auto={autoMatchup} />
      <div className="cmp-slots">
        {[0, 1, 2].map((i) => {
          const id = picked[i];
          const f = id ? byId.get(id) : undefined;
          if (!id || !f) return <div key={i} className="slot"><span className="ph">증강 {i + 1} 고르기</span></div>;
          return (
            <div key={i} className={`slot filled ${picked.length >= 2 && f.rank === 1 ? 'top' : ''}`}>
              <AugRing id={id} size={48} />
              <span className="nm"><FavMark kind="aug" id={id} inline />{AUGMENT[id].name}</span>
              <span className="why">{c && <Explain c={c} id={id} tier={f.tier} />}<GradeUp rarity={AUGMENT[id].rarity} tier={f.tier} />
                {f.reasons.length > 0 && <span className={`situ ${f.bonus < 0 ? 'neg' : ''}`}>{f.lifted && f.rank === 1 && <b>이번 판 1순위</b>}{f.reasons[0]}</span>}</span>
              {picked.length >= 2 && <span className={`place p${f.rank}`}>{f.tied && <small>공동</small>}<b>{f.rank}</b><small>위</small></span>}
              <span className="rank"><TierBadge tier={f.tier} /></span>
              <button type="button" className="btn ghost sm x" onClick={() => setPicked(picked.filter((x) => x !== id))} aria-label="빼기"><Icon name="x" /></button>
            </div>
          );
        })}
      </div>
      {tie && (
        <div className="verdict">
          <span className="meta">{c?.name}에게는</span>
          <b>{tie.map((f) => AUGMENT[f.id].name).join(' · ')}</b>
          <span className="muted">모두 {tie[0].tier}티어이고 차이가 작아요. 원하는 쪽으로 고르세요.</span>
        </div>
      )}
      {top && (
        <div className="verdict">
          <span className="meta">{c?.name}에게는</span>
          <b>{AUGMENT[top.id].name}</b>
          <span className="muted">{top.lifted && top.reasons[0] ? `티어는 ${top.tier}지만 이번 판에선 더 중요해요 · ${top.reasons[0]}` : AUGMENT[top.id].note}</span>
          {stats && <StatLine id={top.id} champ={champ} all={overall} />}
        </div>
      )}
      <div className="card pad">
        <div className="row wrapr" style={{ marginBottom: 12 }}>
          <Seg value={rarity} options={ORDER.map((r) => [r, RARITY_KO[r]] as [Rarity, string])} onChange={(r) => { setRarity(r); setPicked([]); }} />
          <input className="input" style={{ flex: 1, minWidth: 180 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="증강 이름 (초성 가능)" onKeyDown={(e) => { if (e.key === 'Enter' && pool[0]) add(pool[0].id); }} />
          {picked.length > 0 && <button type="button" className="btn sm" onClick={() => setPicked([])}>비우기</button>}
        </div>
        <div className="aug-pick">
          {pool.map((a) => <button key={a.id} type="button" disabled={picked.length >= 3 || picked.includes(a.id)} onClick={() => add(a.id)}><AugImg id={a.id} size={28} />{a.name}</button>)}
        </div>
      </div>
    </div>
  );
}

export function AugmentDex({ onOpen }: { onOpen?: (id: number) => void }) {
  const [q, setQ] = useState('');
  // 등급 칩: 아무것도 고르지 않으면 전체, 고른 것을 다시 누르면 풀린다 (v3.27-3)
  const [r, setR] = useState<Rarity | null>(null);
  const [fav, setFav] = useState(false);
  const favs = useFavs();
  const hit = (a: (typeof ACTIVE_AUGMENTS)[number]) => (!fav || favs.augs.includes(a.id)) && (!q || matchAug(a.name, q) || a.desc.includes(q) || a.note.includes(q));
  const base = ACTIVE_AUGMENTS.filter(hit);
  const list = base.filter((a) => !r || a.rarity === r).sort((a, b) => ORDER.indexOf(a.rarity) - ORDER.indexOf(b.rarity) || a.name.localeCompare(b.name, 'ko'));
  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="ltools">
        <ToolSearch value={q} onChange={setQ} label="증강 검색" placeholder="이름·효과 (예: 치명타, 보호막)" />
        <div className="ltools-chips">
          {ORDER.map((x) => <button key={x} type="button" aria-pressed={r === x} className={`chip r-${x} ${r === x ? 'on' : ''}`} onClick={() => setR(r === x ? null : x)}><i className={`rdot ${x}`} />{RARITY_KO[x]}<small>{base.filter((a) => a.rarity === x).length}</small></button>)}
          {favs.connected && <button type="button" aria-pressed={fav} className={`chip ${fav ? 'on' : ''}`} onClick={() => setFav(!fav)}><HeartIcon size={13} />내 증강<small>{favs.augs.length}</small></button>}
        </div>
        <span className="ltools-cnt"><b>{list.length}</b>개</span>
      </div>
      {list.length ? ORDER.filter((x) => list.some((a) => a.rarity === x)).map((x) => (
        <section key={x} className="adx-sec">
          <div className={`adx-head ${x}`}><i className={`rdot ${x}`} /><h3>{RARITY_KO[x]}</h3><span className="meta">{list.filter((a) => a.rarity === x).length}개</span></div>
          <div className="adx">
            {list.filter((a) => a.rarity === x).map((a) => (
              <Hover key={a.id} className="adx-hov" tip={() => <AugmentTip id={a.id} link={Boolean(onOpen)} />}>
                <button type="button" className={`adx-t ${a.rarity}`} onClick={() => onOpen?.(a.id)}>
                  <AugRing id={a.id} size={44} />
                  <span className="adx-txt"><span className="nm"><FavMark kind="aug" id={a.id} inline />{a.name}</span><span className="note">{a.note}</span></span>
                </button>
              </Hover>
            ))}
          </div>
        </section>
      )) : <Empty>찾는 증강이 없습니다.</Empty>}
    </div>
  );
}

/** 증강 상세: 설명, 성향·필요한 것, 잘 맞는 챔피언, 같은 성향 증강 (모두 게임 데이터 기준, 승률 없음) */
export function AugmentDetail({ id, onChampion, onAugment, onBack, after }: { id: number; onChampion?: (id: number) => void; onAugment?: (id: number) => void; onBack?: () => void; after?: ReactNode }) {
  const a = AUGMENT[id];
  if (!a) return <Empty>없는 증강입니다.</Empty>;
  const t = augmentTraits(a);
  const champs = championsFor(a, CHAMPIONS, 18);
  const related = relatedAugments(a, AUGMENTS, 8);
  return (
    <div className="stack" style={{ gap: 16 }}>
      <section className={`adet ${a.rarity}`}>
        <div className="adet-stage">
          <AugRing id={a.id} size={96} />
          <div className="adet-txt">
            <div className="row wrapr" style={{ gap: 8 }}><span className={`rpill ${a.rarity}`}>{RARITY_KO[a.rarity]}</span>{a.disabled && <span className="pill">현재 꺼짐</span>}</div>
            <h1>{a.name}</h1>
            {a.note && <p className="note">{a.note}</p>}
          </div>
          {/* 오른쪽 위 구석: 좋아요 + 도감으로 */}
          <div className="adet-corner"><FavStar kind="aug" id={a.id} />{onBack && <GlassBtn icon="back" label="도감으로" onClick={onBack} />}</div>
        </div>
        <div className="adet-body">
          <p className="desc">{a.desc}</p>
          <div className="adet-facts">
            <span><b>{champs.best}</b><small>잘 맞는 챔프</small></span>
            <span><b>{related.length}</b><small>같은 성향 증강</small></span>
          </div>
          {(t.prefs.length > 0 || t.reqs.length > 0) && <div className="row wrapr" style={{ gap: 8 }}>
            {t.prefs.map((x) => <span key={x} className="pill">{x}</span>)}
            {t.reqs.map((x) => <span key={x} className="pill warn">필요: {x}</span>)}
          </div>}
        </div>
      </section>
      {after}
      <section className="card pad">
        <div className="card-head"><h2>잘 맞는 챔프</h2><span className="sp" /><span className="meta">잘 맞음 {champs.best} / {champs.total} 챔프</span></div>
        {champs.list.length ? <div className="fit-champs">{champs.list.map((f) => (
          <button type="button" key={f.id} className="fc" onClick={() => onChampion?.(f.id)}>
            <ChampImg id={f.id} size={48} />
            <span className="nm">{CHAMPIONS[f.id]?.name}</span>
            <span className={`lv ${f.level}`}>{LEVEL_KO[f.level]}</span>
            <span className="why">{f.reasons.slice(0, 2).join(' · ')}</span>
          </button>))}</div> : <Empty>특별히 잘 맞는 챔프가 없는 증강입니다.</Empty>}
        <p className="meta" style={{ margin: '16px 0 0' }}>챔프 역할·피해 유형·스킬과 증강 효과를 맞춰 본 어울림입니다. 증강 자체의 세기와는 다를 수 있어요.</p>
      </section>
      {related.length > 0 && <section className="card pad">
        <div className="card-head"><h2>같은 성향의 증강</h2><span className="sp" /><span className="meta">함께 노리면 빌드 방향이 맞아요</span></div>
        <div className="rel-augs">{related.map((x) => (
          <button type="button" key={x.id} className="ra" onClick={() => onAugment?.(x.id)}>
            <AugImg id={x.id} size={36} /><span className="nm"><i className={`rdot ${x.rarity}`} />{x.name}</span><span className="meta">{x.note}</span>
          </button>))}</div>
      </section>}
    </div>
  );
}

/** 어울림 티어 배지 (지금 챔피언과의 궁합, 승률 아님) */
export function TierBadge({ tier }: { tier: FitTier }) {
  return <span className={`tier t-${tier}`} title="지금 챔프와의 어울림 티어"><b>{tier}</b></span>;
}

/** S 티어가 제 등급을 넘을 때: 실버 → 골드급, 골드 → 프리즘급 */
export function GradeUp({ rarity, tier }: { rarity: Rarity; tier: FitTier }) {
  const up = gradeUp(rarity, tier);
  if (!up) return null;
  return <span className={`gradeup ${up}`}>이 챔프에겐 {up === 'prismatic' ? '프리즘급' : '골드급'}</span>;
}

/** 원형 증강 아이콘 (등급 테두리) */
export function AugRing({ id, size = 40 }: { id: number; size?: number }) {
  // 고리 안 어두운 원은 그대로 두고, 그 안의 무늬만 가운데로 옮긴다 (아이콘 그림마다 무늬 위치가 다르다)
  const [dx, dy] = augShift(id);
  return <span className={`aug-ring ${AUGMENT[id]?.rarity ?? ''}`} style={{ width: size, height: size }}><span className="aug-disc"><img className="aug" src={augIcon(id)} width={size - 6} height={size - 6} alt={AUGMENT[id]?.name ?? ''} loading="lazy" style={dx || dy ? { transform: `translate(${dx}%, ${dy}%)` } : undefined} /></span></span>;
}

/** 왜 맞는지 + 언제 더 좋은지 (C·D 티어에는 '언제'를 붙이지 않는다) */
export function Explain({ c, id, tier }: { c: ChampionProfile; id: number; tier: FitTier }) {
  const e = explainFit(c, AUGMENT[id]);
  return <><span className="ex-why">{e.why}</span>{e.when && (tier === 'S' || tier === 'A' || tier === 'B') && <span className="ex-when">{e.when}</span>}</>;
}

/** 증강 상세로 가는 길 (앱·웹이 각자 라우터로 넣어준다). 없으면 누를 수 없고 설명만 뜬다 */
export const AugmentOpen = createContext<((id: number) => void) | null>(null);

/** 받침 있으면 '과', 없으면 '와' */
const gwa = (w: string) => { const ch = w.charCodeAt(w.length - 1); return ch >= 0xac00 && ch <= 0xd7a3 && (ch - 0xac00) % 28 ? '과' : '와'; };

/** 증강에 마우스를 올렸을 때: 등급·짧은 설명·효과, 챔피언이 있으면 어울림 티어와 이유 */
export function AugmentTip({ id, champion, link }: { id: number; champion?: number | null; link?: boolean }) {
  const a = AUGMENT[id];
  if (!a) return <span>#{id}</span>;
  const c = champion ? CHAMPIONS[champion] : null;
  const tier = c ? tierOf(fitPoints(fitOf(c, a))) : null;
  return (
    <div className="atip">
      <div className="atip-head"><AugRing id={id} size={40} /><div><b>{a.name}</b><small className={a.rarity}>{RARITY_KO[a.rarity]}{a.note ? ` · ${a.note}` : ''}</small></div></div>
      {c && tier && <div className="atip-fit">
        <div className="atip-tier"><TierBadge tier={tier} /><span>{c.name}{gwa(c.name)} 어울림</span><GradeUp rarity={a.rarity} tier={tier} /></div>
        <Explain c={c} id={id} tier={tier} />
      </div>}
      {a.desc && <p className="atip-desc">{a.desc}</p>}
      {link && <span className="atip-more">눌러서 자세히 보기 →</span>}
    </div>
  );
}

/** 증강 한 줄을 감싼다: 올리면 설명, 누르면 증강 상세 */
export function AugmentLink({ id, champion, className = '', inline, children }: { id: number; champion?: number | null; className?: string; inline?: boolean; children: ReactNode }) {
  const open = useContext(AugmentOpen);
  return (
    <Hover className={`hov-aug ${inline ? 'inline' : ''}`} tip={() => <AugmentTip id={id} champion={champion} link={Boolean(open)} />}>
      {open ? <button type="button" className={`aug-link ${className}`} onClick={(e) => { e.stopPropagation(); open(id); }}>{children}</button> : <span className={`aug-link ${className}`}>{children}</span>}
    </Hover>
  );
}
