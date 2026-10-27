/**
 * 운영 (CLAUDE.md v3.107·v3.109) — 운영진(역할 단계 5·관리자)에게만 보이는 메뉴. 앱·웹 공용.
 *  - 대시보드: 지금 숫자 넷 · 주별 활동(8주) · 멤버 구성 · 최근 2주 잘하는 멤버 · 챙겨야 할 멤버 (서버 overview)
 *  - 멤버 관리: 승인 대기(역할 없음 + 앱 사용) → '승인' · 정회원 심사(운영진과 기준 판수 이상) → '정회원 승인' · 전체(단계·특별회원)
 */
import { useMemo, useState } from 'react';
import { ago, matchName, pct, shortDate, shortNick, type Api, type StaffMember, type StaffMembers, type StaffOverview } from '@prism/core';
import { Empty, MemberFace, PendingChip, RoleBadge, Seg, Select, Toggle, useSkins } from './basics';
import { Icon } from './icons';
import { useLoad } from './crew';
import { useKept } from './kept';
import { Bone, SkeletonFrame, Swap, fadeCls, useReveal } from './skeleton';

type Tab = 'pending' | 'review' | 'all';
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

export function StaffView({ api, onOpen }: { api: Api; onOpen?: (id: string) => void }) {
  const { data, error, reload } = useLoad<StaffMembers>(api, '/api/staff/members');
  const rv = useReveal(Boolean(data));
  if (error) return <Empty>{error}</Empty>;
  if (!data) return <StaffSkeleton />;
  return (
    <Swap on={rv} skeleton={<StaffSkeleton />}>
      <div className={`stf ${fadeCls(rv)}`}>
        {data.overview && <Dashboard api={api} o={data.overview} need={data.reviewNeed} onOpen={onOpen} onDone={reload} />}
        <MemberTools api={api} data={data} onOpen={onOpen} onDone={reload} />
      </div>
    </Swap>
  );
}

// ───────── 대시보드 ─────────

function Delta({ now, prev }: { now: number; prev: number }) {
  const d = now - prev;
  if (!d) return <span className="stf-delta">지난주와 같아요</span>;
  return <span className={`stf-delta ${d > 0 ? 'up' : 'down'}`}>{d > 0 ? '▲' : '▼'} {Math.abs(d)} <span>지난주 대비</span></span>;
}

function Dashboard({ api, o, need, onOpen, onDone }: { api: Api; o: StaffOverview; need: number; onOpen?: (id: string) => void; onDone: () => void }) {
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
        <Care api={api} o={o} need={need} onOpen={onOpen} onDone={onDone} />
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

function Care({ api, o, need, onOpen, onDone }: { api: Api; o: StaffOverview; need: number; onOpen?: (id: string) => void; onDone: () => void }) {
  const skins = useSkins();
  const [busy, setBusy] = useState('');
  const act = async (id: string, action: string) => {
    setBusy(id);
    try { await api.post(`/api/staff/members/${id}/${action}`, {}); onDone(); } catch { /* 아래 목록에서 다시 */ } finally { setBusy(''); }
  };
  const why = (c: StaffOverview['care'][number]) => c.kind === 'pending' ? `가입 ${c.days}일째` : c.kind === 'review' ? `운영진과 ${c.n ?? need}판 함께했어요` : c.kind === 'quiet' ? `가입 ${c.days}일, 아직 판이 없어요` : `${c.days}일째 소식이 없어요`;
  return (
    <section className="card pad stf-card">
      <div className="stf-head"><h2>챙겨야 할 멤버</h2><span className="meta">{o.careTotal ? `${o.careTotal}명` : ''}</span></div>
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

// ───────── 멤버 관리 ─────────

function MemberTools({ api, data, onOpen, onDone }: { api: Api; data: StaffMembers; onOpen?: (id: string) => void; onDone: () => void }) {
  const [tab, setTab] = useKept<Tab>('staff.tab', 'pending');
  const [q, setQ] = useKept('staff.q', '');
  const lists = useMemo(() => {
    const all = data.members;
    return {
      pending: all.filter((m) => m.pending),
      review: all.filter((m) => m.review).sort((a, b) => b.staffGames - a.staffGames),
      all: [...all].sort((a, b) => Number(b.level >= 5) - Number(a.level >= 5) || b.level - a.level || b.games - a.games),
    };
  }, [data]);
  const shown = lists[tab].filter((m) => !q.trim() || matchName(m.nick, q) || matchName(m.discordName ?? '', q));
  const referrers = lists.all.filter((m) => !m.pending && m.level >= 1);
  const help = tab === 'pending' ? `디스코드 회원 역할이 없고 앱을 쓰는 멤버예요. 승인하면 준회원 역할이 붙고, 추천인에게 ${data.inviteBonus} 피스가 들어가요.`
    : tab === 'review' ? `운영진과 같은 판을 ${data.reviewNeed}판 이상 한 준회원이에요. 승인하면 정회원이 돼요.`
      : '단계와 특별회원을 바꾸면 디스코드 역할도 바로 바뀌어요. 운영진 역할은 디스코드에서 직접 바꿔 주세요.';
  return (
    <section className="stf-tools-wrap">
      <div className="stf-head big"><h2>멤버 관리</h2></div>
      <div className="stf-tools">
        <Seg value={tab} options={[['pending', `승인 대기 ${lists.pending.length}`], ['review', `정회원 심사 ${lists.review.length}`], ['all', `전체 ${lists.all.length}`]]} onChange={setTab} />
        <label className="stf-search"><Icon name="search" /><input className="input sm" value={q} placeholder="이름으로 찾기" aria-label="이름으로 찾기" onChange={(e) => setQ(e.target.value)} /></label>
      </div>
      <p className="meta stf-help">{help}</p>
      {shown.length ? <div className="card stf-list">
        {shown.map((m) => <StaffRow key={m.id} api={api} m={m} tab={tab} need={data.reviewNeed} referrers={referrers} onDone={onDone} onOpen={onOpen} />)}
      </div> : <section className="card pad"><Empty>{tab === 'pending' ? '승인을 기다리는 멤버가 없어요.' : tab === 'review' ? '정회원 심사에 올라온 멤버가 없어요.' : '맞는 멤버가 없어요.'}</Empty></section>}
    </section>
  );
}

function StaffRow({ api, m, tab, need, referrers, onDone, onOpen }: { api: Api; m: StaffMember; tab: Tab; need: number; referrers: StaffMember[]; onDone: () => void; onOpen?: (id: string) => void }) {
  const skins = useSkins();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [inviter, setInviter] = useState<string>('');
  const locked = m.admin || m.level >= 5;
  const act = async (action: string, body: Record<string, unknown> = {}) => {
    setBusy(true); setErr('');
    try { await api.post(`/api/staff/members/${m.id}/${action}`, body); onDone(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const last = Math.max(m.seen || 0, m.lastPlayed || 0);
  const toReview = m.level === 1 && !m.review;
  return (
    <div className={`stf-row ${busy ? 'busy' : ''}`}>
      <button type="button" className="stf-who" onClick={() => onOpen?.(m.id)} title="회원 페이지">
        <MemberFace nick={m.nick} skin={m.skin} champion={m.main} size={44} skins={skins} />
        <span className="stf-t">
          <b><span className="stf-nm">{shortNick(m.nick)}</span>{m.pending ? <PendingChip /> : <RoleBadge role={m.role} small />}{m.special && <span className="stf-sp">특별회원</span>}</b>
          <span className="meta">{[m.discordName ? `@${m.discordName}` : '', m.inviter ? `추천인 ${shortNick(m.inviter.nick)}` : '', m.invitedCount ? `초대 ${m.invitedCount}명` : '', m.app ? '' : '앱 안 씀'].filter(Boolean).join(' · ')}</span>
        </span>
      </button>
      <dl className="stf-stats">
        <div><dt>판수</dt><dd>{m.games}</dd></div>
        <div><dt>승률</dt><dd>{m.games ? pct(m.wins, m.games) : '–'}</dd></div>
        <div className={toReview ? 'prog' : ''}><dt>운영진과</dt><dd>{m.staffGames}{toReview && <span className="stf-of">/{need}</span>}</dd>
          {toReview && <i className="stf-pbar" aria-hidden="true"><i style={{ width: `${Math.min(100, (m.staffGames / need) * 100)}%` }} /></i>}</div>
        <div><dt>최근 활동</dt><dd className="sm">{last ? ago(last) : '–'}</dd></div>
        <div><dt>가입</dt><dd className="sm">{shortDate(m.joined)}</dd></div>
      </dl>
      <div className="stf-act">
        {tab === 'pending' && <>
          {!m.inviter && referrers.length > 0 && <Select label="추천인" value={inviter} options={[['', '추천인 없음'], ...referrers.filter((r) => r.id !== m.id).map((r) => [r.id, shortNick(r.nick)] as [string, string])]} onChange={setInviter} />}
          <button type="button" className="btn primary sm" disabled={busy} onClick={() => act('approve', inviter ? { inviter } : {})}>{busy ? '처리 중…' : '승인'}</button>
        </>}
        {tab === 'review' && <button type="button" className="btn primary sm" disabled={busy} onClick={() => act('promote')}>{busy ? '처리 중…' : '정회원 승인'}</button>}
        {tab === 'all' && (locked ? <span className="stf-lock"><Icon name="shield" />{m.admin ? '관리자' : '운영진'}</span> : <>
          <Select label="단계" value={String(Math.min(m.level, 3)) as '0' | '1' | '2' | '3'} options={LEVELS} onChange={(v) => { if (Number(v) !== m.level) void act('level', { level: Number(v) }); }} />
          <span className="stf-sw"><span className="meta">특별</span><Toggle label="특별회원" on={m.special} disabled={busy} onChange={(on) => act('special', { on })} /></span>
        </>)}
      </div>
      {err && <p className="l stf-err">{err}</p>}
    </div>
  );
}

function StaffSkeleton() {
  return (
    <SkeletonFrame className="stf">
      <section className="stf-kpis">{[0, 1, 2, 3].map((i) => <div key={i} className="stf-kpi"><Bone w={96} h={12} /><Bone w={56} h={28} /><Bone w={120} h={12} /></div>)}</section>
      <div className="stf-grid">
        <section className="card pad stf-card"><div className="stf-head"><h2>주별 활동</h2><Bone w={88} h={12} /></div><Bone w="100%" h={196} r="m" /></section>
        <section className="card pad stf-card"><div className="stf-head"><h2>멤버 구성</h2><Bone w={32} h={12} /></div><Bone w="100%" h={12} r="pill" /><div className="stf-mixl">{[0, 1, 2, 3, 4].map((i) => <Bone key={i} w="100%" h={16} />)}</div><div className="stf-foot">{[0, 1].map((i) => <div key={i}><Bone w={88} h={12} /><Bone w={48} h={20} /><Bone w="100%" h={4} r="pill" /></div>)}</div></section>
      </div>
      <div className="stf-grid">
        {['잘하고 있는 멤버', '챙겨야 할 멤버'].map((t) => <section key={t} className="card pad stf-card"><div className="stf-head"><h2>{t}</h2><Bone w={96} h={12} /></div>
          <div className="stf-people">{[0, 1, 2, 3].map((i) => <div key={i} className="stf-person"><Bone w={36} h={36} r="pill" /><span className="stf-pt"><Bone w={100} h={14} /><Bone w={160} h={12} /></span></div>)}</div></section>)}
      </div>
      <section className="stf-tools-wrap">
        <div className="stf-head big"><h2>멤버 관리</h2></div>
        <div className="stf-tools"><Bone w={300} h={36} r="m" /><Bone w={220} h={32} r="m" /></div>
        <Bone w={360} h={12} />
        <div className="card stf-list">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="stf-row"><span className="stf-who"><Bone w={44} h={44} r="pill" /><span className="stf-t"><Bone w={120} h={14} /><Bone w={180} h={12} /></span></span><div className="stf-stats">{[0, 1, 2, 3, 4].map((j) => <div key={j}><Bone w={32} h={12} /><Bone w={44} h={20} /></div>)}</div><div className="stf-act"><Bone w={72} h={32} r="m" /></div></div>)}</div>
      </section>
    </SkeletonFrame>
  );
}
