/**
 * 도감 (포켓몬 도감 방식) + 마스터 여정.
 * 해 봤다고 채워지지 않는다: 만남(1판) → 포획(3승) → S티어 증강 경험·5/10/30/50승 → 마스터.
 * 못 만난 것은 번호와 흐린 그림(???). 누르면 도감 설명과 다음 목표.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ACTIVE_AUGMENTS, AUGMENT, CHAMPIONS, RARITY_KO, ROLE_KO, augMastery, champMastery, dexFromGames, dexFromRows, initials, mergeDex, pct, type Api, type Dex, type DexEntry, type DexRows, type Game, type Mastery, type Rarity } from '@prism/core';
import { ChampImg, Gem, Seg } from './basics';
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
type Show = 'all' | 'seen' | 'caught' | 'master' | 'missing';
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
const stageOf = (m: Mastery) => (m.master ? '마스터' : m.caught ? '포획' : m.seen ? '만남' : '미발견');
const stageKey = (m: Mastery) => (m.master ? 'master' : m.caught ? 'caught' : m.seen ? 'seen' : 'unk');

export function DexView({ dex, onChampion, onAugment, loading }: { dex: Dex; onChampion?: (id: number) => void; onAugment?: (id: number) => void; loading?: boolean }) {
  const [kind, setKind] = useState<Kind>('champions');
  const [show, setShow] = useState<Show>('all');
  const [sort, setSort] = useState<Sort>('no');
  const [group, setGroup] = useState<string>('all');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Record<Kind, number | null>>({ champions: null, augments: null });
  const [sheet, setSheet] = useState(false); // 좁은 화면: 고르면 아래에서 설명이 올라온다

  const ids = kind === 'champions' ? CHAMP_IDS : AUG_IDS;
  const got = dex[kind];
  const ms = useMemo(() => new Map(ids.map((id) => [id, kind === 'champions' ? champMastery(id, got[id], dex.pairs) : augMastery(id, got[id], dex.pairs)])), [ids, kind, got, dex.pairs]);
  const no = useMemo(() => new Map(ids.map((id, i) => [id, i])), [ids]);
  const m = (id: number) => ms.get(id)!;
  const now = Date.now();

  const seen = ids.filter((id) => m(id).seen).length;
  const caught = ids.filter((id) => m(id).caught).length;
  const masters = ids.filter((id) => m(id).master).length;
  const goalsDone = ids.reduce((s, id) => s + m(id).done, 0), goalsAll = ids.reduce((s, id) => s + m(id).total, 0);
  const rate = goalsAll ? Math.floor((goalsDone / goalsAll) * 100) : 0;
  const next = BADGES.find(([p]) => rate < p);

  const groups: [string, string][] = kind === 'champions'
    ? [['all', '전체'], ...Object.entries(ROLE_KO)]
    : [['all', '전체'], ...RARITY_ORDER.map((r) => [r, RARITY_KO[r]] as [string, string])];
  const groupOf = (id: number) => (kind === 'champions' ? CHAMPIONS[id]?.roles[0] : AUGMENT[id]?.rarity);
  const groupCount = (g: string) => { const all = ids.filter((id) => g === 'all' || groupOf(id) === g); return [all.filter((id) => m(id).caught).length, all.length]; };

  const list = ids.filter((id) => {
    const x = m(id);
    if (group !== 'all' && groupOf(id) !== group) return false;
    if (show === 'seen' && !(x.seen && !x.caught)) return false;
    if (show === 'caught' && !(x.caught && !x.master)) return false;
    if (show === 'master' && !x.master) return false;
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
  const what = kind === 'champions' ? '챔피언' : '증강';

  return (
    <div className="dex">
      <header className="dex-device">
        <span className="dex-lens" aria-hidden="true"><Gem size={44} /></span>
        <span className="dex-lights" aria-hidden="true"><i /><i /><i /></span>
        <div className="dex-title">
          <h1>도감</h1>
          <Seg value={kind} options={[['champions', '챔피언'], ['augments', '증강']]} onChange={(k) => { setKind(k); setGroup('all'); setQ(''); setShow('all'); }} />
        </div>
        <div className="dex-count">
          <span className="k">마스터 여정</span>
          <b>{rate}<small>%</small></b>
          <span className="dex-bar" role="progressbar" aria-valuenow={rate} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${(goalsDone / Math.max(goalsAll, 1)) * 100}%` }} /></span>
          <div className="dex-tally">
            <span><i className="dst seen" />만남 <b>{seen}</b></span>
            <span><Crystal />포획 <b>{caught}</b></span>
            <span><PrismMark />마스터 <b>{masters}</b></span>
            <span className="of">/ {ids.length}</span>
          </div>
          <span className="meta">{loading ? '기록 불러오는 중…' : next ? `다음 배지 '${next[1]}'까지 ${next[0] - rate}%` : '도감을 완성했어요!'}</span>
        </div>
        <div className="dex-badges">{BADGES.map(([p, l]) => <span key={p} className={`dex-badge ${rate >= p ? 'on' : ''}`} title={`마스터 여정 ${p}%`}><i />{l}<small>{p}%</small></span>)}</div>
      </header>

      <div className="dex-rules">
        <span><i className="dst seen" /><b>만남</b> 1판</span><span className="arr" aria-hidden="true">→</span>
        <span><Crystal /><b>포획</b> 3승</span><span className="arr" aria-hidden="true">→</span>
        <span><i className="pip s on" /><b>{kind === 'champions' ? 'S티어 증강' : '잘 맞는 챔피언'}</b> 골라 보기 · 5·10·30·50승</span><span className="arr" aria-hidden="true">→</span>
        <span><PrismMark /><b>마스터</b></span>
      </div>

      <div className="dex-body">
        <section className="dex-list card">
          <div className="dex-tools">
            <Seg value={show} options={[['all', '전체'], ['seen', '만남'], ['caught', '포획'], ['master', '마스터'], ['missing', '미발견']]} onChange={setShow} />
            <label className="dex-search"><Icon name="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="만난 것 이름 또는 번호" /></label>
            <select className="dex-sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="정렬">
              <option value="no">번호순</option><option value="progress">진척도순</option><option value="most">많이 한 순</option><option value="recent">최근 만난 순</option>
            </select>
          </div>
          <div className="dex-groups">{groups.map(([g, l]) => { const [f, t] = groupCount(g); return <button key={g} type="button" className={`chip ${group === g ? 'on' : ''}`} onClick={() => setGroup(g)} title="포획 / 전체">{l}<small>{f}/{t}</small></button>; })}</div>
          {list.length ? <div className={`dex-grid ${kind}`}>{list.map((id) => {
            const x = m(id), e = got[id];
            const fresh = e && now - e.first < NEW_MS;
            return (
              <button key={id} type="button" className={`dx ${stageKey(x)} ${current === id ? 'sel' : ''} ${kind === 'augments' ? AUGMENT[id]?.rarity ?? '' : ''}`} onClick={() => pick(id)} aria-label={x.seen ? `${nameOf(kind, id)} ${stageOf(x)} ${x.done}/${x.total}` : `${NO(no.get(id)!)} 미발견`}>
                <span className="no">{NO(no.get(id)!)}</span>
                {fresh && !x.caught && <span className="new">NEW</span>}
                {x.master ? <span className="mark" role="img" aria-label="마스터" title="마스터 · 목표 6개 모두 달성"><PrismMark size={18} /></span> : x.caught && <span className="mark" role="img" aria-label="포획" title="포획 · 3승 달성"><Crystal size={16} /></span>}
                <span className="pic">{kind === 'champions' ? <ChampImg id={id} size={56} /> : <AugRing id={id} size={56} />}{!x.seen && <i className="q" aria-hidden="true">?</i>}</span>
                <span className="nm">{x.seen ? nameOf(kind, id) : '???'}</span>
                <Pips m={x} />
              </button>
            );
          })}</div> : <p className="meta dex-none">{q ? '만난 것 중에 맞는 이름이 없어요.' : show === 'missing' ? `모든 ${what}을 만났어요!` : show === 'master' ? '아직 마스터한 것이 없어요. 오른쪽 여정을 따라가 보세요.' : '아직 없어요. 한 판 하고 오면 채워져요.'}</p>}
        </section>

        {sheet && <button type="button" className="dex-scrim" aria-label="닫기" onClick={() => setSheet(false)} />}
        <aside className={`dex-entry card ${sheet ? 'open' : ''}`} aria-live="polite">
          <button type="button" className="dex-close icon-btn" aria-label="닫기" onClick={() => setSheet(false)}><Icon name="x" /></button>
          {kind === 'champions'
            ? <ChampEntry id={current} no={no.get(current) ?? 0} e={got[current]} m={m(current)} dex={dex} onChampion={onChampion} />
            : <AugEntry id={current} no={no.get(current) ?? 0} e={got[current]} m={m(current)} dex={dex} onAugment={onAugment} onChampion={onChampion} />}
        </aside>
      </div>
    </div>
  );
}

/** 칸 아래 작은 여정 표시: 특별 목표(◆) + 승리 목표 5개 */
function Pips({ m }: { m: Mastery }) {
  return (
    <span className="pips" title={`${m.done}/${m.total}`}>
      {m.goals.map((g) => <i key={g.key} className={`pip ${g.key === 'special' ? 's' : ''} ${g.done ? 'on' : ''}`} />)}
    </span>
  );
}

function Journey({ m, specialList }: { m: Mastery; specialList: ReactNode }) {
  return (
    <div className="journey">
      <div className="jh"><span className="k">마스터 여정</span><b>{m.done}<small>/{m.total}</small></b>
        {m.next && <span className="jnext">다음 목표 · {m.next.key === 'special' ? m.next.label : `${m.next.label}까지 ${m.next.target - m.next.cur}승`}</span>}
        {m.master && <span className="jnext master">마스터 달성</span>}
      </div>
      <ol className="jsteps">{m.goals.map((g) => (
        <li key={g.key} className={`${g.done ? 'done' : ''} ${m.next === g ? 'next' : ''}`}>
          <span className="jc" aria-hidden="true">{g.done ? <Icon name="check" /> : g.key === 'special' ? '◆' : ''}</span>
          <span className="jl">{g.label}</span>
          {g.key === 'special'
            ? <span className="jv">{m.special.tried.length}/{m.special.ids.length} 경험</span>
            : <span className="jbar"><span style={{ width: `${(g.cur / g.target) * 100}%` }} /></span>}
          {g.key !== 'special' && <span className="jv">{g.cur}/{g.target}</span>}
        </li>
      ))}</ol>
      {specialList}
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
  return <span className={`stage-tag ${stageKey(m)}`}>{m.master ? <PrismMark size={14} /> : m.caught ? <Crystal size={12} /> : null}{stageOf(m)}</span>;
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
      <div className="dxe-hero">
        <span className="dxe-pic"><ChampImg id={id} size={112} />{!m.seen && <i className="q" aria-hidden="true">?</i>}<Ring m={m} /></span>
        <div><span className="no">{NO(no)}</span><h2>{c.name}</h2><div className="dxe-types"><StageTag m={m} />{types.map((t) => <span key={t} className="pill">{t}</span>)}</div></div>
      </div>
      <p className="dxe-text">{e ? `${flavor} ${day(e.first)}에 처음 만나 지금까지 ${e.n}판, ${e.w}번 이겼다.` : `아직 만나지 못한 챔피언이에요. ${flavor} 주사위나 대기석에서 보이면 잡아 보세요.`}</p>
      <Journey m={m} specialList={
        <div className="dxe-sub"><span className="k">이 챔피언에게 S티어인 증강 <small>{m.special.tried.length}/{m.special.ids.length}</small></span>
          <div className="sgrid">{sList.map((a) => <AugmentLink key={a} id={a} champion={id} inline className={`sitem ${tried.has(a) ? 'on' : ''}`}><AugRing id={a} size={32} /></AugmentLink>)}
            {m.special.ids.length > sList.length && <span className="smore">+{m.special.ids.length - sList.length}</span>}</div></div>} />
      {e && <Stats e={e} />}
      {augs.length > 0 && <div className="dxe-sub"><span className="k">이 챔피언으로 자주 고른 증강</span>
        <div className="dxe-augs">{augs.map((p) => <AugmentLink key={p.aug} id={p.aug} champion={id} className="dxe-aug"><AugRing id={p.aug} size={32} /><span className="nm">{AUGMENT[p.aug]?.name ?? `#${p.aug}`}</span><span className="meta">{p.n}판 {p.w}승</span></AugmentLink>)}</div></div>}
      {onChampion && <button type="button" className="btn sm primary" onClick={() => onChampion(id)}>증강 가이드</button>}
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
      <div className="dxe-hero">
        <span className="dxe-pic aug"><AugRing id={id} size={104} />{!m.seen && <i className="q" aria-hidden="true">?</i>}<Ring m={m} /></span>
        <div><span className="no">{NO(no)}</span><h2>{a.name}</h2><div className="dxe-types"><StageTag m={m} /><span className={`pill rar-${a.rarity}`}>{RARITY_KO[a.rarity]}</span>{a.note && <span className="pill">{a.note}</span>}</div></div>
      </div>
      <p className="dxe-text">{a.desc}</p>
      <Journey m={m} specialList={
        <div className="dxe-sub"><span className="k">이 증강이 {m.special.tier}티어로 맞는 챔피언 <small>{m.special.tried.length}/{m.special.ids.length}</small></span>
          <div className="sgrid">{best.map((c) => <button key={c} type="button" className={`sitem champ ${tried.has(c) ? 'on' : ''}`} onClick={() => onChampion?.(c)} title={CHAMPIONS[c]?.name}><ChampImg id={c} size={32} /></button>)}
            {m.special.ids.length > best.length && <span className="smore">+{m.special.ids.length - best.length}</span>}</div></div>} />
      {e && <Stats e={e} />}
      {champs.length > 0 && <div className="dxe-sub"><span className="k">이 증강을 고른 챔피언</span>
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

/** 포획 표시: 깎인 원석 (3승) */
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
