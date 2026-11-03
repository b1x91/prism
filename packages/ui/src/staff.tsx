/**
 * 운영 (CLAUDE.md v3.107·v3.109·v3.110) — 운영진(역할 단계 5·관리자)에게만 보이는 메뉴. 앱·웹 공용.
 *  - 대시보드 (`StaffView`): 맨 위 '멤버 관리' 단추 + 지금 숫자 넷 · 주별 활동(8주) · 멤버 구성 · 최근 2주 잘하는 멤버 · 챙겨야 할 멤버
 *  - 멤버 관리 (`StaffMembersView`, 따로 한 페이지): 위에 승인이 필요한 멤버 카드(승인 대기 · 정회원 심사),
 *    아래에 전체 멤버 — 검색 · 거르기(단계·특별·앱·롤 연결·지금 접속·최근 2주 활동) · 정렬(최근 활동·판수·승률·점수·2주 판수·운영진과·가입)
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ago, matchName, pct, shortDate, shortNick, type Api, type StaffMember, type StaffMembers, type StaffOverview } from '@prism/core';
import { Empty, Hover, MemberFace, PendingChip, RoleBadge, Select, Toggle, useSkins } from './basics';
import { Icon } from './icons';
import { useLoad } from './crew';
import { useKept } from './kept';
import { ActBtn, actCls, useFlip, useResolve, type ActState } from './motion';
import { Bone, SkeletonFrame, Swap, fadeCls, useReveal } from './skeleton';
import { ReportDash, TodoStrip } from './staffdash';

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
/** 서버는 멤버 목록을 줄 때 처리할 멤버를 '본 것'으로 적는다 (v3.125) — 받으면 메뉴의 빨간 점을 끄도록 알린다 */
function useSeen(data: unknown, onSeen?: () => void) {
  const done = useRef(false);
  useEffect(() => { if (data && !done.current) { done.current = true; onSeen?.(); } }, [data, onSeen]);
}

export function StaffView({ api, onOpen, onMembers, onJoin, onInquiry, onSeen }: { api: Api; onOpen?: (id: string) => void; onMembers?: () => void; /** 가입 신청 보드로 (v3.148) */ onJoin?: () => void; /** 문의 작업 목록으로 (v3.159) */ onInquiry?: () => void; /** 처리할 멤버를 본 것으로 적었을 때 (메뉴의 빨간 점을 끈다) */ onSeen?: () => void }) {
  const { data, error, reload } = useLoad<StaffMembers>(api, '/api/staff/members');
  useSeen(data, onSeen);
  const rv = useReveal(Boolean(data));
  if (error) return <Empty>{error}</Empty>;
  if (!data) return <StaffSkeleton />;
  const o = data.overview;
  return (
    <Swap on={rv} skeleton={<StaffSkeleton />}>
      <div className={`stf ${fadeCls(rv)}`}>
        <TodoStrip data={data} onMembers={onMembers} onJoin={onJoin} onInquiry={onInquiry} />
        {o && <ReportDash o={o} online={o.kpi.online} onOpen={onOpen}
          care={<Care api={api} o={o} need={data.reviewNeed} onOpen={onOpen} onDone={reload} onMembers={onMembers} />}
          mix={<LevelMix levels={o.levels} app={o.kpi.app} linked={o.kpi.linked} total={o.kpi.members} />} />}
      </div>
    </Swap>
  );
}

// ───────── 대시보드 조각 (본문은 staffdash.tsx) ─────────

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


function Care({ api, o, need, onOpen, onDone, onMembers }: { api: Api; o: StaffOverview; need: number; onOpen?: (id: string) => void; onDone: () => unknown; onMembers?: () => void }) {
  const skins = useSkins();
  // 승인 → 완료 표시 → 줄이 빠지고 아래 줄이 미끄러져 올라온다 (v3.121)
  const act = useResolve(onDone);
  const list = o.care.filter((c) => !act.gone(c.id));
  // 마지막 줄이 빠져 비면 빈 안내가 서서히 (처음부터 비었으면 그대로)
  const had = useRef(o.care.length > 0);
  if (o.care.length) had.current = true;
  const box = useFlip<HTMLUListElement>(list.map((c) => c.id).join());
  const go = (id: string, action: string) => { act.run(id, () => api.post(`/api/staff/members/${id}/${action}`, {})).catch(() => { /* 아래 목록에서 다시 */ }); };
  const why = (c: StaffOverview['care'][number]) => c.kind === 'pending' ? (c.days <= 0 ? '오늘 가입했어요!' : c.days === 1 ? '어제 가입했어요' : `가입한 지 ${c.days}일`) : c.kind === 'review' ? `운영진과 ${c.n ?? need}판 함께했어요` : c.kind === 'quiet' ? `가입 ${c.days}일, 아직 판이 없어요` : `${c.days}일째 소식이 없어요`;
  return (
    <section className="card pad stf-card">
      <div className="stf-head"><h2>챙겨야 할 멤버</h2>{onMembers ? <button type="button" className="stf-more" onClick={onMembers}>{o.careTotal ? `${o.careTotal}명 모두 보기` : '멤버 관리'}<Icon name="chevR" /></button> : <span className="meta">{o.careTotal ? `${o.careTotal}명` : ''}</span>}</div>
      {list.length ? <ul className="stf-people" ref={box}>
        {list.map((c) => (
          <li key={c.id} data-flip={c.id} className={`stf-care ${actCls(act.state(c.id))}`}>
            <button type="button" className="stf-person" onClick={() => onOpen?.(c.id)}>
              <MemberFace nick={c.nick} skin={c.skin} champion={c.main} size={36} skins={skins} />
              <span className="stf-pt"><b>{shortNick(c.nick)}<span className={`stf-why k-${c.kind}`}>{CARE_LABEL[c.kind]}</span></b><span className="meta">{why(c)}</span></span>
            </button>
            {c.kind === 'pending' && <ActBtn className="btn primary sm stf-go" state={act.state(c.id)} label="승인" busy="승인 중" done="승인했어요" onClick={() => go(c.id, 'approve')} />}
            {c.kind === 'review' && <ActBtn className="btn sm stf-go promote" state={act.state(c.id)} label="승인" busy="승인 중" done="정회원이 됐어요" onClick={() => go(c.id, 'promote')} />}
          </li>
        ))}
      </ul> : <Empty className={had.current ? 'mo-in' : ''}>지금 챙길 멤버가 없어요.</Empty>}
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

export function StaffMembersView({ api, onOpen, onSeen }: { api: Api; onOpen?: (id: string) => void; onSeen?: () => void }) {
  const { data, error, reload } = useLoad<StaffMembers>(api, '/api/staff/members');
  useSeen(data, onSeen);
  // 승인 카드: 승인 → 완료 → 카드가 빠지고 옆 카드가 미끄러져 자리를 메운다 (v3.121)
  const todoAct = useResolve(reload);
  const hadTodo = useRef(false);
  const todoKeys = (data?.members ?? []).filter((m) => (m.pending || m.review) && !todoAct.gone(m.id)).map((m) => m.id).join();
  const todoBox = useFlip<HTMLDivElement>(todoKeys);
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
  const todoShown = todo.filter((m) => !todoAct.gone(m.id));
  if (todo.length) hadTodo.current = true;
  const toggle = (f: Filter) => setFilters(filters.includes(f) ? filters.filter((x) => x !== f) : [...filters, f]);
  return (
    <Swap on={rv} skeleton={<MembersSkeleton />}>
      <div className={`stf ${fadeCls(rv)}`}>
        <section className="stf-sec">
          <div className="stf-head big"><h2>승인이 필요한 멤버</h2><span className="meta">{todo.length ? `${todo.length}명` : ''}</span></div>
          {todoShown.length ? <div className="stf-todo" ref={todoBox}>
            {todoShown.map((m) => <TodoCard key={m.id} api={api} m={m} need={data.reviewNeed} bonus={data.inviteBonus} referrers={referrers} state={todoAct.state(m.id)} run={todoAct.run} onOpen={onOpen} />)}
          </div> : <div className={`card pad stf-none ${hadTodo.current ? 'mo-in' : ''}`}><Icon name="check" />지금 승인할 멤버가 없어요. 디스코드 회원 역할이 없고 앱을 쓰는 멤버가 생기면 여기에 떠요.</div>}
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
            <div className="stf-lh" aria-hidden="true"><span>멤버</span><span className="stf-lh-s"><span>판수</span><span>승률</span><span>{EXTRA[sort] ?? ''}</span><span>최근 활동</span></span><span>단계 · 특별회원</span></div>
            {shown.map((m) => <StaffRow key={m.id} api={api} m={m} sort={sort} need={data.reviewNeed} onDone={reload} onOpen={onOpen} />)}
          </div> : <section className="card pad"><Empty>맞는 멤버가 없어요.</Empty></section>}
        </section>
      </div>
    </Swap>
  );
}

/** 승인 카드: 승인 대기 → '승인'(추천인이 없으면 고를 수 있다) · 정회원 심사 → '정회원 승인' */
function TodoCard({ api, m, need, bonus, referrers, state, run, onOpen }: { api: Api; m: StaffMember; need: number; bonus: number; referrers: StaffMember[]; state: ActState; run: (id: string, f: () => Promise<unknown>) => Promise<void>; onOpen?: (id: string) => void }) {
  const skins = useSkins();
  const [err, setErr] = useState('');
  const [inviter, setInviter] = useState('');
  const act = (action: string, body: Record<string, unknown> = {}) => {
    setErr('');
    run(m.id, () => api.post(`/api/staff/members/${m.id}/${action}`, body)).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  };
  const days = Math.max(0, Math.floor((Date.now() - m.joined) / DAY));
  return (
    <div data-flip={m.id} className={`card stf-tc ${m.pending ? 'k-pending' : 'k-review'} ${actCls(state)}`}>
      <span className={`stf-why ${m.pending ? 'k-pending' : 'k-review'}`}>{m.pending ? '승인 대기' : '정회원 심사'}</span>
      <button type="button" className="stf-person" onClick={() => onOpen?.(m.id)}>
        <MemberFace nick={m.nick} skin={m.skin} champion={m.main} size={44} skins={skins} />
        <span className="stf-pt"><b>{shortNick(m.nick)}</b><span className="meta">{m.discordName ? `@${m.discordName}` : ''}</span></span>
      </button>
      <dl className="stf-tc-f">
        <div><dt>가입</dt><dd>{days <= 0 ? '오늘' : days === 1 ? '어제' : `${days}일 전`}</dd></div>
        <div><dt>판수</dt><dd>{m.games}</dd></div>
        <div><dt>운영진과</dt><dd>{m.staffGames}{!m.pending && <span className="stf-of">/{need}</span>}</dd></div>
      </dl>
      {m.pending && (m.inviter
        ? <p className="meta stf-tc-ref">추천인 <b>{shortNick(m.inviter.nick)}</b> · 승인하면 {bonus} 피스</p>
        : referrers.length > 0 && <div className="stf-tc-ref"><span className="meta">추천인</span><Select label="추천인" value={inviter} options={[['', '없음'], ...referrers.filter((r) => r.id !== m.id).map((r) => [r.id, shortNick(r.nick)] as [string, string])]} onChange={setInviter} /></div>)}
      <ActBtn className={`btn stf-tc-go ${m.pending ? 'primary' : 'promote'}`} state={state} label="승인" busy="승인 중" done={m.pending ? '승인했어요' : '정회원이 됐어요'} onClick={() => act(m.pending ? 'approve' : 'promote', m.pending && inviter ? { inviter } : {})} />
      {err && <p className="l stf-err">{err}</p>}
    </div>
  );
}

/** 정렬을 이 값으로 골랐을 때만 줄에 한 칸 더 */
const EXTRA: Partial<Record<Sort, string>> = { score: '점수', recent: '2주 판수', staff: '운영진과', joined: '가입' };

function StaffRow({ api, m, sort, need, onDone, onOpen }: { api: Api; m: StaffMember; sort: Sort; need: number; onDone: () => unknown; onOpen?: (id: string) => void }) {
  const skins = useSkins();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const locked = m.admin || m.level >= 5;
  const [want, setWant] = useState<{ level?: number; special?: boolean }>({});
  const act = async (action: string, body: Record<string, unknown> = {}) => {
    setBusy(true); setErr('');
    // 고른 값을 바로 보이고, 새 목록을 받을 때까지 처리 중으로 — 예전 값으로 잠깐 돌아갔다가 바뀌지 않게 (v3.121)
    setWant(action === 'level' ? { level: Number(body.level) } : action === 'special' ? { special: Boolean(body.on) } : {});
    try { await api.post(`/api/staff/members/${m.id}/${action}`, body); await onDone(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); setWant({}); }
  };
  const last = lastOf(m);
  const online = Date.now() - (m.seen || 0) < ONLINE_MS;
  const toReview = m.level === 1 && !m.review;
  const on = (s: Sort) => (sort === s ? 'on' : '');
  // 줄에는 핵심만(판수·승률·최근 활동 + 고른 정렬 값), 나머지는 마우스를 올리면 (v3.126)
  const extra = EXTRA[sort];
  const score = m.games ? String(m.score) : '–';
  const val: Record<string, string> = { score, recent: String(m.recent), staff: `${m.staffGames}${toReview ? `/${need}` : ''}`, joined: shortDate(m.joined) };
  const tip = () => (
    <div className="stf-mtip">
      <b>{m.nick}</b>
      <span className="meta">{[m.discordName ? `@${m.discordName}` : '', `${shortDate(m.joined)} 가입`].filter(Boolean).join(' · ')}</span>
      <dl>
        <div><dt>점수</dt><dd>{score}</dd></div>
        <div><dt>2주 판수</dt><dd>{m.recent}</dd></div>
        <div><dt>운영진과</dt><dd>{m.staffGames}{toReview ? ` / ${need}` : ''}</dd></div>
        <div><dt>추천인</dt><dd>{m.inviter ? shortNick(m.inviter.nick) : '–'}</dd></div>
        <div><dt>초대</dt><dd>{m.invitedCount}명</dd></div>
        <div><dt>앱 · 롤</dt><dd>{m.app ? '앱 사용' : '앱 안 씀'} · {m.riotId ? '연결' : '미연결'}</dd></div>
      </dl>
    </div>
  );
  return (
    <div className={`stf-row ${busy ? 'busy' : ''}`}>
      <Hover tip={tip} className="stf-hov">
        <button type="button" className="stf-who" onClick={() => onOpen?.(m.id)}>
          <span className="stf-face"><MemberFace nick={m.nick} skin={m.skin} champion={m.main} size={40} skins={skins} />{online && <i className="stf-on" title="지금 접속" />}</span>
          <span className="stf-t"><b><span className="stf-nm">{shortNick(m.nick)}</span>{m.pending ? <PendingChip /> : <RoleBadge role={m.role} small />}{m.special && <span className="stf-sp">특별회원</span>}</b></span>
        </button>
      </Hover>
      <dl className="stf-stats">
        <div className={on('games')}><dt>판수</dt><dd>{m.games}</dd></div>
        <div className={on('winrate')}><dt>승률</dt><dd>{m.games ? pct(m.wins, m.games) : '–'}</dd></div>
        <div className={`${extra ? 'on' : 'none'}`}>{extra && <><dt>{extra}</dt><dd>{val[sort]}</dd></>}</div>
        <div className={on('seen')}><dt>최근 활동</dt><dd className="sm">{online ? '지금' : last ? ago(last) : '–'}</dd></div>
      </dl>
      <div className="stf-act">
        {locked ? <span className="stf-lock"><Icon name="shield" />{m.admin ? '관리자' : '운영진'}</span> : <>
          <Select label="단계" value={String(Math.min(want.level ?? m.level, 3)) as '0' | '1' | '2' | '3'} options={LEVELS} onChange={(v) => { if (Number(v) !== m.level) void act('level', { level: Number(v) }); }} />
          <span className="stf-sw"><span className="meta">특별</span><Toggle label="특별회원" on={want.special ?? m.special} disabled={busy} onChange={(v) => act('special', { on: v })} /></span>
        </>}
      </div>
      {err && <p className="l stf-err">{err}</p>}
    </div>
  );
}

function StaffSkeleton() {
  const head = (t: string, w = 96) => <div className="sd-head"><h2>{t}</h2><Bone w={w} h={12} /></div>;
  return (
    <SkeletonFrame className="stf">
      <div className="sd-todo"><span className="sd-todo-t"><Bone w={104} h={16} /></span><span className="sd-todo-l">{[0, 1, 2, 3].map((i) => <span key={i} className="sd-ti"><Bone w={24} h={24} r="pill" /><Bone w={56} h={12} /></span>)}</span><span className="sd-todo-a"><Bone w={96} h={32} r="m" /><Bone w={104} h={32} r="m" /></span></div>
      <div className="sd-bar"><div className="sd-range"><Bone w={180} h={12} /><Bone w={88} h={12} /></div><Bone w={152} h={40} r="m" /></div>
      <section className="sd-kpis">{[0, 1, 2, 3].map((i) => <div key={i} className="sd-kpi"><Bone w={80} h={14} /><Bone w={56} h={28} /><Bone w={140} h={12} /><div className="sd-spark"><Bone w="100%" h={36} r="m" /></div></div>)}</section>
      <div className="sd-row">
        <section className="card pad sd-card">{head('주별 판과 활동 멤버', 112)}<div className="sd-legend"><Bone w={240} h={12} /></div><Bone w="100%" h={248} r="m" /></section>
        <section className="card pad sd-card">{head('언제 모이나요')}<Bone w="100%" h={228} r="m" /><Bone w={220} h={14} /></section>
      </div>
      <div className="sd-row">
        <section className="card pad sd-card">{head('잘하고 있는 멤버', 180)}<div className="sd-tbl">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="sd-tr"><span className="sd-who"><Bone w={20} h={14} /><Bone w={32} h={32} r="pill" /><Bone w={96} h={14} /></span><Bone w={24} h={14} /><Bone w="100%" h={8} r="pill" /><Bone w={24} h={14} /><Bone w="100%" h={8} r="pill" /></div>)}</div></section>
        <section className="card pad sd-card">{head('새 멤버 정착', 104)}<ol className="sd-funnel">{[0, 1, 2, 3, 4, 5].map((i) => <li key={i}><Bone w={72} h={12} /><Bone w={`${100 - i * 12}%`} h={24} r="s" /><Bone w={48} h={12} /></li>)}</ol></section>
      </div>
      <div className="sd-row even">
        <section className="card pad stf-card"><div className="stf-head"><h2>챙겨야 할 멤버</h2><Bone w={96} h={12} /></div>
          <div className="stf-people">{[0, 1, 2].map((i) => <div key={i} className="stf-person"><Bone w={36} h={36} r="pill" /><span className="stf-pt"><Bone w={100} h={14} /><Bone w={160} h={12} /></span></div>)}</div></section>
        <section className="card pad stf-card"><div className="stf-head"><h2>멤버 구성</h2><Bone w={32} h={12} /></div><Bone w="100%" h={12} r="pill" /><div className="stf-mixl">{[0, 1, 2, 3, 4].map((i) => <Bone key={i} w="100%" h={16} />)}</div></section>
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
        <div className="card stf-list">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="stf-row"><span className="stf-who"><Bone w={40} h={40} r="pill" /><span className="stf-t"><Bone w={120} h={16} /></span></span><div className="stf-stats">{[0, 1, 2, 3].map((j) => <div key={j}><Bone w={44} h={20} /></div>)}</div><div className="stf-act"><Bone w={132} h={40} r="m" /></div></div>)}</div>
      </section>
    </SkeletonFrame>
  );
}
