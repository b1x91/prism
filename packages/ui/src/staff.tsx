/**
 * 운영 (CLAUDE.md v3.107 → v3.160) — 운영진(역할 단계 5·관리자)에게만 보이는 메뉴. 앱·웹 공용. 위 탭 = 대시보드 · 멤버 · 할 일 · 문의.
 *  - 대시보드 (`StaffView`): 본문은 staffdash.tsx
 *  - 멤버 (`StaffMembersView`): 멤버 구성(누르면 그 단계만) · 검색·정렬·조건 · 목록(최근 8주 막대) · 줄을 누르면 오른쪽 상세 서랍
 *  - 할 일 (`StaffTodoView`): 남은 개수 고리 · 승인 대기 · 정회원 심사 · 가입 신청 단계 보드 · 우수회원 후보(추천)
 *  - 정회원·우수회원은 카톡방에 있는 멤버만 (v3.190): '카톡방 확인'(`KakaoCheck`)을 켜야 승인·선발 단추가 열린다. 서버도 막는다.
 *  - 문의 (`StaffInquiryView`, staffinq.tsx)
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { JOIN_TIMES, ago, matchName, pct, shortNick, type Api, type StaffApplication, type StaffApplications, type StaffMember, type StaffMembers } from '@prism/core';
import { Empty, GuestFace, MemberFace, PendingChip, Select, Seg, Toggle, useSkins } from './basics';
import { Icon } from './icons';
import { useLoad } from './crew';
import { useKept } from './kept';
import { ActBtn, actCls, useFlip, useResolve, type ActState } from './motion';
import { Bone, SkeletonFrame, Swap, fadeCls, useReveal } from './skeleton';
import { ReportDash } from './staffdash';

const ONLINE_MS = 150_000;
const DAY = 86_400_000;
/** 단계: 디스코드 역할과 같은 색 (승인 대기는 금빛, 역할 없음은 회색) */
type LvKey = 'pending' | 'none' | 'associate' | 'regular' | 'excellent' | 'staff';
const LV: Record<LvKey, { name: string; color: string }> = {
  pending: { name: '승인 대기', color: '#c3951d' }, none: { name: '역할 없음', color: 'var(--text-3)' }, associate: { name: '준회원', color: '#3498db' },
  regular: { name: '정회원', color: '#e74c3c' }, excellent: { name: '우수회원', color: '#d4a017' }, staff: { name: '운영진', color: '#607d8b' },
};
const LV_ORDER: LvKey[] = ['pending', 'none', 'associate', 'regular', 'excellent', 'staff'];
const lvOf = (m: StaffMember): LvKey => (m.pending ? 'pending' : m.admin || m.level >= 5 ? 'staff' : (['none', 'associate', 'regular', 'excellent'] as const)[Math.min(m.level, 3)]);
const lastOf = (m: StaffMember) => Math.max(m.seen || 0, m.lastPlayed || 0);
const online = (m: StaffMember) => Date.now() - (m.seen || 0) < ONLINE_MS;
const joinedDays = (t: number) => Math.max(0, Math.floor((Date.now() - t) / DAY));
const joinedText = (t: number) => { const d = joinedDays(t); return d <= 0 ? '오늘 가입했어요' : d === 1 ? '어제 가입했어요' : `가입한 지 ${d}일`; };

/** 서버는 멤버 목록을 줄 때 처리할 멤버를 '본 것'으로 적는다 (v3.125) — 받으면 메뉴의 빨간 점을 끄도록 알린다 */
function useSeen(data: unknown, onSeen?: () => void) {
  const done = useRef(false);
  useEffect(() => { if (data && !done.current) { done.current = true; onSeen?.(); } }, [data, onSeen]);
}

// ═════════ 대시보드 ═════════

export function StaffView({ api, onOpen, onSeen }: { api: Api; onOpen?: (id: string) => void; onSeen?: () => void }) {
  const { data, error } = useLoad<StaffMembers>(api, '/api/staff/members');
  useSeen(data, onSeen);
  const rv = useReveal(Boolean(data));
  if (error) return <Empty>{error}</Empty>;
  if (!data) return <DashSkeleton />;
  return (
    <Swap on={rv} skeleton={<DashSkeleton />}>
      <div className={`sv ${fadeCls(rv)}`}>
        {data.overview ? <ReportDash o={data.overview} reviewWaiting={data.members.filter((m) => m.review).length} onOpen={onOpen} /> : <Empty>대시보드를 불러오지 못했어요.</Empty>}
      </div>
    </Swap>
  );
}

function DashSkeleton() {
  const head = (t: string, w = 96) => <div className="sv-head"><h2>{t}</h2><Bone w={w} h={12} /></div>;
  return (
    <SkeletonFrame className="sv">
      <section className="card sv-card sv-rings">{[0, 1, 2, 3].map((i) => <div key={i} className="sv-ring"><Bone w={64} h={64} r="round" className="sv-ring-sk" /><div><Bone w="50%" h={12} /><Bone w="60%" h={28} /><Bone w="90%" h={12} /></div></div>)}</section>
      <div className="sv-row">
        <section className="card sv-card">{head('주별 판과 활동 멤버', 120)}<Bone w="80%" h={14} /><Bone w="100%" h={300} r="m" /></section>
        <section className="card sv-card">{head('언제 모이나요', 100)}<Bone w="100%" h={220} r="m" /><Bone w="100%" h={40} r="m" /></section>
      </div>
      <section className="card sv-card">{head('잘하고 있는 멤버', 200)}<div className="sv-crit">{[0, 1, 2, 3, 4].map((i) => <div key={i}><Bone w={80} h={14} /><Bone w="90%" h={12} /></div>)}</div>{[0, 1, 2].map((i) => <div key={i} className="sv-mr"><Bone w={16} h={14} /><span className="who"><Bone w={36} h={36} r="round" /><Bone w={96} h={14} /></span><Bone w="100%" h={10} r="pill" /><Bone w={32} h={20} /></div>)}</section>
      <section className="card sv-card">{head('온보딩 현황', 120)}<div className="sv-steps skel">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="sv-st skel"><Bone w={40} h={12} /><Bone w={80} h={14} /><Bone w={60} h={28} /><Bone w="80%" h={12} /><Bone w="90%" h={24} /></div>)}</div></section>
    </SkeletonFrame>
  );
}

// ═════════ 멤버 ═════════

type Cond = 'online' | 'active' | 'special' | 'app' | 'linked' | 'nokakao';
type Sort = 'seen' | 'games' | 'winrate' | 'score' | 'recent' | 'joined';
const CONDS: [Cond, string, (m: StaffMember) => boolean][] = [
  ['online', '지금 접속', online], ['active', '2주 활동', (m) => m.recent > 0], ['special', '특별회원', (m) => m.special],
  ['app', '앱 사용', (m) => m.app], ['linked', '롤 연결', (m) => Boolean(m.riotId)], ['nokakao', '카톡방 미확인', (m) => !m.pending && !m.admin && m.level < 5 && m.kakao === false],
];
const SORTS: [Sort, string][] = [['seen', '최근 활동'], ['games', '판수'], ['winrate', '승률'], ['score', '점수'], ['recent', '2주 판'], ['joined', '가입일']];
const SORT_VAL: Record<Sort, (m: StaffMember) => number> = {
  seen: lastOf, games: (m) => m.games, winrate: (m) => (m.games >= 5 ? m.wins / m.games : -1), score: (m) => (m.games ? m.score : -1), recent: (m) => m.recent, joined: (m) => m.joined,
};
const LEVELS: ['0' | '1' | '2' | '3', string][] = [['0', '역할 없음'], ['1', '준회원'], ['2', '정회원'], ['3', '우수회원']];
/** 정회원·우수회원으로 올리려는데 카톡방 확인이 없는가 (예전 서버는 kakao 가 없어 막지 않는다) */
const kakaoBlocks = (m: StaffMember, to: number) => to >= 2 && to > Math.min(m.level, 3) && m.kakao === false;
const KAKAO_NEED = '카톡방에 있는지 먼저 확인해 주세요. 카톡방에 없는 멤버는 정회원·우수회원이 될 수 없어요.';

/**
 * 카톡방 확인 한꺼번에 (v3.191): '카톡방 미확인' 거르기를 켜면 목록 위에 뜬다. 지금 보이는 멤버(검색·거르기 그대로) 전부를 한 번에.
 * 한 번 더 눌러야 처리된다 — 잘못 누르면 멤버마다 다시 풀어야 하므로.
 */
function KakaoBulk({ api, list, pending, onDone }: { api: Api; list: StaffMember[]; pending: string[]; onDone: () => Promise<unknown> }) {
  const [ask, setAsk] = useState(false);
  const [st, setSt] = useState<ActState>(undefined);
  const [err, setErr] = useState('');
  const [paste, setPaste] = useState(false);
  const [text, setText] = useState('');
  const [pst, setPst] = useState<ActState>(undefined);
  const [res, setRes] = useState<{ matched: { id: string; nick: string }[]; left: string[] } | null>(null);
  const [showLeft, setShowLeft] = useState(false);
  const n = list.length;
  useEffect(() => { setAsk(false); }, [n]);
  const go = async () => {
    if (!ask) { setAsk(true); return; }
    setSt('busy'); setErr('');
    try {
      await api.post('/api/staff/kakao-bulk', { ids: list.map((m) => m.id) });
      setSt('done');
      await new Promise((r) => setTimeout(r, 700));
      await onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setSt(undefined); setAsk(false); }
  };
  const send = async () => {
    setPst('busy'); setErr('');
    try {
      const r = await api.post<{ matched: { id: string; nick: string }[]; left: string[] }>('/api/staff/kakao-names', { text });
      setPst('done');
      await new Promise((ok) => setTimeout(ok, 600));
      await onDone();
      setRes(r); setText(''); setPaste(false);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setPst(undefined); }
  };
  return (
    <div className={`sv-kkbulk ${ask ? 'ask' : ''}`}>
      <div className="sv-kk-row">
        <div className="sv-kk-txt"><b>{ask ? `${n}명 모두 카톡방에 있는 게 맞나요?` : n ? `카톡방 확인이 안 된 멤버 ${n}명` : '카톡방 확인이 안 된 멤버가 없어요'}</b>
          <small>{ask ? '한 번 더 누르면 처리돼요. 톡방에 없는 분은 나중에 멤버 서랍에서 풀 수 있어요.' : '톡방 명단을 붙여 넣으면 이름이 맞는 멤버를 찾아 확인해요. 보이는 멤버를 한 번에 확인할 수도 있어요.'}</small>
          {err && <small className="sv-err">{err}</small>}</div>
        <span className="sv-kkbulk-acts">
          {ask && st !== 'busy' && st !== 'done' && <button type="button" className="btn" onClick={() => setAsk(false)}>취소</button>}
          {!ask && <button type="button" className={`btn ${paste ? 'on' : ''}`} onClick={() => setPaste((v) => !v)}>톡방 명단 붙여 넣기</button>}
          {n > 0 && <ActBtn className={`btn ${ask ? 'primary' : ''}`} state={st} label={ask ? `${n}명 확인` : '보이는 멤버 한 번에 확인'} busy="확인 중" done="확인했어요" onClick={() => void go()} />}
        </span>
      </div>
      {paste && <div className="sv-kk-paste">
        <textarea value={text} rows={4} placeholder="톡방 이름을 쉼표나 줄바꿈으로 나눠 붙여 넣어 주세요 (예: 찹쌀떡, 멍 대 장, 티  모)" aria-label="톡방 명단" onChange={(e) => setText(e.target.value)} />
        <div><small>롤 이름·디스코드 이름과 맞춰요. 띄어쓰기와 #태그는 보지 않아요. 아직 가입하지 않은 분은 명단에 남았다가 가입하면 저절로 확인돼요.</small>
          <ActBtn className="btn primary" state={pst} disabled={!text.trim()} label="명단으로 확인" busy="맞추는 중" done="확인했어요" onClick={() => void send()} /></div>
      </div>}
      {res && <p className="sv-kk-res"><b>{res.matched.length}명 확인했어요.</b>{res.left.length > 0 && <> 명단에만 있는 {res.left.length}명은 가입하면 저절로 확인돼요.</>}</p>}
      {pending.length > 0 && <div className="sv-kk-left">
        <button type="button" className="sv-more" aria-expanded={showLeft} onClick={() => setShowLeft((v) => !v)}>톡방에는 있지만 아직 Prism 에 없는 분 {pending.length}명<Icon name="chevD" /></button>
        {showLeft && <p>{pending.join(' · ')}</p>}
      </div>}
    </div>
  );
}

/**
 * 카톡방 확인 (v3.190): 누르면 바로 저장되는 체크. 켜져 있어야 정회원 승인·우수회원 선발이 열린다.
 * 가입 신청에 적은 카톡 이름이 있으면 함께 보여 준다 (톡방 멤버 목록에서 찾기 쉽게).
 */
function KakaoCheck({ api, m, on, onChange, onSaved, compact }: { api: Api; m: StaffMember; on: boolean; onChange: (v: boolean) => void; onSaved?: () => void; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const flip = async () => {
    const v = !on;
    setBusy(true); setErr(''); onChange(v);
    try { await api.post(`/api/staff/members/${m.id}/kakao`, { on: v }); onSaved?.(); } catch (e) { onChange(!v); setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return (
    <span className={`sv-kk ${compact ? 'compact' : ''}`}>
      <button type="button" role="checkbox" aria-checked={on} className={`sv-kkbox ${on ? 'on' : ''} ${busy ? 'busy' : ''}`} disabled={busy} onClick={(e) => { e.stopPropagation(); void flip(); }}>
        <i aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M3.5 8.4 6.6 11.3 12.5 5" /></svg></i>
        <span>카톡방에 있어요</span>{m.kakaoName && <em>카톡 '{m.kakaoName}'</em>}
      </button>
      {err && <small className="sv-err">{err}</small>}
    </span>
  );
}

export function StaffMembersView({ api, onOpen, onSeen }: { api: Api; onOpen?: (id: string) => void; onSeen?: () => void }) {
  const { data, error, reload } = useLoad<StaffMembers>(api, '/api/staff/members');
  useSeen(data, onSeen);
  const rv = useReveal(Boolean(data));
  const [q, setQ] = useKept('staff.q', '');
  const [lvs, setLvs] = useKept<LvKey[]>('staff.lv', []);
  const [conds, setConds] = useKept<Cond[]>('staff.cond', []);
  const [sort, setSort] = useKept<Sort>('staff.sort2', 'seen');
  const [more, setMore] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const all = data?.members ?? [];
  const shown = useMemo(() => {
    const get = SORT_VAL[sort];
    return all.filter((m) => (!lvs.length || lvs.includes(lvOf(m))) && conds.every((c) => CONDS.find((x) => x[0] === c)![2](m)) && (!q.trim() || matchName(m.nick, q) || matchName(m.discordName ?? '', q)))
      .sort((a, b) => get(b) - get(a) || b.games - a.games);
  }, [all, lvs, conds, sort, q]);
  if (error) return <Empty>{error}</Empty>;
  if (!data) return <MembersSkeleton />;
  const toggleLv = (k: LvKey) => { setMore(false); setLvs(lvs.includes(k) ? lvs.filter((x) => x !== k) : [...lvs, k]); };
  const toggleC = (k: Cond) => { setMore(false); setConds(conds.includes(k) ? conds.filter((x) => x !== k) : [...conds, k]); };
  const cur = open ? all.find((m) => m.id === open) ?? null : null;
  const list = more ? shown : shown.slice(0, 20);
  return (
    <Swap on={rv} skeleton={<MembersSkeleton />}>
      <div className={`sv ${fadeCls(rv)}`}>
        <Mix all={all} sel={lvs} onToggle={toggleLv} />
        <section className="card sv-card sv-mlist">
          <div className="sv-mtools glass">
            <label className="sv-search"><Icon name="search" /><input value={q} placeholder="이름 · 디스코드 이름으로 찾기" aria-label="이름으로 찾기" autoComplete="off" onChange={(e) => { setMore(false); setQ(e.target.value); }} /></label>
            <div className="sv-sort" role="radiogroup" aria-label="정렬">{SORTS.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={sort === k} className={sort === k ? 'on' : ''} onClick={() => setSort(k)}>{l}</button>)}</div>
            <div className="sv-filters">
              {lvs.map((k) => <button key={k} type="button" className="sv-fchip on" onClick={() => toggleLv(k)}><i style={{ background: LV[k].color }} />{LV[k].name}<Icon name="x" /></button>)}
              {lvs.length > 0 && <i className="sep" aria-hidden="true" />}
              {CONDS.map(([k, l]) => <button key={k} type="button" className={`sv-fchip ${conds.includes(k) ? 'on' : ''}`} aria-pressed={conds.includes(k)} onClick={() => toggleC(k)}>{l}</button>)}
              {(lvs.length > 0 || conds.length > 0 || q) && <button type="button" className="sv-fchip clear" onClick={() => { setLvs([]); setConds([]); setQ(''); }}>모두 풀기</button>}
            </div>
          </div>
          {conds.includes('nokakao') && <KakaoBulk api={api} list={shown} pending={data.kakaoPending ?? []} onDone={reload} />}
          <div className="sv-mhead" aria-hidden="true">
            <span>멤버 <b>{shown.length}</b></span><span className="c-spark">최근 8주</span>
            <span className={sort === 'games' ? 'on' : ''}>판</span><span className={sort === 'winrate' ? 'on' : ''}>승률</span>
            <span className={sort === 'score' ? 'on' : ''}>점수</span><span className={sort === 'seen' ? 'on' : ''}>최근 활동</span><span>단계</span>
          </div>
          {list.length ? list.map((m) => <MemberRow key={m.id} api={api} m={m} sort={sort} onOpen={() => setOpen(m.id)} onDone={reload} />)
            : <div className="sv-mempty">조건에 맞는 멤버가 없어요</div>}
          {!more && shown.length > 20 && <div className="sv-mmore"><button type="button" className="btn sm" onClick={() => setMore(true)}>{shown.length - 20}명 더 보기</button></div>}
        </section>
        <Drawer api={api} m={cur} need={data.reviewNeed} onClose={() => setOpen(null)} onDone={reload} onProfile={onOpen} />
      </div>
    </Swap>
  );
}

function Mix({ all, sel, onToggle }: { all: StaffMember[]; sel: LvKey[]; onToggle: (k: LvKey) => void }) {
  const rows = LV_ORDER.map((k) => ({ k, n: all.filter((m) => lvOf(m) === k).length })).filter((r) => r.n > 0);
  const app = all.filter((m) => m.app).length, linked = all.filter((m) => m.riotId).length, sp = all.filter((m) => m.special).length, now = all.filter(online).length;
  const tot = all.length || 1;
  return (
    <section className="card sv-card">
      <div className="sv-head"><h2>멤버 구성</h2><span className="meta">{all.length}명 · 지금 접속 {now}명</span></div>
      <div className="sv-mix">
        <div className={`sv-mixbar ${sel.length ? 'sel' : ''}`}>{rows.map((r) => <button key={r.k} type="button" className={sel.includes(r.k) ? 'on' : ''} style={{ flex: r.n, background: LV[r.k].color }} title={`${LV[r.k].name} ${r.n}명`} aria-label={`${LV[r.k].name} ${r.n}명만 보기`} onClick={() => onToggle(r.k)} />)}</div>
        <div className="sv-mixleg">{rows.map((r) => <button key={r.k} type="button" className={sel.includes(r.k) ? 'on' : ''} aria-pressed={sel.includes(r.k)} onClick={() => onToggle(r.k)}><i style={{ background: LV[r.k].color }} />{LV[r.k].name} <b>{r.n}</b></button>)}</div>
        <div className="sv-mixside"><span><b>{sp}</b>특별회원</span><span><b>{Math.round((app / tot) * 100)}%</b>앱 사용 ({app}명)</span><span><b>{Math.round((linked / tot) * 100)}%</b>롤 계정 연결 ({linked}명)</span></div>
      </div>
    </section>
  );
}

function Spark({ wk, color }: { wk: number[]; color: string }) {
  const w = 88, h = 24, mx = Math.max(1, ...wk), bw = 8, gap = (w - bw * wk.length) / Math.max(1, wk.length - 1);
  return <svg className="sv-spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">{wk.map((v, k) => { const bh = Math.max(2, (v / mx) * h); return <rect key={k} x={k * (bw + gap)} y={h - bh} width={bw} height={bh} rx="2" fill={k === wk.length - 1 ? 'var(--sv-now)' : color} opacity={k === wk.length - 1 ? 1 : v ? 0.75 : 0.22} />; })}</svg>;
}

function MemberRow({ api, m, sort, onOpen, onDone }: { api: Api; m: StaffMember; sort: Sort; onOpen: () => void; onDone: () => Promise<unknown> }) {
  const skins = useSkins();
  const [busy, setBusy] = useState(false);
  const [want, setWant] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const locked = m.admin || m.level >= 5;
  const wr = m.games ? m.wins / m.games : 0;
  const live = online(m), last = lastOf(m);
  const setLevel = async (v: string) => {
    const lv = Number(v);
    if (lv === Math.min(m.level, 3) && !m.pending) return;
    if (kakaoBlocks(m, lv)) { setErr(KAKAO_NEED); return; }
    setBusy(true); setErr(''); setWant(lv);
    try { await api.post(`/api/staff/members/${m.id}/level`, { level: lv }); await onDone(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); setWant(null); }
  };
  const sub = [m.discordName ? `@${m.discordName}` : '', `가입 ${joinedDays(m.joined)}일째`, m.level === 1 && !m.pending ? `운영진과 ${m.staffGames}판` : ''].filter(Boolean).join(' · ');
  return (
    <div className={`sv-mrow ${busy ? 'busy' : ''}`} tabIndex={0} role="button" aria-label={`${m.nick} 상세`} onClick={(e) => { if (!(e.target as HTMLElement).closest('.sv-lvl')) onOpen(); }} onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) onOpen(); }}>
      <div className="who"><span className="sv-av"><MemberFace nick={m.nick} skin={m.skin} champion={m.main} size={40} skins={skins} />{live && <i className="dot" title="지금 접속" />}</span><div><b><span>{shortNick(m.nick)}</span>{m.special && <span className="sv-rolec" style={{ ['--rc' as string]: '#9b59b6' }}>특별</span>}{!m.pending && !locked && m.level >= 2 && m.kakao === false && <span className="sv-nokk" title="카톡방에 있는지 아직 확인하지 않았어요">카톡 미확인</span>}</b><small>{sub}</small></div></div>
      <div className="c-spark">{m.wk ? <Spark wk={m.wk} color={LV[lvOf(m)].color} /> : null}</div>
      <div className={`nn c-n ${sort === 'games' ? 'on' : ''}`}>{m.games}{sort === 'recent' && <small>2주 {m.recent}</small>}{sort === 'joined' && <small>{new Date(m.joined).getMonth() + 1}/{new Date(m.joined).getDate()}</small>}</div>
      <div className={`sv-wr c-wr ${wr >= 0.55 && m.games >= 5 ? 'hi' : ''} ${sort === 'winrate' ? 'on' : ''}`}><b>{m.games ? pct(m.wins, m.games) : '–'}</b><span className="t"><i style={{ width: `${wr * 100}%` }} /><u /></span></div>
      <div className={`nn c-sc ${sort === 'score' ? 'on' : ''}`}>{m.games ? m.score : '–'}</div>
      <div className={`sv-ago c-ago ${live ? 'live' : ''}`}>{live ? '지금 접속' : last ? ago(last) : '–'}</div>
      <div className="sv-lvl" onClick={(e) => e.stopPropagation()}>
        {locked ? <span className="sv-lock"><Icon name="shield" />{m.admin ? '관리자' : '운영진'}</span>
          : <Select label={`${m.nick} 단계`} value={String(want ?? (m.pending ? 0 : Math.min(m.level, 3))) as '0' | '1' | '2' | '3'} options={m.pending ? [['0', '승인 대기'], ...LEVELS.slice(1)] : LEVELS} onChange={setLevel} />}
      </div>
      <div className="mob"><span><b>{m.games}</b>판</span><span><b>{m.games ? pct(m.wins, m.games) : '–'}</b> 승률</span><span>{live ? '지금 접속' : last ? ago(last) : '–'}</span></div>
      {err && <p className="sv-err">{err}</p>}
    </div>
  );
}

/** 멤버 상세 서랍: 오른쪽에서 밀려 나온다. 단계 바꾸기 · 특별회원 · 정회원까지 · 최근 8주 · 자주 함께한 멤버 */
function Drawer({ api, m, need, onClose, onDone, onProfile }: { api: Api; m: StaffMember | null; need: number; onClose: () => void; onDone: () => Promise<unknown>; onProfile?: (id: string) => void }) {
  const skins = useSkins();
  const [shown, setShown] = useState<StaffMember | null>(m);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [want, setWant] = useState<{ level?: number; special?: boolean }>({});
  const [kk, setKk] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (m) { setShown(m); setErr(''); const r = requestAnimationFrame(() => requestAnimationFrame(() => setOn(true))); return () => cancelAnimationFrame(r); }
    setOn(false);
    const t = setTimeout(() => setShown(null), 420);
    return () => clearTimeout(t);
  }, [m]);
  useEffect(() => { if (!m) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [m, onClose]);
  if (!shown || typeof document === 'undefined') return null;
  const x = m ?? shown;
  const locked = x.admin || x.level >= 5;
  const wr = x.games ? x.wins / x.games : 0;
  const act = async (action: string, body: Record<string, unknown>, w: typeof want) => {
    setBusy(action); setErr(''); setWant(w);
    try { await api.post(`/api/staff/members/${x.id}/${action}`, body); await onDone(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); setWant({}); }
  };
  const lv = want.level ?? Math.min(x.level, 3);
  const kakaoOn = kk[x.id] ?? Boolean(x.kakao);
  const xk = { ...x, kakao: x.kakao === undefined ? undefined : kakaoOn };
  const wk = x.wk ?? [];
  const wmax = Math.max(1, ...wk);
  return createPortal(
    <div className={`sv-drawer ${on ? 'open' : ''}`} aria-hidden={!m}>
      <button type="button" className="scrim" aria-label="닫기" onClick={onClose} />
      <aside className="panel" role="dialog" aria-label={`${x.nick} 상세`}>
        <div className="dp-head">
          <span className="sv-av lg"><MemberFace nick={x.nick} skin={x.skin} champion={x.main} size={56} skins={skins} />{online(x) && <i className="dot" />}</span>
          <div><h3>{shortNick(x.nick)}{x.special && <span className="sv-rolec" style={{ ['--rc' as string]: '#9b59b6' }}>특별</span>}</h3><p>{[x.discordName ? `@${x.discordName}` : '', `가입 ${joinedDays(x.joined)}일째`, online(x) ? '지금 접속' : lastOf(x) ? ago(lastOf(x)) : ''].filter(Boolean).join(' · ')}</p></div>
          <button type="button" className="dp-x" aria-label="닫기" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="dp-stats"><div><span>판</span><b>{x.games}</b></div><div><span>승률</span><b>{x.games ? pct(x.wins, x.games) : '–'}</b></div><div><span>점수</span><b>{x.games ? x.score : '–'}</b></div><div><span>2주 판</span><b>{x.recent}</b></div></div>
        {!x.pending && x.level === 1 && <div className="dp-goal"><p><b>정회원까지</b> — 운영진과 같은 판 {Math.min(x.staffGames, need)} / {need}</p><div className="pips">{Array.from({ length: need }, (_, k) => <i key={k} className={k < x.staffGames ? 'on' : ''} />)}</div><p>{x.staffGames >= need ? '기준을 채웠어요. 할 일 › 정회원 심사에서 승인할 수 있어요.' : `운영진과 ${need - x.staffGames}판만 더 함께하면 심사에 올라가요.`}</p></div>}
        {wk.length > 0 && <div className="dp-sec"><h4>최근 8주 판<small>주마다</small></h4><div className="dp-week">{wk.map((v, k) => <span key={k}><i style={{ height: `${Math.max(3, (v / wmax) * 100)}%`, background: k === wk.length - 1 ? 'var(--sv-now)' : LV[lvOf(x)].color }} title={`${v}판`} /><small>{k === wk.length - 1 ? '이번' : `${wk.length - 1 - k}주 전`}</small></span>)}</div></div>}
        {(x.mates?.length ?? 0) > 0 && <div className="dp-sec"><h4>자주 함께한 멤버</h4><div className="dp-mates">{x.mates!.map((p) => <span key={p.id}><MemberFace nick={p.nick} skin={p.skin} champion={p.main} size={24} skins={skins} />{shortNick(p.nick)}<em>{p.n}판</em></span>)}</div></div>}
        <div className="dp-sec"><h4>단계<small>디스코드 역할도 함께 바뀌어요</small></h4>
          {locked ? <p className="meta">운영진은 디스코드에서 정해요.</p>
            : x.pending ? <ActBtn className="btn primary dp-wide" state={busy === 'approve' ? 'busy' : undefined} label="승인하고 준회원으로" busy="승인 중" onClick={() => act('approve', {}, {})} />
            : <div className={busy === 'level' ? 'dp-busy' : ''}><Seg value={String(lv) as '1' | '2' | '3' | '0'} options={LEVELS.slice(1) as [string, string][] as ['1' | '2' | '3' | '0', string][]} onChange={(v) => { if (Number(v) === Math.min(x.level, 3)) return; if (kakaoBlocks(xk, Number(v))) { setErr(KAKAO_NEED); return; } void act('level', { level: Number(v) }, { level: Number(v) }); }} /></div>}
        </div>
        {!locked && !x.pending && x.kakao !== undefined && <div className="dp-tgl dp-kk"><div>카톡방 확인<small>정회원·우수회원은 카톡방에 있는 멤버만 될 수 있어요</small></div><KakaoCheck api={api} m={x} on={kakaoOn} onChange={(v) => { setKk((o) => ({ ...o, [x.id]: v })); setErr(''); }} onSaved={() => void onDone()} compact /></div>}
        {!locked && !x.pending && <div className="dp-tgl"><div>특별회원<small>상점 50% 할인</small></div><Toggle label="특별회원" on={want.special ?? x.special} disabled={busy != null} onChange={(v) => act('special', { on: v }, { special: v })} /></div>}
        {err && <p className="sv-err">{err}</p>}
        {onProfile && <button type="button" className="btn dp-wide" onClick={() => onProfile(x.id)}>회원 페이지<Icon name="chevR" /></button>}
      </aside>
    </div>,
    document.body,
  );
}

function MembersSkeleton() {
  return (
    <SkeletonFrame className="sv">
      <section className="card sv-card"><div className="sv-head"><h2>멤버 구성</h2><Bone w={120} h={12} /></div><div className="sv-mix"><Bone w="100%" h={12} r="pill" /><div className="sv-mixleg">{[0, 1, 2, 3, 4].map((i) => <Bone key={i} w={88} h={32} r="pill" />)}</div><Bone w={320} h={16} /></div></section>
      <section className="card sv-card sv-mlist"><div className="sv-mtools"><Bone w="100%" h={40} r="m" /><Bone w={420} h={40} r="m" /><div className="sv-filters">{[0, 1, 2, 3, 4].map((i) => <Bone key={i} w={72} h={30} r="pill" />)}</div></div>
        {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="sv-mrow"><div className="who"><Bone w={40} h={40} r="round" /><div><Bone w="60%" h={14} /><Bone w="80%" h={12} /></div></div><div className="c-spark"><Bone w={88} h={24} /></div><div className="nn c-n"><Bone w={32} h={16} /></div><div className="c-wr"><Bone w="100%" h={16} /></div><div className="nn c-sc"><Bone w={36} h={16} /></div><div className="c-ago"><Bone w={60} h={12} /></div><div className="sv-lvl"><Bone w="100%" h={36} r="m" /></div><div className="mob"><Bone w={160} h={12} /></div></div>)}</section>
    </SkeletonFrame>
  );
}

// ═════════ 할 일 ═════════

type TodoKind = 'approve' | 'review' | 'join' | 'excellent';
const KINDS: { key: TodoKind; name: string; color: string; why: string }[] = [
  { key: 'approve', name: '승인 대기', color: '#d4a017', why: '디스코드에 들어와 앱에 로그인했지만 아직 역할이 없어요. 승인하면 준회원 역할이 붙어요.' },
  { key: 'review', name: '정회원 심사', color: 'var(--accent)', why: '운영진과 같은 판 기준을 채운 준회원이에요. 카톡방에 있는지 확인해야 승인할 수 있어요.' },
  { key: 'join', name: '가입 신청', color: 'var(--ok)', why: '초대 링크로 들어온 신청이에요. 승인하면 로그인하는 순간 준회원이 돼요.' },
  { key: 'excellent', name: '우수회원 후보', color: '#d4a017', why: '최근 2주 안에 7일 연속 모임 판을 하고 블랙님과 3판 이상 함께한 정회원이에요. 추천일 뿐이에요 — 선발은 운영진이 정해요.' },
];

export function StaffTodoView({ api, onOpen, onJoin, onSeen }: { api: Api; onOpen?: (id: string) => void; /** 가입 신청 전체 보드 (메모 · 거절 · 면접방 설정) */ onJoin?: () => void; onSeen?: () => void }) {
  const mem = useLoad<StaffMembers>(api, '/api/staff/members');
  const app = useLoad<StaffApplications>(api, '/api/staff/applications');
  useSeen(mem.data && app.data ? true : null, onSeen);
  const ready = Boolean(mem.data && (app.data || app.error));
  const rv = useReveal(ready);
  const [kind, setKind] = useKept<string | null>('staff.todo.kind', null);
  const res = useResolve(async () => { await Promise.all([mem.reload(), app.reload()]); });
  const total0 = useRef(0);
  if (mem.error) return <Empty>{mem.error}</Empty>;
  if (!ready) return <TodoSkeleton />;
  const members = mem.data!.members;
  const pending = members.filter((m) => m.pending).sort((a, b) => a.joined - b.joined);
  const review = members.filter((m) => m.review).sort((a, b) => b.staffGames - a.staffGames);
  const cands = members.filter((m) => m.excellentHint).sort((a, b) => b.recent - a.recent);
  const apps = (app.data?.items ?? []).filter((a) => ['new', 'hold', 'interview', 'confirmed', 'invited'].includes(a.status));
  const joinLeft = apps.filter((a) => a.status !== 'invited' && a.status !== 'hold').length;
  const left = pending.filter((m) => !res.gone(m.id)).length + review.filter((m) => !res.gone(m.id)).length + joinLeft;
  total0.current = Math.max(total0.current, left);
  const done = total0.current - left;
  const count: Record<TodoKind, number> = { approve: pending.length, review: review.length, join: joinLeft, excellent: cands.length };
  const r = 48, C = 2 * Math.PI * r;
  return (
    <Swap on={rv} skeleton={<TodoSkeleton />}>
      <div className={`sv ${fadeCls(rv)}`}>
        <section className="card sv-card sv-ttop">
          <div className="sv-tring"><svg width="112" height="112" viewBox="0 0 112 112" aria-hidden="true"><circle cx="56" cy="56" r={r} fill="none" stroke="var(--sv-track)" strokeWidth="8" /><circle cx="56" cy="56" r={r} fill="none" stroke="var(--ok)" strokeWidth="8" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - (total0.current ? done / total0.current : 0))} transform="rotate(-90 56 56)" /></svg><div><b>{left}</b><small>남음</small></div></div>
          <div className="sv-tbody"><h2>{left ? `처리할 일 ${left}개` : '지금 처리할 일이 없어요'}</h2><p>{left ? (done ? `방금 ${done}개 처리했어요 · ` : '') + '오래 기다린 것부터 위에 있어요' : '새 일이 생기면 운영 메뉴에 빨간 점이 떠요'}</p>
            <div className="sv-kinds">{KINDS.filter((k) => k.key !== 'excellent' || cands.length).map((k) => <button key={k.key} type="button" className={`sv-tk ${kind === k.key ? 'on' : ''} ${count[k.key] ? '' : 'zero'}`} style={{ ['--kc' as string]: k.color }} aria-pressed={kind === k.key} onClick={() => setKind(kind === k.key ? null : k.key)}><i />{k.name} <b>{count[k.key]}</b></button>)}</div>
          </div>
        </section>
        {KINDS.filter((k) => !kind || kind === k.key).map((k) => {
          if (k.key === 'join') return apps.length > 0 || app.error ? <section key={k.key} className="card sv-card sv-tsec" style={{ ['--kc' as string]: k.color }}>
            <div className="sv-head"><h2><i />{k.name} <b>{joinLeft}</b></h2>{onJoin && <button type="button" className="sv-more" onClick={onJoin}>전체 보드 · 면접방 설정<Icon name="chevR" /></button>}</div>
            <p className="sv-why">{k.why}</p>
            {app.error ? <Empty>{app.error}</Empty> : <JoinBoard api={api} data={app.data!} apps={apps} reload={app.reload} />}
          </section> : null;
          const src = k.key === 'approve' ? pending : k.key === 'review' ? review : cands;
          const list = src.filter((m) => !res.gone(m.id));
          if (!src.length) return null;
          return (
            <section key={k.key} className="card sv-card sv-tsec" style={{ ['--kc' as string]: k.color }}>
              <div className="sv-head"><h2><i />{k.name} <b>{list.length}</b>{k.key === 'excellent' && <span className="sv-hint">추천</span>}</h2></div>
              <p className="sv-why">{k.why}</p>
              <TodoList api={api} list={list} kind={k.key} need={mem.data!.reviewNeed} res={res} onOpen={onOpen} />
            </section>
          );
        })}
        {!left && !apps.length && <section className="card sv-card"><div className="sv-tdone"><span className="big"><Icon name="check" /></span><h3>모두 처리했어요</h3><p>승인 대기 · 정회원 심사 · 가입 신청이 비었어요.</p></div></section>}
      </div>
    </Swap>
  );
}

function TodoList({ api, list, kind, need, res, onOpen }: { api: Api; list: StaffMember[]; kind: Exclude<TodoKind, 'join'>; need: number; res: ReturnType<typeof useResolve>; onOpen?: (id: string) => void }) {
  const skins = useSkins();
  const box = useFlip<HTMLDivElement>(list.map((m) => m.id).join());
  const [err, setErr] = useState<Record<string, string>>({});
  /** 카톡방 확인 (누르면 바로 저장, 새 목록을 받기 전에도 단추가 열리게 여기 둔다) */
  const [kk, setKk] = useState<Record<string, boolean>>({});
  const kakaoOf = (m: StaffMember) => kk[m.id] ?? m.kakao !== false;
  const needKk = kind !== 'approve';
  const go = (m: StaffMember) => {
    if (needKk && !kakaoOf(m)) { setErr((e) => ({ ...e, [m.id]: KAKAO_NEED })); return; }
    setErr((e) => ({ ...e, [m.id]: '' }));
    const call = kind === 'approve' ? api.post(`/api/staff/members/${m.id}/approve`, {}) : kind === 'review' ? api.post(`/api/staff/members/${m.id}/promote`, {}) : api.post(`/api/staff/members/${m.id}/level`, { level: 3 });
    res.run(m.id, () => call).catch((e) => setErr((x) => ({ ...x, [m.id]: e instanceof Error ? e.message : String(e) })));
  };
  return (
    <div className="sv-titems" ref={box}>
      {list.map((m) => {
        const st: ActState = res.state(m.id);
        return (
          <div key={m.id} data-flip={m.id} className={`sv-ti ${actCls(st)}`}>
            <button type="button" className="sv-tface" onClick={() => onOpen?.(m.id)} aria-label={`${m.nick} 회원 페이지`}><MemberFace nick={m.nick} skin={m.skin} champion={m.main} size={44} skins={skins} /></button>
            <div>
              <h4>{shortNick(m.nick)}<span className="meta">{kind === 'approve' ? joinedText(m.joined) : kind === 'review' ? `운영진과 ${m.staffGames}판` : `2주 ${m.recent}판`}</span></h4>
              <div className="sv-sub">
                {kind === 'approve' ? <>
                  <span className={m.riotId ? 'ok' : 'no'}>{m.riotId ? '✓ 롤 계정 연결' : '· 롤 계정 아직'}</span>
                  <span className={m.app ? 'ok' : 'no'}>{m.app ? '✓ 앱 설치' : '· 앱 아직'}</span>
                  <span>{m.inviter ? `추천인 ${shortNick(m.inviter.nick)}` : '추천인 없음'}</span>
                </> : <>
                  <span>판 {m.games}</span><span>승률 {m.games ? pct(m.wins, m.games) : '–'}</span><span>가입 {joinedDays(m.joined)}일째</span>
                  {kind === 'review' && <span className="sv-pips" title="운영진과 같은 판">{Array.from({ length: need }, (_, k) => <i key={k} className={k < m.staffGames ? 'on' : ''} />)}</span>}
                </>}
              </div>
              {needKk && m.kakao !== undefined && <KakaoCheck api={api} m={m} on={kakaoOf(m)} onChange={(v) => { setKk((o) => ({ ...o, [m.id]: v })); setErr((e) => ({ ...e, [m.id]: '' })); }} />}
              {err[m.id] && <p className="sv-err">{err[m.id]}</p>}
            </div>
            <div className="sv-acts"><ActBtn className="btn primary" disabled={needKk && !kakaoOf(m)} state={st} label={kind === 'excellent' ? '선발' : '승인'} busy={kind === 'excellent' ? '선발 중' : '승인 중'} done={kind === 'approve' ? '승인했어요' : kind === 'review' ? '정회원이 됐어요' : '우수회원이 됐어요'} onClick={() => go(m)} /></div>
          </div>
        );
      })}
    </div>
  );
}

/** 가입 신청: 단계 없이 코멘트 + 승인 한 번 (2026-11-04 사용자 결정). 승인하면 로그인하는 순간 자동으로 준회원 */
function JoinBoard({ api, apps, reload }: { api: Api; data: StaffApplications; apps: StaffApplication[]; reload: () => Promise<unknown> }) {
  const skins = useSkins();
  const [busy, setBusy] = useState<Record<number, ActState>>({});
  const [err, setErr] = useState<Record<number, string>>({});
  const [leaving, setLeaving] = useState<Set<number>>(new Set());
  const [memo, setMemo] = useState<Record<number, string>>({});
  const put = (id: number, v: ActState) => setBusy((b) => ({ ...b, [id]: v }));
  const saveMemo = (a: StaffApplication) => { const v = memo[a.id]; if (v == null || v === (a.memo ?? '')) return; void api.post(`/api/staff/applications/${a.id}`, { action: 'memo', memo: v }).catch(() => {}); };
  const approve = async (a: StaffApplication) => {
    put(a.id, 'busy'); setErr((e) => ({ ...e, [a.id]: '' }));
    try {
      const v = memo[a.id];
      if (v != null && v !== (a.memo ?? '')) await api.post(`/api/staff/applications/${a.id}`, { action: 'memo', memo: v });
      await api.post(`/api/staff/applications/${a.id}`, { action: 'approve', at: a.updatedAt });
      put(a.id, 'done'); await new Promise((r) => setTimeout(r, 650));
      setLeaving((s) => new Set(s).add(a.id)); await new Promise((r) => setTimeout(r, 280));
      await reload();
    } catch (e) {
      setErr((x) => ({ ...x, [a.id]: e instanceof Error ? e.message : String(e) }));
      void reload();
    } finally { put(a.id, undefined); setLeaving((s) => { const n = new Set(s); n.delete(a.id); return n; }); }
  };
  const open = apps.filter((a) => ['new', 'interview', 'hold', 'confirmed'].includes(a.status));
  const waiting = apps.filter((a) => a.status === 'invited');
  return (
    <div className="sv-jlist">
      {open.length ? <div className="sv-jgrid">{open.map((a) => (
        <article key={a.id} className={`sv-jc ${leaving.has(a.id) ? 'leave' : ''}`}>
          <div className="jc-h">
            <GuestFace name={a.riotId.split('#')[0]} size={40} />
            <div className="jc-id"><b>{a.riotId.split('#')[0]}<small>#{a.riotId.split('#')[1] ?? ''}</small></b><span className="tn">{a.no} · {ago(a.createdAt)}</span></div>
          </div>
          {a.note && <p className="jc-msg">{a.note}</p>}
          <dl className="jc-facts">
            {a.times.length > 0 && <div><dt>시간</dt><dd>{a.times.map((t) => JOIN_TIMES.find((x) => x.key === t)?.label ?? t).join(' · ')}</dd></div>}
            <div><dt>카톡</dt><dd>{a.kakao}</dd></div>
            <div><dt>초대</dt><dd>{a.inviter ? <><MemberFace nick={a.inviter.nick} skin={a.inviter.skin} champion={a.inviter.main} size={18} skins={skins} />{shortNick(a.inviter.nick)}{a.inviter.pending && <PendingChip />}</> : <span className="no">추천인 없음</span>}</dd></div>
          </dl>
          <label className="jc-memo"><span className="sr-only">코멘트</span>
            <textarea rows={2} maxLength={300} placeholder="코멘트 (운영진끼리 보여요)" value={memo[a.id] ?? a.memo ?? ''} onChange={(e) => setMemo((m) => ({ ...m, [a.id]: e.target.value }))} onBlur={() => saveMemo(a)} />
          </label>
          <div className="jact"><ActBtn className="btn primary grow" state={busy[a.id]} label="승인" busy="승인 중" done="승인했어요" onClick={() => void approve(a)} /></div>
          {err[a.id] && <p className="sv-err">{err[a.id]}</p>}
        </article>
      ))}</div> : <div className="sv-jempty">새 신청이 없어요</div>}
      {waiting.length > 0 && <div className="sv-jwait">
        <span className="jw-k">승인함 · 로그인을 기다려요</span>
        <div>{waiting.map((a) => <span key={a.id} className="jw-p"><GuestFace name={a.riotId.split('#')[0]} size={24} />{a.riotId.split('#')[0]}</span>)}</div>
      </div>}
    </div>
  );
}

function TodoSkeleton() {
  return (
    <SkeletonFrame className="sv">
      <section className="card sv-card sv-ttop"><Bone w={112} h={112} r="round" /><div className="sv-tbody"><Bone w={160} h={22} /><Bone w={240} h={14} /><div className="sv-kinds">{[0, 1, 2].map((i) => <Bone key={i} w={104} h={36} r="pill" />)}</div></div></section>
      {[0, 1].map((s) => <section key={s} className="card sv-card"><Bone w={120} h={18} /><Bone w="60%" h={12} /><div className="sv-titems">{[0, 1].map((i) => <div key={i} className="sv-ti"><Bone w={44} h={44} r="round" /><div><Bone w={140} h={14} /><Bone w="70%" h={12} /></div><div className="sv-acts"><Bone w={104} h={36} r="m" /></div></div>)}</div></section>)}
    </SkeletonFrame>
  );
}

