/**
 * 도감 (포켓몬 도감 방식) + 마스터 여정.
 * 해 봤다고 채워지지 않는다: 실버(1판) → 골드(3승) → 플래티넘 → 다이아몬드 → 마스터 (S티어 증강 경험·5/10/30/50승·역할 챌린지).
 * 못 만난 것은 번호와 흐린 그림(???). 누르면 도감 설명과 다음 목표.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ACTIVE_AUGMENTS, AUGMENT, CHAMPIONS, cdragon, RARITY_KO, ROLE_KO, augMastery, champMastery, CHALLENGE_ROLE_KO, dexFromGames, dexFromRows, initials, mergeDex, pct, type Api, type Dex, type DexEntry, type DexRows, type Game, type Goal, type Mastery, type Rarity, dexLevel, DEX_LEVEL_KO, DEX_LEVEL_RULE, type DexLevel, dexXpOf, DEX_XP } from '@prism/core';
import { ChampImg, Gem, Select, Seg } from './basics';
import { AugRing, AugmentLink } from './augment';
import { Icon } from './icons';

/** 서버에 기록된 내 모든 판 + (앱이면) 이 PC 롤 기록을 합친 도감 */
export function useDex(api: Api | null, games: Game[] = []) {
  const [rows, setRows] = useState<Dex | null>(null);
  const [loading, setLoading] = useState(Boolean(api));
  useEffect(() => {
    if (!api) { setLoading(false); return; }
    let on = true;
    api.get<DexRows>('/api/me/dex').then((r) => on && setRows(dexFromRows(r))).catch(() => {}).finally(() => on && setLoading(false));
    return () => { on = false; };
  }, [api]);
  const dex = useMemo(() => { const local = dexFromGames(games); return rows ? mergeDex(rows, local) : local; }, [rows, games]);
  return { dex, loading };
}

type Kind = 'champions' | 'augments';
/** 전체 · 내 도감(모두 / 레벨 1~5) · 아직 안 해봄 */
type Show = 'all' | 'mine' | 'l1' | 'l2' | 'l3' | 'l4' | 'l5' | 'missing';
type Sort = 'no' | 'progress' | 'most' | 'recent';

const RARITY_ORDER: Rarity[] = ['silver', 'gold', 'prismatic'];
const CHAMP_IDS = Object.keys(CHAMPIONS).map(Number).sort((a, b) => a - b);
const AUG_IDS = [...ACTIVE_AUGMENTS].sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity) || a.id - b.id).map((a) => a.id);
const NO = (i: number) => `No.${String(i + 1).padStart(3, '0')}`;
const NEW_MS = 3 * 24 * 3600_000;
const day = (t: number) => { const d = new Date(t); return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`; };

/** 진척도 배지 (마스터 여정 전체 비율) */
const BADGES: [number, string][] = [[10, '첫 발자국'], [25, '탐험가'], [50, '수집가'], [75, '박사'], [100, '도감 마스터']];

const nameOf = (kind: Kind, id: number) => (kind === 'champions' ? CHAMPIONS[id]?.name : AUGMENT[id]?.name) ?? `#${id}`;
const match = (name: string, q: string) => { const t = q.replace(/\s/g, ''); const n = name.replace(/\s/g, ''); return n.includes(t) || initials(n).includes(t); };
const stageOf = (m: Mastery) => DEX_LEVEL_KO[dexLevel(m)];
const stageKey = (m: Mastery) => (m.master ? 'master' : m.caught ? 'caught' : m.seen ? 'seen' : 'unk');

export function DexView({ dex, onChampion, onAugment, loading, xpRate = 1 }: { dex: Dex; onChampion?: (id: number) => void; onAugment?: (id: number) => void; loading?: boolean; xpRate?: number }) {
  const [kind, setKind] = useState<Kind>('champions');
  const [show, setShow] = useState<Show>('all');
  const [sort, setSort] = useState<Sort>('no');
  const [group, setGroup] = useState<string>('all');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Record<Kind, number | null>>({ champions: null, augments: null });
  const [sheet, setSheet] = useState(false); // 좁은 화면: 고르면 아래에서 설명이 올라온다
  const entry = useRef<HTMLElement>(null);
  // 옆 설명 칸: 칸 안에 따로 스크롤을 두지 않는다. 페이지와 함께 내려가다가 칸의 끝이 화면 아래에 닿으면 멈춘다
  // (칸이 화면보다 길면 top 을 음수로 — 어느 위치에서든 끝까지 볼 수 있다)
  useEffect(() => {
    const el = entry.current;
    if (!el) return;
    const fit = () => {
      el.style.top = '';
      const cs = getComputedStyle(el);
      if (cs.position !== 'sticky') return;
      let sp: HTMLElement | null = el.parentElement;
      while (sp && !/(auto|scroll)/.test(getComputedStyle(sp).overflowY)) sp = sp.parentElement;
      const view = sp ? sp.clientHeight : innerHeight;
      const base = parseFloat(cs.top) || 0;
      const gap = 16;
      el.style.top = `${Math.min(base, view - el.offsetHeight - gap)}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    addEventListener('resize', fit);
    return () => { ro.disconnect(); removeEventListener('resize', fit); };
  }, []);

  const ids = kind === 'champions' ? CHAMP_IDS : AUG_IDS;
  const got = dex[kind];
  const ms = useMemo(() => new Map(ids.map((id) => [id, kind === 'champions' ? champMastery(id, got[id], dex.pairs, dex.challenges ?? null) : augMastery(id, got[id], dex.pairs)])), [ids, kind, got, dex.pairs, dex.challenges]);
  const no = useMemo(() => new Map(ids.map((id, i) => [id, i])), [ids]);
  const m = (id: number) => ms.get(id)!;
  const now = Date.now();
  // 도감 경험치: 챔프·증강 모두 (보고 있는 쪽과 상관없이)
  const xp = useMemo(() => {
    const cm = CHAMP_IDS.filter((id) => dex.champions[id]).map((id) => champMastery(id, dex.champions[id], dex.pairs, dex.challenges ?? null));
    const am = AUG_IDS.filter((id) => dex.augments[id]).map((id) => augMastery(id, dex.augments[id], dex.pairs));
    return dexXpOf([...Object.values(dex.champions), ...Object.values(dex.augments)], [...cm, ...am], xpRate);
  }, [dex, xpRate]);

  const seen = ids.filter((id) => m(id).seen).length;
  const caught = ids.filter((id) => m(id).caught).length;
  const masters = ids.filter((id) => m(id).master).length;
  const levelCount = (l: DexLevel) => ids.filter((id) => dexLevel(m(id)) === l).length;
  const goalsDone = ids.reduce((s, id) => s + m(id).done, 0), goalsAll = ids.reduce((s, id) => s + m(id).total, 0);
  const rate = goalsAll ? Math.floor((goalsDone / goalsAll) * 100) : 0;
  const next = BADGES.find(([p]) => rate < p);

  const groups: [string, string][] = kind === 'champions'
    ? Object.entries(ROLE_KO)
    : RARITY_ORDER.map((r) => [r, RARITY_KO[r]] as [string, string]);
  const groupOf = (id: number) => (kind === 'champions' ? CHAMPIONS[id]?.roles[0] : AUGMENT[id]?.rarity);
  const groupCount = (g: string) => { const all = ids.filter((id) => g === 'all' || groupOf(id) === g); return [all.filter((id) => m(id).caught).length, all.length]; };

  const list = ids.filter((id) => {
    const x = m(id);
    if (group !== 'all' && groupOf(id) !== group) return false;
    if (show === 'mine' && !x.seen) return false;
    if (show.startsWith('l') && dexLevel(x) !== Number(show.slice(1))) return false;
    if (show === 'missing' && x.seen) return false;
    const t = q.trim();
    if (!t) return true;
    if (/^\d+$/.test(t)) return String((no.get(id) ?? 0) + 1).includes(t);
    return x.seen && match(nameOf(kind, id), t);
  });
  const byNo = (a: number, b: number) => no.get(a)! - no.get(b)!;
  if (sort === 'progress') list.sort((a, b) => m(b).done - m(a).done || (got[b]?.w ?? 0) - (got[a]?.w ?? 0) || byNo(a, b));
  if (sort === 'most') list.sort((a, b) => (got[b]?.n ?? 0) - (got[a]?.n ?? 0) || byNo(a, b));
  if (sort === 'recent') list.sort((a, b) => (got[b]?.first ?? 0) - (got[a]?.first ?? 0) || byNo(a, b));

  // 처음 보이는 설명: 마스터에 가장 가까운 것 (없으면 최근에 만난 것)
  const closest = ids.filter((id) => m(id).seen && !m(id).master).sort((a, b) => m(b).done - m(a).done || (got[b]?.w ?? 0) - (got[a]?.w ?? 0))[0];
  const current = sel[kind] ?? closest ?? ids.find((id) => m(id).seen) ?? ids[0];
  const pick = (id: number) => { setSel({ ...sel, [kind]: id }); setSheet(true); };
  const what = kind === 'champions' ? '챔프' : '증강';

  return (
    <div className="dex">
      <header className="dex-device">
        <span className="dex-lens" aria-hidden="true"><Gem size={44} /></span>
        <div className="dex-title">
          <h1>도감</h1>
          <Seg value={kind} options={[['champions', '챔프'], ['augments', '증강']]} onChange={(k) => { setKind(k); setGroup('all'); setQ(''); setShow('all'); }} />
          <div className="dex-xp" title={`판 +${DEX_XP.game} · 승리 +${DEX_XP.win} · 이룬 목표 +${DEX_XP.goal} · 마스터 +${DEX_XP.master}`}>
            <span className="lv">Lv.{xp.level}</span>
            <span className="bar"><span style={{ width: `${Math.max(2, Math.round(xp.pct * 100))}%` }} /></span>
            <span className="num">{xp.cur.toLocaleString()}<small> / {xp.need.toLocaleString()} XP</small></span>
            {xp.rate > 1 && <span className="rate">경험치 ×{xp.rate}</span>}
          </div>
        </div>
        <div className="dex-count">
          <span className="k">마스터 여정</span>
          <b>{rate}<small>%</small></b>
          <span className="dex-bar" role="progressbar" aria-valuenow={rate} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${(goalsDone / Math.max(goalsAll, 1)) * 100}%` }} /></span>
          <div className="dex-tally">
            <span><i className="dst seen" />해 본 것 <b>{seen}</b></span>
            <span><Crystal />골드 이상 <b>{caught}</b></span>
            <span><PrismMark />마스터 <b>{masters}</b></span>
            <span className="of">/ {ids.length}</span>
          </div>
          <span className="meta">{loading ? '기록 불러오는 중…' : next ? `다음 배지 '${next[1]}'까지 ${next[0] - rate}%` : '도감을 완성했어요!'}</span>
        </div>
        <div className="dex-badges">{BADGES.map(([p, l]) => <span key={p} className={`dex-badge ${rate >= p ? 'on' : ''}`} title={`마스터 여정 ${p}%`}><i />{l}<small>{p}%</small></span>)}</div>
      </header>

      {/* 내 도감(레벨 1~5) · 아직 안 해봄. 아무것도 고르지 않으면 전체, 고른 것을 다시 누르면 풀린다 */}
      <nav className="dex-levels" aria-label="도감 보기">
        <button type="button" aria-pressed={show === 'mine'} className={`dlt mine ${show === 'mine' ? 'on' : ''}`} onClick={() => setShow(show === 'mine' ? 'all' : 'mine')} title="만난 것 모두">
          <b>{seen}</b><span>내 도감</span>
        </button>
        <span className="dlt-tiers">{([1, 2, 3, 4, 5] as DexLevel[]).map((l) => (
          <button key={l} type="button" aria-pressed={show === `l${l}`} className={`dlt l${l} ${show === `l${l}` ? 'on' : ''}`} onClick={() => setShow(show === `l${l}` ? 'all' : (`l${l}` as Show))} title={`Lv.${l} ${DEX_LEVEL_KO[l]} · ${DEX_LEVEL_RULE[l]}`}>
            <i className="gem" aria-hidden="true" /><b>{levelCount(l)}</b><span>{DEX_LEVEL_KO[l]}</span>
          </button>
        ))}</span>
        <button type="button" aria-pressed={show === 'missing'} className={`dlt miss ${show === 'missing' ? 'on' : ''}`} onClick={() => setShow(show === 'missing' ? 'all' : 'missing')} title="아직 한 번도 안 해 본 것">
          <b>{ids.length - seen}</b><span>아직 안 해봄</span>
        </button>
      </nav>

      <div className="dex-body">
        <section className="dex-list card">
          <div className="dex-tools">
            <label className="dex-search"><Icon name="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="만난 것 이름 또는 번호" /></label>
            <Select label="정렬" value={sort} onChange={setSort} options={[['no', '번호순'], ['progress', '진척도순'], ['most', '많이 한 순'], ['recent', '최근 만난 순']]} />
          </div>
          {/* 유형: 아무것도 고르지 않으면 전체. 고른 것을 다시 누르면 풀린다 */}
          <div className="dex-groups" role="group" aria-label="유형">{groups.map(([g, l]) => { const [f, t] = groupCount(g); return <button key={g} type="button" aria-pressed={group === g} className={`chip ${group === g ? 'on' : ''}`} onClick={() => setGroup(group === g ? 'all' : g)} title={group === g ? '다시 누르면 전체' : '골드 이상 / 전체'}>{l}<small>{f}/{t}</small></button>; })}</div>
          {list.length ? <div className={`dex-grid ${kind}`}>{list.map((id) => {
            const x = m(id), e = got[id];
            const fresh = e && now - e.first < NEW_MS;
            return (
              <button key={id} type="button" className={`dx ${stageKey(x)} ${current === id ? 'sel' : ''} ${kind === 'augments' ? AUGMENT[id]?.rarity ?? '' : ''}`} onClick={() => pick(id)} aria-label={x.seen ? `${nameOf(kind, id)} ${stageOf(x)} ${x.done}/${x.total}` : `${NO(no.get(id)!)} 아직 안 해봄`}>
                <span className="no">{NO(no.get(id)!)}</span>
                {fresh && !x.caught && <span className="new">NEW</span>}
                {x.master ? <span className="mark" role="img" aria-label="마스터" title={`마스터 · 목표 ${x.total}개 모두 달성`}><PrismMark size={18} /></span> : x.caught && <span className="mark" role="img" aria-label="골드" title="골드 · 3승 달성"><Crystal size={16} /></span>}
                <span className="pic">{kind === 'champions' ? <ChampImg id={id} size={56} /> : <AugRing id={id} size={56} />}{!x.seen && <i className="q" aria-hidden="true">?</i>}</span>
                <span className="nm">{x.seen ? nameOf(kind, id) : '???'}</span>
                <Pips m={x} />
              </button>
            );
          })}</div> : <p className="meta dex-none">{q ? '만난 것 중에 맞는 이름이 없어요.' : show === 'missing' ? `모든 ${what}을 만났어요!` : show.startsWith('l') ? `아직 ${DEX_LEVEL_KO[Number(show.slice(1)) as DexLevel]} 단계인 것이 없어요.` : '아직 없어요. 한 판 하고 오면 채워져요.'}</p>}
        </section>

        {sheet && <button type="button" className="dex-scrim" aria-label="닫기" onClick={() => setSheet(false)} />}
        <aside ref={entry} className={`dex-entry card ${sheet ? 'open' : ''}`} aria-live="polite">
          <button type="button" className="dex-close icon-btn" aria-label="닫기" onClick={() => setSheet(false)}><Icon name="x" /></button>
          {kind === 'champions'
            ? <ChampEntry id={current} no={no.get(current) ?? 0} e={got[current]} m={m(current)} dex={dex} onChampion={onChampion} />
            : <AugEntry id={current} no={no.get(current) ?? 0} e={got[current]} m={m(current)} dex={dex} onAugment={onAugment} onChampion={onChampion} />}
        </aside>
      </div>
    </div>
  );
}

/** 칸 아래 작은 여정 표시: 특별 목표(◆) + 승리 목표 + 역할 챌린지 (관문은 보석 모양) */
function Pips({ m }: { m: Mastery }) {
  return (
    <span className="pips" title={`${m.done}/${m.total}`}>
      {m.goals.filter((g) => !g.off).map((g) => <i key={g.key} className={`pip ${g.key === 'special' ? 's' : ''} ${g.role ? 'r' : ''} ${g.gate ? 'g' : ''} ${g.done ? 'on' : ''}`} />)}
    </span>
  );
}

const nextText = (g: Goal) => (g.key === 'special' || g.role ? `${g.label}${g.target > 1 && g.cur > 0 ? ` (${g.cur}/${g.target})` : ''}` : `${g.label}까지 ${g.target - g.cur}승`);

function Journey({ m, specialList }: { m: Mastery; specialList: ReactNode }) {
  const base = m.goals.filter((g) => !g.role), role = m.goals.filter((g) => g.role);
  const step = (g: Goal) => g.role ? (
    // 역할 도전: 이름·횟수 한 줄 → 설명 → 막대 (좁은 칸에서도 줄바꿈이 흐트러지지 않게)
    <li key={g.key} className={`rl ${g.done ? 'done' : ''} ${m.next === g ? 'next' : ''} ${g.gate ? 'gate' : ''} ${g.off ? 'off' : ''}`}>
      <span className="jc" aria-hidden="true">{g.done ? <Icon name="check" /> : g.gate ? <PrismMark size={14} /> : ''}</span>
      <span className="jl">{g.gate && <em>마스터 관문</em>}<b>{g.label}</b></span>
      <span className="jv">{g.cur}/{g.target}</span>
      {g.hint && <small className="jhint">{g.off ? '아직 이 기록을 받지 못했어요 · 마스터 조건에서 빠져요' : g.hint}</small>}
      <span className="jbar"><span style={{ width: `${(g.cur / g.target) * 100}%` }} /></span>
    </li>
  ) : (
    <li key={g.key} className={`${g.key === 'special' ? 'sp' : ''} ${g.done ? 'done' : ''} ${m.next === g ? 'next' : ''}`}>
      <span className="jc" aria-hidden="true">{g.done ? <Icon name="check" /> : g.key === 'special' ? '◆' : ''}</span>
      <span className="jl">{g.label}</span>
      {g.key === 'special'
        ? <span className="jv">{m.special.tried.length}/{m.special.ids.length} 경험</span>
        : <><span className="jbar"><span style={{ width: `${(g.cur / g.target) * 100}%` }} /></span><span className="jv">{g.cur}/{g.target}</span></>}
    </li>
  );
  return (
    <div className="journey">
      <div className="jh"><span className="k">마스터 여정</span><b>{m.done}<small>/{m.total}</small></b>
        {m.next && <span className="jnext">다음 목표 · {nextText(m.next)}</span>}
        {m.master && <span className="jnext master">마스터 달성</span>}
      </div>
      <ol className="jsteps">{base.map(step)}</ol>
      {role.length > 0 && <>
        <div className="jrole"><span className="k">{m.role ? `${CHALLENGE_ROLE_KO[m.role]} 챌린지` : '역할 챌린지'}</span><span className="meta">관문까지 넘어야 마스터</span></div>
        <ol className="jsteps">{role.map(step)}</ol>
      </>}
      {specialList}
    </div>
  );
}

/**
 * 마스터 무대: 정복한 챔피언·증강의 설명 머리. 어두운 무대 + 그 챔피언 그림 + 도는 스펙트럼 빛무리·빛살·반짝임.
 * 처음 열 때(이 기기에서 한 번) 섬광 → 빛 터짐 → '정복' 도장이 찍힌다. 그림을 누르면 다시 볼 수 있다. 동작 줄이기면 멈춘 그림만.
 */
const SEEN_KEY = 'prism-dex-conquered';
function MasterStage({ kind, id, no, name, sub, e, m, art, pic }: { kind: Kind; id: number; no: number; name: string; sub: ReactNode; e?: DexEntry; m: Mastery; art?: string; pic: ReactNode }) {
  const key = `${kind}:${id}`;
  const [play, setPlay] = useState(0);
  useEffect(() => {
    let seen: string[] = [];
    try { seen = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]'); } catch { /* 저장소 없음 */ }
    if (!seen.includes(key)) {
      setPlay((x) => x + 1);
      try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, key].slice(-500))); } catch { /* 저장소 없음 */ }
    }
  }, [key]);
  const sparks = useMemo(() => Array.from({ length: 14 }, (_, i) => ({ x: (i * 37 + 11) % 100, y: (i * 53 + 7) % 100, d: (i % 7) * 0.45, s: 4 + (i % 3) * 2 })), []);
  return (
    <div className={`mstage ${play ? 'intro' : ''}`} key={`${key}-${play}`}>
      {art && <img className="ms-art" src={art} alt="" />}
      <span className="ms-rays" aria-hidden="true" />
      <span className="ms-halo" aria-hidden="true" />
      {sparks.map((p, i) => <i key={i} className="ms-spark" aria-hidden="true" style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.s, height: p.s, animationDelay: `${p.d}s` }} />)}
      {play > 0 && <><span className="ms-flash" aria-hidden="true" /><span className="ms-burst" aria-hidden="true" /></>}
      <button type="button" className="ms-pic" onClick={() => setPlay((x) => x + 1)} title="정복 순간 다시 보기">{pic}</button>
      <div className="ms-title">
        <span className="ms-kicker"><PrismMark size={16} />MASTER · {NO(no)}</span>
        <h2>{name}</h2>
        <div className="ms-sub">{sub}</div>
        <span className="ms-stamp" aria-hidden="true">정복</span>
        <p className="ms-line">목표 {m.total}개 모두 달성{e ? ` · ${e.n}판 ${e.w}승` : ''} · 장인으로 이름이 올랐어요</p>
      </div>
    </div>
  );
}

function Stats({ e }: { e: DexEntry }) {
  return (
    <div className="dxe-stats">
      <div><span className="k">함께한 판</span><b>{e.n}</b></div>
      <div><span className="k">승리 · 승률</span><b>{e.w}<small> · {pct(e.w, e.n)}</small></b></div>
      <div><span className="k">처음 만난 날</span><b className="d">{day(e.first)}</b></div>
      <div><span className="k">최근</span><b className="d">{day(e.last)}</b></div>
    </div>
  );
}

function StageTag({ m }: { m: Mastery }) {
  return <span className={`stage-tag ${stageKey(m)} lv${dexLevel(m)}`}>{m.master ? <PrismMark size={14} /> : m.caught ? <Crystal size={12} /> : null}{m.seen && <small>Lv.{dexLevel(m)}</small>}{stageOf(m)}</span>;
}

function ChampEntry({ id, no, e, m, dex, onChampion }: { id: number; no: number; e?: DexEntry; m: Mastery; dex: Dex; onChampion?: (id: number) => void }) {
  const c = CHAMPIONS[id];
  if (!c) return null;
  const types = [ROLE_KO[c.roles[0]], c.roles[1] && ROLE_KO[c.roles[1]]].filter(Boolean) as string[];
  const augs = dex.pairs.filter((p) => p.champ === id).sort((a, b) => b.n - a.n).slice(0, 5);
  const flavor = `${c.range === 'ranged' ? '원거리' : '근접'} ${types[0] ?? ''}. ${c.damage === 'MIX' ? '물리·마법 피해를 섞어' : c.damage === 'AP' ? '마법 피해로' : c.damage === 'AD' ? '물리 피해로' : ''} 싸운다.`;
  // S티어 증강: 써 본 것 먼저, 그다음 아직 못 써 본 것
  const tried = new Set(m.special.tried);
  const sList = [...m.special.ids].sort((a, b) => Number(tried.has(b)) - Number(tried.has(a)) || RARITY_ORDER.indexOf(AUGMENT[b].rarity) - RARITY_ORDER.indexOf(AUGMENT[a].rarity)).slice(0, 12);
  return (
    <div className={`dxe ${stageKey(m)}`}>
      {m.master
        ? <MasterStage kind="champions" id={id} no={no} name={c.name} e={e} m={m} art={c.splash ? cdragon(c.splash) : undefined} pic={<ChampImg id={id} size={112} />} sub={types.join(' · ')} />
        : <div className="dxe-hero">
          <span className="dxe-pic"><ChampImg id={id} size={112} />{!m.seen && <i className="q" aria-hidden="true">?</i>}<Ring m={m} /></span>
          <div><span className="no">{NO(no)}</span><h2>{c.name}</h2><div className="dxe-types"><StageTag m={m} />{types.map((t) => <span key={t} className="pill">{t}</span>)}</div></div>
        </div>}
      <p className="dxe-text">{e ? `${flavor} ${day(e.first)}에 처음 만나 지금까지 ${e.n}판, ${e.w}번 이겼다.` : `아직 만나지 못한 챔프예요. ${flavor} 주사위나 대기석에서 보이면 잡아 보세요.`}</p>
      <Journey m={m} specialList={
        <div className="dxe-sub"><span className="k">이 챔프에게 S티어인 증강 <small>{m.special.tried.length}/{m.special.ids.length}</small></span>
          <div className="sgrid">{sList.map((a) => <AugmentLink key={a} id={a} champion={id} inline className={`sitem ${tried.has(a) ? 'on' : ''}`}><AugRing id={a} size={32} /></AugmentLink>)}
            {m.special.ids.length > sList.length && <span className="smore">+{m.special.ids.length - sList.length}</span>}</div></div>} />
      {e && <Stats e={e} />}
      {augs.length > 0 && <div className="dxe-sub"><span className="k">이 챔프로 자주 고른 증강</span>
        <div className="dxe-augs">{augs.map((p) => <AugmentLink key={p.aug} id={p.aug} champion={id} className="dxe-aug"><AugRing id={p.aug} size={32} /><span className="nm">{AUGMENT[p.aug]?.name ?? `#${p.aug}`}</span><span className="meta">{p.n}판 {p.w}승</span></AugmentLink>)}</div></div>}
    </div>
  );
}

function AugEntry({ id, no, e, m, dex, onAugment, onChampion }: { id: number; no: number; e?: DexEntry; m: Mastery; dex: Dex; onAugment?: (id: number) => void; onChampion?: (id: number) => void }) {
  const a = AUGMENT[id];
  if (!a) return null;
  const champs = dex.pairs.filter((p) => p.aug === id).sort((x, y) => y.n - x.n).slice(0, 8);
  const tried = new Set(m.special.tried);
  const best = [...m.special.ids].sort((x, y) => Number(tried.has(y)) - Number(tried.has(x)) || x - y).slice(0, 14);
  return (
    <div className={`dxe ${stageKey(m)}`}>
      {m.master
        ? <MasterStage kind="augments" id={id} no={no} name={a.name} e={e} m={m} pic={<AugRing id={id} size={104} />} sub={`${RARITY_KO[a.rarity]} 증강`} />
        : <div className="dxe-hero">
          <span className="dxe-pic aug"><AugRing id={id} size={104} />{!m.seen && <i className="q" aria-hidden="true">?</i>}<Ring m={m} /></span>
          <div><span className="no">{NO(no)}</span><h2>{a.name}</h2><div className="dxe-types"><StageTag m={m} /><span className={`pill rar-${a.rarity}`}>{RARITY_KO[a.rarity]}</span>{a.note && <span className="pill">{a.note}</span>}</div></div>
        </div>}
      <p className="dxe-text">{a.desc}</p>
      <Journey m={m} specialList={
        <div className="dxe-sub"><span className="k">이 증강이 {m.special.tier}티어로 맞는 챔프 <small>{m.special.tried.length}/{m.special.ids.length}</small></span>
          <div className="sgrid">{best.map((c) => <button key={c} type="button" className={`sitem champ ${tried.has(c) ? 'on' : ''}`} onClick={() => onChampion?.(c)} title={CHAMPIONS[c]?.name}><ChampImg id={c} size={32} /></button>)}
            {m.special.ids.length > best.length && <span className="smore">+{m.special.ids.length - best.length}</span>}</div></div>} />
      {e && <Stats e={e} />}
      {champs.length > 0 && <div className="dxe-sub"><span className="k">이 증강을 고른 챔프</span>
        <div className="dxe-champs">{champs.map((p) => <button key={p.champ} type="button" className="dxe-champ" onClick={() => onChampion?.(p.champ)} title={`${CHAMPIONS[p.champ]?.name} ${p.n}판 ${p.w}승`}><ChampImg id={p.champ} size={36} /><span>{p.n}</span></button>)}</div></div>}
      {onAugment && <button type="button" className="btn sm primary" onClick={() => onAugment(id)}>증강 자세히 보기</button>}
    </div>
  );
}

/** 그림 둘레의 여정 고리 (이룬 목표만큼 채움) */
function Ring({ m }: { m: Mastery }) {
  if (!m.seen) return null;
  const r = 62, len = 2 * Math.PI * r;
  return (
    <svg className={`jring ${m.master ? 'master' : ''}`} viewBox="0 0 136 136" aria-hidden="true">
      <circle cx="68" cy="68" r={r} className="bg" />
      {m.done > 0 && <circle cx="68" cy="68" r={r} className="fg" strokeDasharray={`${(m.done / m.total) * len} ${len}`} />}
    </svg>
  );
}

/** 골드 표시: 깎인 금빛 원석 (3승) */
export function Crystal({ size = 12 }: { size?: number }) {
  return (
    <svg className="crystal" width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path className="c-l" d="M8 1 2 6l6 9z" /><path className="c-r" d="M8 1l6 5-6 9z" /><path className="c-t" d="M5 6 8 1l3 5z" />
      <path className="c-e" d="M8 1 2 6l6 9 6-9zM2 6h12M5 6l3 9 3-9" />
    </svg>
  );
}

/** 마스터 표시: 빛나는 프리즘 보석 (로고) */
export function PrismMark({ size = 12 }: { size?: number }) {
  return <img className="prism-mark" src="/brand/prism-32.png" width={size} height={size} alt="" />;
}
