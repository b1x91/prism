/**
 * 운영 (CLAUDE.md v3.107·v3.109·v3.110) — 운영진(역할 단계 5·관리자)에게만 보이는 메뉴. 앱·웹 공용.
 *  - 대시보드 (`StaffView`): 맨 위 '멤버 관리' 단추 + 지금 숫자 넷 · 주별 활동(8주) · 멤버 구성 · 최근 2주 잘하는 멤버 · 챙겨야 할 멤버
 *  - 멤버 관리 (`StaffMembersView`, 따로 한 페이지): 위에 승인이 필요한 멤버 카드(승인 대기 · 정회원 심사),
 *    아래에 전체 멤버 — 검색 · 거르기(단계·특별·앱·롤 연결·지금 접속·최근 2주 활동) · 정렬(최근 활동·판수·승률·점수·2주 판수·운영진과·가입)
 */
import { useMemo, useState } from 'react';
import { ago, matchName, pct, shortDate, shortNick, type Api, type StaffMember, type StaffMembers, type StaffOverview } from '@prism/core';
import { Empty, MemberFace, PendingChip, RoleBadge, Select, Toggle, useSkins } from './basics';
import { Icon } from './icons';
import { useLoad } from './crew';
import { useKept } from './kept';
import { Bone, SkeletonFrame, Swap, fadeCls, useReveal } from './skeleton';

const LEVELS: ['0' | '1' | '2' | '3', string][] = [['0', '역할 없음'], ['1', '준회원'], ['2', '정회원'], ['3', '우수회원']];
/** 멤버 구성 막대: 디스코드 역할과 같은 색 (승인 대기는 금빛, 역할 없음은 회색) */
const LEVEL_BAR: { key: keyof StaffOverview['levels']; name: string; color: string }[] = [
  { key: 'pending', name: '승인 대기', color: '#c3951d' },
  { key: 'none', name: '역할 없음', color: 'var(--text-3)' },
  { key: 'associate', name: '준회원', color: '#3498db' },
  { key: 'regular', name: '정회원', color: '#e74c3c' },
  { key: 'excellent', name: '우수회원', color: '#f1c40f' },
  { key: 'staff', name: '운영진', color: '#607d8b' },
];
const CARE_LABEL = { pending: '승인 대기', review: '정회원 심사', quiet: '아직 첫 판 전', away: '오래 안 보여요' } as const;
const ONLINE_MS = 150_000;
const DAY = 86_400_000;

/** 운영 대시보드. onMembers = 멤버 관리 페이지로 */
export function StaffView({ api, onOpen, onMembers }: { api: Api; onOpen?: (id: string) => void; onMembers?: () => void }) {
  const { data, error, reload } = useLoad<StaffMembers>(api, '/api/staff/members');
  const rv = useReveal(Boolean(data));
  if (error) return <Empty>{error}</Empty>;
  if (!data) return <StaffSkeleton />;
  const pending = data.members.filter((m) => m.pending).length, review = data.members.filter((m) => m.review).length;
  return (
    <Swap on={rv} skeleton={<StaffSkeleton />}>
      <div className={`stf ${fadeCls(rv)}`}>
        <TopBar pending={pending} review={review} onMembers={onMembers} />
        {data.overview && <Dashboard api={api} o={data.overview} need={data.reviewNeed} onOpen={onOpen} onDone={reload} onMembers={onMembers} />}
      </div>
    </Swap>
  );
}

/** 대시보드 맨 위: 처리할 일 + 멤버 관리로 가는 단추 */
function TopBar({ pending, review, onMembers }: { pending: number; review: number; onMembers?: () => void }) {
  const todo = pending + review;
  return (
    <div className={`stf-bar ${todo ? 'todo' : ''}`}>
      <span className="stf-bar-t">
        <Icon name={todo ? 'bell' : 'check'} />
        {todo ? <span>{[pending ? `승인을 기다리는 멤버 ${pending}명` : '', review ? `정회원 심사 ${review}명` : ''].filter(Boolean).join(' · ')}</span> : <span>지금 처리할 승인이 없어요</span>}
      </span>
      {onMembers && <button type="button" className={`btn sm ${todo ? 'primary' : ''}`} onClick={onMembers}><Icon name="users" />멤버 관리</button>}
    </div>
  );
}

// ───────── 대시보드 ─────────

function Delta({ now, prev }: { now: number; prev: number }) {
  const d = now - prev;
  if (!d) return <span className="stf-delta">지난주와 같아요</span>;
  return <span className={`stf-delta ${d > 0 ? 'up' : 'down'}`}>{d > 0 ? '▲' : '▼'} {Math.abs(d)} <span>지난주 대비</span></span>;
}

function Dashboard({ api, o, need, onOpen, onDone, onMembers }: { api: Api; o: StaffOverview; need: number; onOpen?: (id: string) => void; onDone: () => void; onMembers?: () => void }) {
  const k = o.kpi;
  return (
    <>
      <section className="stf-kpis" aria-label="지금 Prism">
        <div className="stf-kpi"><span className="stf-kl"><Icon name="users" />멤버</span><b>{k.members}</b><span className="stf-delta">{k.joinedWeek ? <>이번 주 <em className="up">+{k.joinedWeek}</em> 명 가입</> : '이번 주 가입 없음'}</span></div>
        <div className="stf-kpi"><span className="stf-kl"><Icon name="spark" />이번 주 활동 멤버</span><b>{k.active}</b><Delta now={k.active} prev={k.activePrev} /></div>
        <div className="stf-kpi"><span className="stf-kl"><Icon name="swords" />이번 주 모임 판</span><b>{k.crew}</b><Delta now={k.crew} prev={k.crewPrev} /></div>
        <div className="stf-kpi"><span className="stf-kl"><i className="stf-live" aria-hidden="true" />지금 접속</span><b>{k.online}</b><span className="stf-delta">앱·웹 합쳐서</span></div>
      </section>
      <div className="stf-grid">
        <WeekChart weeks={o.weeks} />
        <LevelMix levels={o.levels} app={k.app} linked={k.linked} total={k.members} />
      </div>
      <div className="stf-grid">
        <Stars stars={o.stars} onOpen={onOpen} />
        <Care api={api} o={o} need={need} onOpen={onOpen} onDone={onDone} onMembers={onMembers} />
      </div>
    </>
  );
}

/** 주별 활동: 판 수 막대 (모임 판 + 그 밖의 판), 마우스를 올리면 그 주의 숫자 */
function WeekChart({ weeks }: { weeks: StaffOverview['weeks'] }) {
  const max = Math.max(4, ...weeks.map((w) => w.games));
  const top = Math.ceil(max / 4) * 4;
  const md = (t: number) => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()}`; };
  const total = weeks.reduce((a, w) => a + w.games, 0);
  return (
    <section className="card pad stf-card">
      <div className="stf-head"><h2>주별 활동</h2><span className="meta">최근 8주 · {total}판</span></div>
      <div className="stf-legend"><span><i style={{ background: 'var(--accent)' }} />모임 판</span><span><i style={{ background: 'color-mix(in srgb, var(--accent) 32%, var(--surface-3))' }} />그 밖의 판</span></div>
      <div className="stf-chart" role="img" aria-label={`최근 8주 판 수 ${weeks.map((w) => `${md(w.start)} 주 ${w.games}판`).join(', ')}`}>
        <div className="stf-axis" aria-hidden="true">{[top, top / 2, 0].map((v) => <span key={v}>{v}</span>)}</div>
        <div className="stf-bars">
          {[0, 1, 2].map((i) => <i key={i} className="stf-gl" style={{ bottom: `${i * 50}%` }} aria-hidden="true" />)}
          {weeks.map((w, i) => {
            const last = i === weeks.length - 1;
            return (
              <div key={w.start} className={`stf-col ${last ? 'now' : ''} ${(weeks.length - 1 - i) % 2 ? 'alt' : ''}`} tabIndex={0}>
                <div className="stf-stack" style={{ height: `${(w.games / top) * 100}%` }}>
                  {w.games > w.crew && <i className="solo" style={{ flex: w.games - w.crew }} />}
                  {w.crew > 0 && <i className="crew" style={{ flex: w.crew }} />}
                </div>
                {last && w.games > 0 && <span className="stf-val" style={{ bottom: `${(w.games / top) * 100}%` }}>{w.games}</span>}
                <span className="stf-x">{last ? '이번 주' : md(w.start)}</span>
                <span className="stf-tip" role="tooltip"><b>{last ? '이번 주' : `${md(w.start)} 주`}</b>판 {w.games} · 모임 판 {w.crew}<br />활동 멤버 {w.active}명</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function LevelMix({ levels, app, linked, total }: { levels: StaffOverview['levels']; app: number; linked: number; total: number }) {
  const rows = LEVEL_BAR.map((l) => ({ ...l, n: levels[l.key] })).filter((l) => l.n > 0 || l.key !== 'none');
  const sum = rows.reduce((a, r) => a + r.n, 0) || 1;
  return (
    <section className="card pad stf-card">
      <div className="stf-head"><h2>멤버 구성</h2><span className="meta">{sum}명</span></div>
      <div className="stf-mix" role="img" aria-label={rows.map((r) => `${r.name} ${r.n}명`).join(', ')}>
        {rows.filter((r) => r.n > 0).map((r) => <i key={r.key} style={{ flex: r.n, background: r.color }} title={`${r.name} ${r.n}명`} />)}
      </div>
      <ul className="stf-mixl">
        {rows.map((r) => <li key={r.key}><i style={{ background: r.color }} /><span>{r.name}</span><b>{r.n}</b><em>{Math.round((r.n / sum) * 100)}%</em></li>)}
      </ul>
      <div className="stf-foot">
        {[['앱을 쓰는 멤버', app], ['롤 계정 연결', linked]].map(([l, n]) => <div key={l as string}><span className="meta">{l}</span><b>{n}<span>/{total}</span></b><i className="stf-pbar" aria-hidden="true"><i style={{ width: `${total ? ((n as number) / total) * 100 : 0}%` }} /></i></div>)}
      </div>
    </section>
  );
}

function Stars({ stars, onOpen }: { stars: StaffOverview['stars']; onOpen?: (id: string) => void }) {
  const skins = useSkins();
  return (
    <section className="card pad stf-card">
      <div className="stf-head"><h2>잘하고 있는 멤버</h2><span className="meta">최근 2주 · Prism 점수</span></div>
      {stars.length ? <ol className="stf-people">
        {stars.map((m, i) => (
          <li key={m.id}><button type="button" className="stf-person" onClick={() => onOpen?.(m.id)}>
            <span className={`stf-rank r${i + 1}`}>{i + 1}</span>
            <MemberFace nick={m.nick} skin={m.skin} champion={m.main} size={36} skins={skins} />
            <span className="stf-pt"><b>{shortNick(m.nick)}</b><span className="meta">{m.n}판 · 승률 {pct(m.w, m.n)} · 모임 판 {m.crew}</span></span>
            <span className="stf-score">{m.score}<span>점</span></span>
          </button></li>
        ))}
      </ol> : <Empty>최근 2주에 5판 넘게 한 멤버가 아직 없어요.</Empty>}
    </section>
  );
}

function Care({ api, o, need, onOpen, onDone, onMembers }: { api: Api; o: StaffOverview; need: number; onOpen?: (id: string) => void; onDone: () => void; onMembers?: () => void }) {
  const skins = useSkins();
  const [busy, setBusy] = useState('');
  const act = async (id: string, action: string) => {
    setBusy(id);
    try { await api.post(`/api/staff/members/${id}/${action}`, {}); onDone(); } catch { /* 아래 목록에서 다시 */ } finally { setBusy(''); }
  };
  const why = (c: StaffOverview['care'][number]) => c.kind === 'pending' ? `가입 ${c.days}일째` : c.kind === 'review' ? `운영진과 ${c.n ?? need}판 함께했어요` : c.kind === 'quiet' ? `가입 ${c.days}일, 아직 판이 없어요` : `${c.days}일째 소식이 없어요`;
  return (
    <section className="card pad stf-card">
      <div className="stf-head"><h2>챙겨야 할 멤버</h2>{onMembers ? <button type="button" className="stf-more" onClick={onMembers}>{o.careTotal ? `${o.careTotal}명 모두 보기` : '멤버 관리'}<Icon name="chevR" /></button> : <span className="meta">{o.careTotal ? `${o.careTotal}명` : ''}</span>}</div>
      {o.care.length ? <ul className="stf-people">
        {o.care.map((c) => (
          <li key={c.id} className="stf-care">
            <button type="button" className="stf-person" onClick={() => onOpen?.(c.id)}>
              <MemberFace nick={c.nick} skin={c.skin} champion={c.main} size={36} skins={skins} />
              <span className="stf-pt"><b>{shortNick(c.nick)}<span className={`stf-why k-${c.kind}`}>{CARE_LABEL[c.kind]}</span></b><span className="meta">{why(c)}</span></span>
            </button>
            {c.kind === 'pending' && <button type="button" className="btn primary sm" disabled={busy === c.id} onClick={() => act(c.id, 'approve')}>{busy === c.id ? '처리 중…' : '승인'}</button>}
            {c.kind === 'review' && <button type="button" className="btn primary sm" disabled={busy === c.id} onClick={() => act(c.id, 'promote')}>{busy === c.id ? '처리 중…' : '정회원 승인'}</button>}
          </li>
        ))}
      </ul> : <Empty>지금 챙길 멤버가 없어요.</Empty>}
    </section>
  );
}

// ───────── 멤버 관리 (따로 한 페이지) ─────────

type Filter = 'none' | 'associate' | 'regular' | 'excellent' | 'staff' | 'special' | 'app' | 'linked' | 'online' | 'active';
type Sort = 'seen' | 'games' | 'winrate' | 'score' | 'recent' | 'staff' | 'joined' | 'name';
const FILTERS: { key: Filter; label: string; group: 'level' | 'more' }[] = [
  { key: 'none', label: '역할 없음', group: 'level' }, { key: 'associate', label: '준회원', group: 'level' }, { key: 'regular', label: '정회원', group: 'level' },
  { key: 'excellent', label: '우수회원', group: 'level' }, { key: 'staff', label: '운영진', group: 'level' },
  { key: 'online', label: '지금 접속', group: 'more' }, { key: 'active', label: '최근 2주 활동', group: 'more' }, { key: 'special', label: '특별회원', group: 'more' },
  { key: 'app', label: '앱 사용', group: 'more' }, { key: 'linked', label: '롤 연결', group: 'more' },
];
const SORTS: [Sort, string][] = [['seen', '최근 활동'], ['games', '판수'], ['winrate', '승률'], ['score', 'Prism 점수'], ['recent', '최근 2주 판수'], ['staff', '운영진과 함께한 판'], ['joined', '가입일'], ['name', '이름']];
const lvKey = (m: StaffMember): Filter => (m.level >= 5 ? 'staff' : (['none', 'associate', 'regular', 'excellent'] as const)[Math.min(m.level, 3)]);
const lastOf = (m: StaffMember) => Math.max(m.seen || 0, m.lastPlayed || 0);
const SORT_VAL: Record<Sort, (m: StaffMember) => number | string> = {
  seen: lastOf, games: (m) => m.games, winrate: (m) => (m.games ? m.wins / m.games : -1), score: (m) => m.score, recent: (m) => m.recent,
  staff: (m) => m.staffGames, joined: (m) => m.joined, name: (m) => m.nick.toLowerCase(),
};

export function StaffMembersView({ api, onOpen }: { api: Api; onOpen?: (id: string) => void }) {
  const { data, error, reload } = useLoad<StaffMembers>(api, '/api/staff/members');
  const rv = useReveal(Boolean(data));
  const [q, setQ] = useKept('staff.q', '');
  const [filters, setFilters] = useKept<Filter[]>('staff.filters', []);
  const [sort, setSort] = useKept<Sort>('staff.sort', 'seen');
  const [asc, setAsc] = useKept('staff.asc', false);
  const now = Date.now();
  const all = data?.members ?? [];
  const shown = useMemo(() => {
    const lv = filters.filter((f) => FILTERS.find((x) => x.key === f)?.group === 'level');
    const more = filters.filter((f) => !lv.includes(f));
    const pass = (m: StaffMember) => (!lv.length || lv.includes(lvKey(m))) && more.every((f) =>
      f === 'special' ? m.special : f === 'app' ? m.app : f === 'linked' ? Boolean(m.riotId) : f === 'online' ? now - (m.seen || 0) < ONLINE_MS : f === 'active' ? m.recent > 0 : true);
    const get = SORT_VAL[sort], dir = (sort === 'name' ? !asc : asc) ? 1 : -1;
    return all.filter((m) => pass(m) && (!q.trim() || matchName(m.nick, q) || matchName(m.discordName ?? '', q)))
      .sort((a, b) => { const x = get(a), y = get(b); return (x < y ? -1 : x > y ? 1 : 0) * dir || b.games - a.games; });
  }, [all, filters, sort, asc, q, now]);
  if (error) return <Empty>{error}</Empty>;
  if (!data) return <MembersSkeleton />;
  const todo = all.filter((m) => m.pending || m.review).sort((a, b) => Number(b.pending) - Number(a.pending) || a.joined - b.joined);
  const referrers = all.filter((m) => !m.pending && m.level >= 1);
  const toggle = (f: Filter) => setFilters(filters.includes(f) ? filters.filter((x) => x !== f) : [...filters, f]);
  return (
    <Swap on={rv} skeleton={<MembersSkeleton />}>
      <div className={`stf ${fadeCls(rv)}`}>
        <section className="stf-sec">
          <div className="stf-head big"><h2>승인이 필요한 멤버</h2><span className="meta">{todo.length ? `${todo.length}명` : ''}</span></div>
          {todo.length ? <div className="stf-todo">
            {todo.map((m) => <TodoCard key={m.id} api={api} m={m} need={data.reviewNeed} bonus={data.inviteBonus} referrers={referrers} onDone={reload} onOpen={onOpen} />)}
          </div> : <div className="card pad stf-none"><Icon name="check" />지금 승인할 멤버가 없어요. 디스코드 회원 역할이 없고 앱을 쓰는 멤버가 생기면 여기에 떠요.</div>}
        </section>
        <section className="stf-sec">
          <div className="stf-head big"><h2>전체 멤버</h2><span className="meta">{shown.length === all.length ? `${all.length}명` : `${shown.length} / ${all.length}명`}</span></div>
          <div className="card stf-filter">
            <div className="stf-frow">
              <label className="stf-search"><Icon name="search" /><input className="input sm" value={q} placeholder="이름·디스코드 이름" aria-label="이름으로 찾기" onChange={(e) => setQ(e.target.value)} /></label>
              <div className="stf-sort">
                <Select label="정렬" value={sort} options={SORTS} onChange={setSort} />
                <button type="button" className="btn sm ghost stf-dir" onClick={() => setAsc(!asc)} title={(sort === 'name' ? !asc : asc) ? '작은 것부터' : '큰 것부터'} aria-label="정렬 방향 바꾸기">
                  <Icon name={(sort === 'name' ? !asc : asc) ? 'arrowUp' : 'arrowDown'} />
                </button>
              </div>
            </div>
            <div className="stf-chips">
              <span className="stf-cl">단계</span>
              {FILTERS.filter((f) => f.group === 'level').map((f) => <button key={f.key} type="button" className={`chip ${filters.includes(f.key) ? 'on' : ''}`} onClick={() => toggle(f.key)}>{f.label}</button>)}
              <span className="stf-cl">조건</span>
              {FILTERS.filter((f) => f.group === 'more').map((f) => <button key={f.key} type="button" className={`chip ${filters.includes(f.key) ? 'on' : ''}`} onClick={() => toggle(f.key)}>{f.label}</button>)}
              {(filters.length > 0 || q) && <button type="button" className="stf-reset" onClick={() => { setFilters([]); setQ(''); }}>모두 풀기</button>}
            </div>
          </div>
          {shown.length ? <div className="card stf-list">
            {shown.map((m) => <StaffRow key={m.id} api={api} m={m} sort={sort} need={data.reviewNeed} onDone={reload} onOpen={onOpen} />)}
          </div> : <section className="card pad"><Empty>맞는 멤버가 없어요.</Empty></section>}
        </section>
      </div>
    </Swap>
  );
}

/** 승인 카드: 승인 대기 → '승인'(추천인이 없으면 고를 수 있다) · 정회원 심사 → '정회원 승인' */
function TodoCard({ api, m, need, bonus, referrers, onDone, onOpen }: { api: Api; m: StaffMember; need: number; bonus: number; referrers: StaffMember[]; onDone: () => void; onOpen?: (id: string) => void }) {
  const skins = useSkins();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [inviter, setInviter] = useState('');
  const act = async (action: string, body: Record<string, unknown> = {}) => {
    setBusy(true); setErr('');
    try { await api.post(`/api/staff/members/${m.id}/${action}`, body); onDone(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const days = Math.max(0, Math.floor((Date.now() - m.joined) / DAY));
  return (
    <div className={`card stf-tc ${m.pending ? 'k-pending' : 'k-review'} ${busy ? 'busy' : ''}`}>
      <span className={`stf-why ${m.pending ? 'k-pending' : 'k-review'}`}>{m.pending ? '승인 대기' : '정회원 심사'}</span>
      <button type="button" className="stf-person" onClick={() => onOpen?.(m.id)}>
        <MemberFace nick={m.nick} skin={m.skin} champion={m.main} size={44} skins={skins} />
        <span className="stf-pt"><b>{shortNick(m.nick)}</b><span className="meta">{m.discordName ? `@${m.discordName}` : ''}</span></span>
      </button>
      <dl className="stf-tc-f">
        <div><dt>가입</dt><dd>{days}일째</dd></div>
        <div><dt>판수</dt><dd>{m.games}</dd></div>
        <div><dt>운영진과</dt><dd>{m.staffGames}{!m.pending && <span className="stf-of">/{need}</span>}</dd></div>
      </dl>
      {m.pending && (m.inviter
        ? <p className="meta stf-tc-ref">추천인 <b>{shortNick(m.inviter.nick)}</b> · 승인하면 {bonus} 피스</p>
        : referrers.length > 0 && <div className="stf-tc-ref"><span className="meta">추천인</span><Select label="추천인" value={inviter} options={[['', '없음'], ...referrers.filter((r) => r.id !== m.id).map((r) => [r.id, shortNick(r.nick)] as [string, string])]} onChange={setInviter} /></div>)}
      <button type="button" className="btn primary stf-tc-go" disabled={busy} onClick={() => act(m.pending ? 'approve' : 'promote', m.pending && inviter ? { inviter } : {})}>{busy ? '처리 중…' : m.pending ? '승인' : '정회원 승인'}</button>
      {err && <p className="l stf-err">{err}</p>}
    </div>
  );
}

function StaffRow({ api, m, sort, need, onDone, onOpen }: { api: Api; m: StaffMember; sort: Sort; need: number; onDone: () => void; onOpen?: (id: string) => void }) {
  const skins = useSkins();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const locked = m.admin || m.level >= 5;
  const act = async (action: string, body: Record<string, unknown> = {}) => {
    setBusy(true); setErr('');
    try { await api.post(`/api/staff/members/${m.id}/${action}`, body); onDone(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const last = lastOf(m);
  const online = Date.now() - (m.seen || 0) < ONLINE_MS;
  const toReview = m.level === 1 && !m.review;
  const on = (s: Sort) => (sort === s ? 'on' : '');
  return (
    <div className={`stf-row ${busy ? 'busy' : ''}`}>
      <button type="button" className="stf-who" onClick={() => onOpen?.(m.id)} title="회원 페이지">
        <span className="stf-face"><MemberFace nick={m.nick} skin={m.skin} champion={m.main} size={44} skins={skins} />{online && <i className="stf-on" title="지금 접속" />}</span>
        <span className="stf-t">
          <b><span className="stf-nm">{shortNick(m.nick)}</span>{m.pending ? <PendingChip /> : <RoleBadge role={m.role} small />}{m.special && <span className="stf-sp">특별회원</span>}</b>
          <span className="meta">{[m.discordName ? `@${m.discordName}` : '', `${shortDate(m.joined)} 가입`, m.inviter ? `추천인 ${shortNick(m.inviter.nick)}` : '', m.invitedCount ? `초대 ${m.invitedCount}명` : '', m.app ? '' : '앱 안 씀'].filter(Boolean).join(' · ')}</span>
        </span>
      </button>
      <dl className="stf-stats">
        <div className={on('games')}><dt>판수</dt><dd>{m.games}</dd></div>
        <div className={on('winrate')}><dt>승률</dt><dd>{m.games ? pct(m.wins, m.games) : '–'}</dd></div>
        <div className={on('score')}><dt>점수</dt><dd>{m.games ? m.score : '–'}</dd></div>
        <div className={on('recent')}><dt>2주 판수</dt><dd>{m.recent}</dd></div>
        <div className={`${on('staff')} ${toReview ? 'prog' : ''}`}><dt>운영진과</dt><dd>{m.staffGames}{toReview && <span className="stf-of">/{need}</span>}</dd>
          {toReview && <i className="stf-pbar" aria-hidden="true"><i style={{ width: `${Math.min(100, (m.staffGames / need) * 100)}%` }} /></i>}</div>
        <div className={on('seen')}><dt>최근 활동</dt><dd className="sm">{online ? '지금' : last ? ago(last) : '–'}</dd></div>
      </dl>
      <div className="stf-act">
        {locked ? <span className="stf-lock"><Icon name="shield" />{m.admin ? '관리자' : '운영진'}</span> : <>
          <Select label="단계" value={String(Math.min(m.level, 3)) as '0' | '1' | '2' | '3'} options={LEVELS} onChange={(v) => { if (Number(v) !== m.level) void act('level', { level: Number(v) }); }} />
          <span className="stf-sw"><span className="meta">특별</span><Toggle label="특별회원" on={m.special} disabled={busy} onChange={(v) => act('special', { on: v })} /></span>
        </>}
      </div>
      {err && <p className="l stf-err">{err}</p>}
    </div>
  );
}

function StaffSkeleton() {
  return (
    <SkeletonFrame className="stf">
      <div className="stf-bar"><span className="stf-bar-t"><Bone w={220} h={14} /></span><Bone w={104} h={32} r="m" /></div>
      <section className="stf-kpis">{[0, 1, 2, 3].map((i) => <div key={i} className="stf-kpi"><Bone w={96} h={12} /><Bone w={56} h={28} /><Bone w={120} h={12} /></div>)}</section>
      <div className="stf-grid">
        <section className="card pad stf-card"><div className="stf-head"><h2>주별 활동</h2><Bone w={88} h={12} /></div><Bone w="100%" h={196} r="m" /></section>
        <section className="card pad stf-card"><div className="stf-head"><h2>멤버 구성</h2><Bone w={32} h={12} /></div><Bone w="100%" h={12} r="pill" /><div className="stf-mixl">{[0, 1, 2, 3, 4].map((i) => <Bone key={i} w="100%" h={16} />)}</div><div className="stf-foot">{[0, 1].map((i) => <div key={i}><Bone w={88} h={12} /><Bone w={48} h={20} /><Bone w="100%" h={4} r="pill" /></div>)}</div></section>
      </div>
      <div className="stf-grid">
        {['잘하고 있는 멤버', '챙겨야 할 멤버'].map((t) => <section key={t} className="card pad stf-card"><div className="stf-head"><h2>{t}</h2><Bone w={96} h={12} /></div>
          <div className="stf-people">{[0, 1, 2, 3].map((i) => <div key={i} className="stf-person"><Bone w={36} h={36} r="pill" /><span className="stf-pt"><Bone w={100} h={14} /><Bone w={160} h={12} /></span></div>)}</div></section>)}
      </div>
    </SkeletonFrame>
  );
}

function MembersSkeleton() {
  return (
    <SkeletonFrame className="stf">
      <section className="stf-sec">
        <div className="stf-head big"><h2>승인이 필요한 멤버</h2></div>
        <div className="stf-todo">{[0, 1].map((i) => <div key={i} className="card stf-tc"><Bone w={64} h={20} r="pill" /><div className="stf-person"><Bone w={44} h={44} r="pill" /><span className="stf-pt"><Bone w={100} h={14} /><Bone w={72} h={12} /></span></div>
          <div className="stf-tc-f">{[0, 1, 2].map((j) => <div key={j}><Bone w={32} h={12} /><Bone w={40} h={18} /></div>)}</div><Bone w="100%" h={40} r="m" /></div>)}</div>
      </section>
      <section className="stf-sec">
        <div className="stf-head big"><h2>전체 멤버</h2><Bone w={32} h={12} /></div>
        <div className="card stf-filter"><div className="stf-frow"><Bone w={240} h={32} r="m" /><Bone w={180} h={40} r="m" /></div><div className="stf-chips">{[0, 1, 2, 3, 4, 5, 6].map((i) => <Bone key={i} w={72} h={32} r="pill" />)}</div></div>
        <div className="card stf-list">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="stf-row"><span className="stf-who"><Bone w={44} h={44} r="pill" /><span className="stf-t"><Bone w={120} h={14} /><Bone w={180} h={12} /></span></span><div className="stf-stats">{[0, 1, 2, 3, 4, 5].map((j) => <div key={j}><Bone w={32} h={12} /><Bone w={44} h={20} /></div>)}</div><div className="stf-act"><Bone w={132} h={40} r="m" /></div></div>)}</div>
      </section>
    </SkeletonFrame>
  );
}
