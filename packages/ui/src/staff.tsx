/**
 * 운영 (CLAUDE.md v3.106) — 운영진(역할 단계 5·관리자)에게만 보이는 메뉴. 앱·웹 공용.
 *  - 승인 대기: 디스코드 회원 역할이 아직 없는 회원 → '승인'(봇이 준회원 역할을 붙인다). 추천인이 없으면 여기서 골라 줄 수 있다.
 *  - 정회원 심사: 준회원 중 운영진과 같은 판을 기준 판수 이상 한 회원 → '정회원 승인'.
 *  - 전체 멤버: 단계(대기·준·정·우수)·특별회원을 직접 바꾼다. 운영진 역할은 디스코드에서 사람이 정한다.
 */
import { useMemo, useState } from 'react';
import { ago, matchName, shortDate, shortNick, type Api, type StaffMember, type StaffMembers } from '@prism/core';
import { Empty, MemberFace, PendingChip, RoleBadge, Seg, Select, Toggle, useSkins } from './basics';
import { Icon } from './icons';
import { useLoad } from './crew';
import { useKept } from './kept';
import { Bone, SkeletonFrame, Swap, fadeCls, useReveal } from './skeleton';

type Tab = 'pending' | 'review' | 'all';
const LEVELS: ['0' | '1' | '2' | '3', string][] = [['0', '승인 대기'], ['1', '준회원'], ['2', '정회원'], ['3', '우수회원']];

export function StaffView({ api, onOpen }: { api: Api; onOpen?: (id: string) => void }) {
  const { data, error, reload } = useLoad<StaffMembers>(api, '/api/staff/members');
  const [tab, setTab] = useKept<Tab>('staff.tab', 'pending');
  const [q, setQ] = useKept('staff.q', '');
  const rv = useReveal(Boolean(data));
  const lists = useMemo(() => {
    const all = data?.members ?? [];
    return {
      pending: all.filter((m) => m.pending),
      review: all.filter((m) => m.review).sort((a, b) => b.staffGames - a.staffGames),
      all,
    };
  }, [data]);
  if (error) return <Empty>{error}</Empty>;
  if (!data) return <StaffSkeleton />;
  const shown = lists[tab].filter((m) => !q.trim() || matchName(m.nick, q) || matchName(m.discordName ?? '', q));
  // 추천인으로 고를 수 있는 사람: 승인된 회원
  const referrers = lists.all.filter((m) => !m.pending);
  return (
    <Swap on={rv} skeleton={<StaffSkeleton />}>
      <div className={`stack ${fadeCls(rv)}`} style={{ gap: 16 }}>
        <div className="row wrapr stf-tools">
          <Seg value={tab} options={[['pending', `승인 대기 ${lists.pending.length}`], ['review', `정회원 심사 ${lists.review.length}`], ['all', `전체 ${lists.all.length}`]]} onChange={setTab} />
          <label className="stf-search"><Icon name="search" /><input className="input sm" value={q} placeholder="이름으로 찾기" aria-label="이름으로 찾기" onChange={(e) => setQ(e.target.value)} /></label>
        </div>
        <p className="meta stf-help">{tab === 'pending' ? '승인하면 디스코드 준회원 역할이 붙고, 추천인이 있으면 추천인에게 ' + data.inviteBonus + ' 피스가 들어가요.'
          : tab === 'review' ? `운영진과 같은 판을 ${data.reviewNeed}판 이상 한 준회원이에요. 승인하면 정회원이 돼요.`
            : '단계와 특별회원을 바꾸면 디스코드 역할도 바로 바뀌어요. 운영진 역할은 디스코드에서 직접 바꿔 주세요.'}</p>
        {shown.length ? <section className="card stf-list">
          {shown.map((m) => <StaffRow key={m.id} api={api} m={m} tab={tab} need={data.reviewNeed} referrers={referrers} onDone={reload} onOpen={onOpen} />)}
        </section> : <section className="card pad"><Empty>{tab === 'pending' ? '승인을 기다리는 멤버가 없어요.' : tab === 'review' ? '정회원 심사에 올라온 멤버가 없어요.' : '맞는 멤버가 없어요.'}</Empty></section>}
      </div>
    </Swap>
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
  const facts = [
    `${shortDate(m.joined)} 가입`,
    m.seen ? `접속 ${ago(m.seen)}` : '',
    `${m.games}판`,
    `운영진과 ${m.staffGames}판${m.level === 1 && m.staffGames < need ? ` / ${need}` : ''}`,
    m.inviter ? `추천인 ${shortNick(m.inviter.nick)}` : '',
    m.invitedCount ? `초대 ${m.invitedCount}명` : '',
  ].filter(Boolean);
  return (
    <div className={`stf-row ${busy ? 'busy' : ''}`}>
      <button type="button" className="stf-who" onClick={() => onOpen?.(m.id)} title="회원 페이지">
        <MemberFace nick={m.nick} skin={m.skin} champion={m.main} size={40} skins={skins} />
        <span className="stf-t">
          <b>{shortNick(m.nick)}{m.pending && <PendingChip />}{!m.pending && <RoleBadge role={m.role} small />}{m.special && <span className="pill stf-sp">특별회원</span>}</b>
          <span className="meta">{m.discordName ? `@${m.discordName} · ` : ''}{facts.join(' · ')}</span>
        </span>
      </button>
      <div className="stf-act">
        {tab === 'pending' && <>
          {!m.inviter && referrers.length > 0 && <Select label="추천인" value={inviter} options={[['', '추천인 없음'], ...referrers.filter((r) => r.id !== m.id).map((r) => [r.id, shortNick(r.nick)] as [string, string])]} onChange={setInviter} />}
          <button type="button" className="btn primary sm" disabled={busy} onClick={() => act('approve', inviter ? { inviter } : {})}>{busy ? '처리 중…' : '승인'}</button>
        </>}
        {tab === 'review' && <button type="button" className="btn primary sm" disabled={busy} onClick={() => act('promote')}>{busy ? '처리 중…' : '정회원 승인'}</button>}
        {tab === 'all' && (locked ? <span className="meta">{m.admin ? '관리자' : '운영진'}</span> : <>
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
    <SkeletonFrame className="stack" >
      <div className="row wrapr stf-tools"><Bone w={320} h={36} r="m" /><Bone w={200} h={32} r="m" /></div>
      <Bone w={360} h={12} />
      <section className="card stf-list">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="stf-row"><span className="stf-who"><Bone w={40} h={40} r="pill" /><span className="stf-t" style={{ gap: 8 }}><Bone w={120} h={14} /><Bone w={260} h={12} /></span></span><div className="stf-act"><Bone w={64} h={32} r="m" /></div></div>)}</section>
    </SkeletonFrame>
  );
}
