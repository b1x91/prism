import { useEffect, useMemo, useState } from 'react';
import { ACTIVE_AUGMENTS, AUGMENT, AUGMENTS, CHAMPIONS, GAME_DATA, LEVEL_KO, RARITY_KO, augmentTraits, championsFor, guideOf, initials, pct, explainFit, gradeUp, rankFits, relatedAugments, topTie, type AugmentStats, type FitTier, type ChampionProfile, type Fit, type Rarity } from '@prism/core';
import { ChampImg } from './basics';
import { AugImg, Empty, Seg } from './basics';
import { Icon } from './icons';

const ORDER: Rarity[] = ['prismatic', 'gold', 'silver'];
type StatMap = Record<number, { n: number; w: number }>;
const toMap = (rows?: { id: number; n: number; w: number }[]): StatMap => Object.fromEntries((rows ?? []).map((r) => [r.id, r]));

function StatLine({ id, champ, all }: { id: number; champ: StatMap; all: StatMap }) {
  const c = champ[id], o = all[id];
  if (c?.n) return <span className="stat2">이 챔피언 <b>{pct(c.w, c.n)}</b> {c.n}판</span>;
  if (o?.n) return <span className="stat2">모임 <b>{pct(o.w, o.n)}</b> {o.n}판</span>;
  return null;
}

function GuideRow({ f, showLevel, compact, champ, all, stats }: { f: Fit; showLevel: boolean; compact?: boolean; champ: StatMap; all: StatMap; stats: boolean }) {
  const a = AUGMENT[f.id];
  if (!a) return null;
  return (
    <div className={`ga ${f.level}`}>
      <AugImg id={a.id} />
      <span className="nm" title={a.name}>{a.name}</span>
      {showLevel ? <span className={`lv ${f.level}`}>{LEVEL_KO[f.level]}</span> : <span />}
      <div className="why">
        {f.missing ? <b>{f.missing}</b> : f.reasons.map((r) => <span key={r}>{r}</span>)}
        {stats && <StatLine id={a.id} champ={champ} all={all} />}
      </div>
      {!compact && <details><summary>{a.note || '효과 보기'}</summary><p>{a.desc}</p></details>}
    </div>
  );
}

/** 챔피언 하나의 등급별 증강 궁합. stats 가 있으면 Prism 실전 승률을 붙인다 (회원 전용) */
export function AugmentGuide({ championId, stats, compact }: { championId: number; stats?: AugmentStats | null; compact?: boolean }) {
  const g = useMemo(() => guideOf(GAME_DATA, championId), [championId]);
  const [all, setAll] = useState(false);
  const [more, setMore] = useState<Record<Rarity, boolean>>({ prismatic: false, gold: false, silver: false });
  if (!g) return <Empty>챔피언 정보가 없습니다.</Empty>;
  const champ = toMap(stats?.champion), overall = toMap(stats?.overall);
  return (
    <div className="stack">
      {!compact && <div className="row"><Seg value={all ? 'all' : 'fit'} options={[['fit', '잘 맞는 것'], ['all', '전체 비교']]} onChange={(v) => setAll(v === 'all')} /></div>}
      <div className="gcols">
        {ORDER.map((r) => {
          const list = all && !compact ? g[r] : g[r].filter((f) => f.level === 'best');
          const limit = compact ? 4 : more[r] ? list.length : 8;
          return (
            <div key={r} className="card gcol">
              <h3><i className={`rbar ${r}`} />{RARITY_KO[r]}<span className="meta">잘 맞음 {g[r].filter((f) => f.level === 'best').length}개</span></h3>
              {list.slice(0, limit).map((f) => <GuideRow key={f.id} f={f} showLevel={all && !compact} compact={compact} champ={champ} all={overall} stats={Boolean(stats)} />)}
              {!list.length && <p className="meta">없음</p>}
              {!compact && list.length > limit && <button type="button" className="btn ghost sm" onClick={() => setMore({ ...more, [r]: true })}>{list.length - limit}개 더 보기</button>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const matchAug = (name: string, q: string) => { const t = q.trim().replace(/\s/g, ''); const n = name.replace(/\s/g, ''); return !t || n.includes(t) || initials(n).includes(t); };

/**
 * 증강 3개 비교: 게임 중 화면에 뜬 증강 3개를 직접 골라 넣으면 내 챔피언과의 어울림 순으로 보여준다.
 * 게임 화면을 읽지 않는다 (사용자가 고른다). 같은 등급끼리 뜨므로 등급 필터를 먼저 둔다.
 */
export function AugmentCompare({ championId, stats, preset }: { championId: number; stats?: AugmentStats | null; preset?: number[] }) {
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
  // 순서·티어·동순위는 게임 위 작은 창과 같은 계산
  const ranked = rankFits(c, picked.map((id) => AUGMENT[id]));
  const byId = new Map(ranked.map((f) => [f.id, f]));
  const tie = picked.length >= 2 ? topTie(ranked) : null;
  const top = picked.length >= 2 && !tie ? ranked[0] : null;
  const add = (id: number) => { if (picked.length < 3 && !picked.includes(id)) { setPicked([...picked, id]); setQ(''); } };
  return (
    <div className="stack">
      <div className="cmp-slots">
        {[0, 1, 2].map((i) => {
          const id = picked[i];
          const f = id ? byId.get(id) : undefined;
          if (!id || !f) return <div key={i} className="slot"><span className="ph">증강 {i + 1} 고르기</span></div>;
          return (
            <div key={i} className={`slot filled ${picked.length >= 2 && f.rank === 1 ? 'top' : ''}`}>
              <AugRing id={id} size={48} />
              <span className="nm">{AUGMENT[id].name}</span>
              <span className="why">{c && <Explain c={c} id={id} tier={f.tier} />}<GradeUp rarity={AUGMENT[id].rarity} tier={f.tier} /></span>
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
          <span className="muted">{AUGMENT[top.id].note}</span>
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
  const [r, setR] = useState<'all' | Rarity>('all');
  const list = ACTIVE_AUGMENTS.filter((a) => (r === 'all' || a.rarity === r) && (!q || matchAug(a.name, q) || a.desc.includes(q) || a.note.includes(q)))
    .sort((a, b) => ORDER.indexOf(a.rarity) - ORDER.indexOf(b.rarity) || a.name.localeCompare(b.name, 'ko'));
  return (
    <div className="stack">
      <div className="row wrapr">
        <input className="input" style={{ flex: 1, minWidth: 200 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름·효과 검색 (예: 치명타, 보호막, ㅂㅅ)" />
        <Seg value={r} options={[['all', '전체'], ...ORDER.map((x) => [x, RARITY_KO[x]] as [Rarity, string])]} onChange={setR} />
        <span className="meta">{list.length}개</span>
      </div>
      {list.length ? ORDER.filter((x) => list.some((a) => a.rarity === x)).map((x) => (
        <section key={x} className="stack" style={{ gap: 12 }}>
          <div className="dex-head"><i className={`rdot ${x}`} /><h3>{RARITY_KO[x]}</h3><span className="meta">{list.filter((a) => a.rarity === x).length}개</span></div>
          <div className="adex">
            {list.filter((a) => a.rarity === x).map((a) => (
              <button type="button" key={a.id} className="ai" onClick={() => onOpen?.(a.id)}><AugImg id={a.id} size={44} /><span className="nm"><i className={`rdot ${a.rarity}`} />{a.name}</span><span className="note2">{a.note}</span><p>{a.desc}</p></button>
            ))}
          </div>
        </section>
      )) : <Empty>찾는 증강이 없습니다.</Empty>}
    </div>
  );
}

/** 증강 상세: 설명, 성향·필요한 것, 잘 맞는 챔피언, 같은 성향 증강 (모두 게임 데이터 기준, 승률 없음) */
export function AugmentDetail({ id, onChampion, onAugment, onBack }: { id: number; onChampion?: (id: number) => void; onAugment?: (id: number) => void; onBack?: () => void }) {
  const a = AUGMENT[id];
  if (!a) return <Empty>없는 증강입니다.</Empty>;
  const t = augmentTraits(a);
  const champs = championsFor(a, CHAMPIONS, 18);
  const related = relatedAugments(a, AUGMENTS, 8);
  return (
    <div className="stack" style={{ gap: 16 }}>
      <section className={`card pad adet ${a.rarity}`}>
        <div className="adet-head">
          <AugImg id={a.id} size={72} />
          <div className="stack" style={{ gap: 8 }}>
            <div className="row wrapr" style={{ gap: 8 }}><span className={`rpill ${a.rarity}`}>{RARITY_KO[a.rarity]}</span>{a.disabled && <span className="pill">현재 꺼짐</span>}</div>
            <h1>{a.name}</h1>
            {a.note && <p className="note">{a.note}</p>}
          </div>
          {onBack && <button type="button" className="btn sm" onClick={onBack}>도감으로</button>}
        </div>
        <p className="desc">{a.desc}</p>
        {(t.prefs.length > 0 || t.reqs.length > 0) && <div className="row wrapr" style={{ gap: 8 }}>
          {t.prefs.map((x) => <span key={x} className="pill">{x}</span>)}
          {t.reqs.map((x) => <span key={x} className="pill warn">필요: {x}</span>)}
        </div>}
      </section>
      <section className="card pad">
        <div className="card-head"><h2>잘 맞는 챔피언</h2><span className="sp" /><span className="meta">잘 맞음 {champs.best}명 / {champs.total}명</span></div>
        {champs.list.length ? <div className="fit-champs">{champs.list.map((f) => (
          <button type="button" key={f.id} className="fc" onClick={() => onChampion?.(f.id)}>
            <ChampImg id={f.id} size={48} />
            <span className="nm">{CHAMPIONS[f.id]?.name}</span>
            <span className={`lv ${f.level}`}>{LEVEL_KO[f.level]}</span>
            <span className="why">{f.reasons.slice(0, 2).join(' · ')}</span>
          </button>))}</div> : <Empty>특별히 잘 맞는 챔피언이 없는 증강입니다.</Empty>}
        <p className="meta" style={{ margin: '16px 0 0' }}>챔피언 역할·피해 유형·스킬과 증강 효과를 맞춰 본 어울림입니다. 증강 자체의 세기와는 다를 수 있어요.</p>
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
  return <span className={`tier t-${tier}`} title="지금 챔피언과의 어울림 티어"><b>{tier}</b></span>;
}

/** S 티어가 제 등급을 넘을 때: 실버 → 골드급, 골드 → 프리즘급 */
export function GradeUp({ rarity, tier }: { rarity: Rarity; tier: FitTier }) {
  const up = gradeUp(rarity, tier);
  if (!up) return null;
  return <span className={`gradeup ${up}`}>이 챔피언에겐 {up === 'prismatic' ? '프리즘급' : '골드급'}</span>;
}

/** 원형 증강 아이콘 (등급 테두리) */
export function AugRing({ id, size = 40 }: { id: number; size?: number }) {
  return <span className={`aug-ring ${AUGMENT[id]?.rarity ?? ''}`} style={{ width: size, height: size }}><AugImg id={id} size={size - 6} /></span>;
}

/** 왜 맞는지 + 언제 더 좋은지 (C·D 티어에는 '언제'를 붙이지 않는다) */
export function Explain({ c, id, tier }: { c: ChampionProfile; id: number; tier: FitTier }) {
  const e = explainFit(c, AUGMENT[id]);
  return <><span className="ex-why">{e.why}</span>{e.when && (tier === 'S' || tier === 'A' || tier === 'B') && <span className="ex-when">{e.when}</span>}</>;
}
