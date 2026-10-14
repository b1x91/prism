/**
 * 도감 (포켓몬 도감 방식): 내가 실제로 만난 챔피언과 고른 증강을 모은다.
 * 찾은 것은 색과 기록, 못 찾은 것은 번호와 검은 실루엣(???). 누르면 오른쪽에 도감 설명.
 */
import { useEffect, useMemo, useState } from 'react';
import { ACTIVE_AUGMENTS, AUGMENT, CHAMPIONS, RARITY_KO, ROLE_KO, dexFromGames, dexFromRows, initials, mergeDex, pct, type Api, type Dex, type DexEntry, type DexRows, type Game, type Rarity } from '@prism/core';
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
type Show = 'all' | 'found' | 'missing';
type Sort = 'no' | 'most' | 'recent';

const RARITY_ORDER: Rarity[] = ['silver', 'gold', 'prismatic'];
const CHAMP_IDS = Object.keys(CHAMPIONS).map(Number).sort((a, b) => a - b);
const AUG_IDS = [...ACTIVE_AUGMENTS].sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity) || a.id - b.id).map((a) => a.id);
const NO = (i: number) => `No.${String(i + 1).padStart(3, '0')}`;
const NEW_MS = 3 * 24 * 3600_000;
const day = (t: number) => { const d = new Date(t); return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`; };

/** 완성도 배지 (도감 비율) */
const BADGES: [number, string][] = [[10, '첫 발자국'], [25, '탐험가'], [50, '수집가'], [75, '박사'], [100, '도감 완성']];

const nameOf = (kind: Kind, id: number) => (kind === 'champions' ? CHAMPIONS[id]?.name : AUGMENT[id]?.name) ?? `#${id}`;
const match = (name: string, q: string) => { const t = q.replace(/\s/g, ''); const n = name.replace(/\s/g, ''); return n.includes(t) || initials(n).includes(t); };

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
  const found = ids.filter((id) => got[id]);
  const rate = ids.length ? Math.floor((found.length / ids.length) * 100) : 0;
  const no = useMemo(() => new Map(ids.map((id, i) => [id, i])), [ids]);
  const now = Date.now();

  const groups: [string, string][] = kind === 'champions'
    ? [['all', '전체'], ...Object.entries(ROLE_KO)]
    : [['all', '전체'], ...RARITY_ORDER.map((r) => [r, RARITY_KO[r]] as [string, string])];
  const inGroup = (id: number) => group === 'all' || (kind === 'champions' ? CHAMPIONS[id]?.roles[0] === group : AUGMENT[id]?.rarity === group);
  const groupCount = (g: string) => { const all = ids.filter((id) => g === 'all' || (kind === 'champions' ? CHAMPIONS[id]?.roles[0] === g : AUGMENT[id]?.rarity === g)); return [all.filter((id) => got[id]).length, all.length]; };

  const list = ids.filter((id) => {
    if (!inGroup(id)) return false;
    if (show === 'found' && !got[id]) return false;
    if (show === 'missing' && got[id]) return false;
    const t = q.trim();
    if (!t) return true;
    if (/^\d+$/.test(t)) return String((no.get(id) ?? 0) + 1).includes(t);
    return Boolean(got[id]) && match(nameOf(kind, id), t);
  });
  if (sort === 'most') list.sort((a, b) => (got[b]?.n ?? 0) - (got[a]?.n ?? 0) || (no.get(a)! - no.get(b)!));
  if (sort === 'recent') list.sort((a, b) => (got[b]?.first ?? 0) - (got[a]?.first ?? 0) || (no.get(a)! - no.get(b)!));

  const latest = [...found].sort((a, b) => got[b].first - got[a].first);
  const current = sel[kind] ?? latest[0] ?? ids[0];
  const pick = (id: number) => { setSel({ ...sel, [kind]: id }); setSheet(true); };
  const next = BADGES.find(([p]) => rate < p);
  const needed = next ? Math.ceil((next[0] / 100) * ids.length) - found.length : 0;

  return (
    <div className="dex">
      <header className="dex-device">
        <span className="dex-lens" aria-hidden="true"><Gem size={44} /></span>
        <span className="dex-lights" aria-hidden="true"><i /><i /><i /></span>
        <div className="dex-title">
          <h1>도감</h1>
          <Seg value={kind} options={[['champions', '챔피언'], ['augments', '증강']]} onChange={(k) => { setKind(k); setGroup('all'); setQ(''); }} />
        </div>
        <div className="dex-count">
          <span className="k">{kind === 'champions' ? '만난 챔피언' : '골라 본 증강'}</span>
          <b>{found.length}<small> / {ids.length}</small></b>
          <span className="dex-bar" role="progressbar" aria-valuenow={rate} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${(found.length / Math.max(ids.length, 1)) * 100}%` }} /></span>
          <span className="meta">{loading ? '기록 불러오는 중…' : next ? `${rate}% · '${next[1]}'까지 ${needed}개` : '모두 모았어요!'}</span>
        </div>
        <div className="dex-badges">{BADGES.map(([p, l]) => <span key={p} className={`dex-badge ${rate >= p ? 'on' : ''}`} title={`${p}% 모으면`}><i />{l}<small>{p}%</small></span>)}</div>
      </header>

      <div className="dex-body">
        <section className="dex-list card">
          <div className="dex-tools">
            <Seg value={show} options={[['all', '전체'], ['found', '찾음'], ['missing', '못 찾음']]} onChange={setShow} />
            <label className="dex-search"><Icon name="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="찾은 것 이름 또는 번호" /></label>
            <select className="dex-sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="정렬">
              <option value="no">번호순</option><option value="most">많이 한 순</option><option value="recent">최근 등록순</option>
            </select>
          </div>
          <div className="dex-groups">{groups.map(([g, l]) => { const [f, t] = groupCount(g); return <button key={g} type="button" className={`chip ${group === g ? 'on' : ''}`} onClick={() => setGroup(g)}>{l}<small>{f}/{t}</small></button>; })}</div>
          {list.length ? <div className={`dex-grid ${kind}`}>{list.map((id) => {
            const e = got[id];
            const fresh = e && now - e.first < NEW_MS;
            return (
              <button key={id} type="button" className={`dx ${e ? 'got' : 'unk'} ${current === id ? 'sel' : ''} ${kind === 'augments' ? AUGMENT[id]?.rarity ?? '' : ''}`} onClick={() => pick(id)} aria-label={e ? nameOf(kind, id) : `${NO(no.get(id)!)} 아직 못 찾음`}>
                <span className="no">{NO(no.get(id)!)}</span>
                {fresh && <span className="new">NEW</span>}
                {e && <span className="caught" aria-hidden="true" />}
                <span className="pic">{kind === 'champions' ? <ChampImg id={id} size={56} /> : <AugRing id={id} size={56} />}{!e && <i className="q" aria-hidden="true">?</i>}</span>
                <span className="nm">{e ? nameOf(kind, id) : '???'}</span>
                <span className="ct">{e ? `${e.n}판` : ' '}</span>
              </button>
            );
          })}</div> : <p className="meta dex-none">{q ? '찾은 것 중에 맞는 이름이 없어요.' : show === 'missing' ? '이 칸은 모두 모았어요!' : '아직 찾은 것이 없어요. 한 판 하고 오면 채워져요.'}</p>}
        </section>

        {sheet && <button type="button" className="dex-scrim" aria-label="닫기" onClick={() => setSheet(false)} />}
        <aside className={`dex-entry card ${sheet ? 'open' : ''}`} aria-live="polite">
          <button type="button" className="dex-close icon-btn" aria-label="닫기" onClick={() => setSheet(false)}><Icon name="x" /></button>
          {kind === 'champions'
            ? <ChampEntry id={current} no={no.get(current) ?? 0} e={got[current]} dex={dex} onChampion={onChampion} />
            : <AugEntry id={current} no={no.get(current) ?? 0} e={got[current]} dex={dex} onAugment={onAugment} onChampion={onChampion} />}
        </aside>
      </div>
    </div>
  );
}

function Stats({ e }: { e: DexEntry }) {
  return (
    <div className="dxe-stats">
      <div><span className="k">함께한 판</span><b>{e.n}</b></div>
      <div><span className="k">승률</span><b>{pct(e.w, e.n)}</b></div>
      <div><span className="k">처음 만난 날</span><b className="d">{day(e.first)}</b></div>
      <div><span className="k">최근</span><b className="d">{day(e.last)}</b></div>
    </div>
  );
}

function ChampEntry({ id, no, e, dex, onChampion }: { id: number; no: number; e?: DexEntry; dex: Dex; onChampion?: (id: number) => void }) {
  const c = CHAMPIONS[id];
  if (!c) return null;
  const types = [ROLE_KO[c.roles[0]], c.roles[1] && ROLE_KO[c.roles[1]]].filter(Boolean) as string[];
  const augs = dex.pairs.filter((p) => p.champ === id).sort((a, b) => b.n - a.n).slice(0, 6);
  const flavor = `${c.range === 'ranged' ? '원거리' : '근접'} ${types[0] ?? ''}. ${c.damage === 'MIX' ? '물리·마법 피해를 섞어' : c.damage === 'AP' ? '마법 피해로' : c.damage === 'AD' ? '물리 피해로' : ''} 싸운다.`;
  return (
    <div className={`dxe ${e ? 'got' : 'unk'}`}>
      <div className="dxe-hero">
        <span className="dxe-pic"><ChampImg id={id} size={112} />{!e && <i className="q" aria-hidden="true">?</i>}</span>
        <div><span className="no">{NO(no)}</span><h2>{c.name}</h2><div className="dxe-types">{types.map((t) => <span key={t} className="pill">{t}</span>)}</div></div>
      </div>
      {e ? <>
        <p className="dxe-text">{flavor} {day(e.first)}에 처음 만나 지금까지 {e.n}판을 함께했다.</p>
        <Stats e={e} />
        {augs.length > 0 && <div className="dxe-sub"><span className="k">이 챔피언으로 고른 증강</span>
          <div className="dxe-augs">{augs.map((p) => <AugmentLink key={p.aug} id={p.aug} champion={id} className="dxe-aug"><AugRing id={p.aug} size={32} /><span className="nm">{AUGMENT[p.aug]?.name ?? `#${p.aug}`}</span><span className="meta">{p.n}판</span></AugmentLink>)}</div></div>}
      </> : <p className="dxe-text">아직 만나지 못한 챔피언이에요. {flavor} 주사위나 대기석에서 보이면 잡아 보세요.</p>}
      {onChampion && <button type="button" className="btn sm primary" onClick={() => onChampion(id)}>증강 가이드</button>}
    </div>
  );
}

function AugEntry({ id, no, e, dex, onAugment, onChampion }: { id: number; no: number; e?: DexEntry; dex: Dex; onAugment?: (id: number) => void; onChampion?: (id: number) => void }) {
  const a = AUGMENT[id];
  if (!a) return null;
  const champs = dex.pairs.filter((p) => p.aug === id).sort((x, y) => y.n - x.n).slice(0, 8);
  return (
    <div className={`dxe ${e ? 'got' : 'unk'}`}>
      <div className="dxe-hero">
        <span className="dxe-pic aug"><AugRing id={id} size={104} />{!e && <i className="q" aria-hidden="true">?</i>}</span>
        <div><span className="no">{NO(no)}</span><h2>{a.name}</h2><div className="dxe-types"><span className={`pill rar-${a.rarity}`}>{RARITY_KO[a.rarity]}</span>{a.note && <span className="pill">{a.note}</span>}</div></div>
      </div>
      <p className="dxe-text">{a.desc}</p>
      {e ? <>
        <Stats e={e} />
        {champs.length > 0 && <div className="dxe-sub"><span className="k">이 증강을 고른 챔피언</span>
          <div className="dxe-champs">{champs.map((p) => <button key={p.champ} type="button" className="dxe-champ" onClick={() => onChampion?.(p.champ)} title={CHAMPIONS[p.champ]?.name}><ChampImg id={p.champ} size={36} /><span>{p.n}</span></button>)}</div></div>}
      </> : <p className="meta">아직 골라 본 적 없는 증강이에요.</p>}
      {onAugment && <button type="button" className="btn sm primary" onClick={() => onAugment(id)}>증강 자세히 보기</button>}
    </div>
  );
}
