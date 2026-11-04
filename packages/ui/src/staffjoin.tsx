/**
 * 운영 › 가입 신청 (CLAUDE.md v3.148). 칸 넷: 신청 → 면접 중 → 확정 · 초대 보내기 → 가입 완료.
 * 확정은 운영진 JOIN.signs 명이 각각 눌러야 한다(서명 칸). 보류·거절은 한 명이 해도 된다.
 * 다른 운영진이 먼저 바꿨으면 서버가 409 로 알려 주고 새로 불러온다.
 */
import { useState } from 'react';
import { JOIN, JOIN_STATUS_KO, JOIN_TIMES, ago, shortNick, type Api, type StaffApplication, type StaffApplications } from '@prism/core';
import { Empty, GuestFace, MemberFace, Select } from './basics';
import { Icon } from './icons';
import { useLoad } from './crew';
import { ActBtn, actCls, useResolve } from './motion';
import { Bone, SkeletonFrame, Swap, fadeCls, useReveal } from './skeleton';

const DAY = 86_400_000;
const TIME_KO = Object.fromEntries(JOIN_TIMES.map((t) => [t.key, t.label]));
const COLS = [
  { key: 'open', title: '새 신청', has: (a: StaffApplication) => ['new', 'interview', 'hold', 'confirmed'].includes(a.status) },
  { key: 'invited', title: '승인함 · 로그인 기다림', has: (a: StaffApplication) => a.status === 'invited' },
  { key: 'joined', title: '가입 완료', has: (a: StaffApplication) => a.status === 'joined' },
] as const;

function JoinSkeleton() {
  return (
    <SkeletonFrame>
      <div className="sj-board">{COLS.map((c) => (
        <div key={c.key} className={`sj-col ${c.key}`}><header><span className="jn">{COLS.indexOf(c) + 1}</span><span className="jt">{c.title}</span><i className="jline" aria-hidden="true" /></header>
          <div className="sj-card"><div className="sj-top"><Bone w={40} h={40} r="round" /><div style={{ flex: 1 }}><Bone w="70%" h={14} /><Bone w="50%" h={12} style={{ marginTop: 6 }} /></div></div><Bone w="90%" h={12} /><Bone w="100%" h={56} r="m" /><Bone w="100%" h={36} r="m" /></div>
        </div>
      ))}</div>
    </SkeletonFrame>
  );
}

export function StaffJoinView({ api, onOpen, onSeen }: { api: Api; onOpen?: (id: string) => void; onSeen?: () => void }) {
  const { data, error, reload } = useLoad<StaffApplications>(api, '/api/staff/applications');
  const rs = useResolve(reload);
  const [err, setErr] = useState<string | null>(null);
  const [seen, setSeen] = useState(false);
  const rv = useReveal(Boolean(data));
  if (data && !seen) { setSeen(true); queueMicrotask(() => onSeen?.()); }
  if (error) return <Empty>{error}</Empty>;
  if (!data) return <JoinSkeleton />;
  const act = (a: StaffApplication, action: string, extra: Record<string, unknown> = {}, leave = true) => {
    setErr(null);
    return rs.run(`${a.id}:${action}`, () => api.post(`/api/staff/applications/${a.id}`, { action, at: a.updatedAt, ...extra }), leave).catch((e: Error) => { setErr(e.message); void reload(); });
  };
  return (
    <Swap on={rv} skeleton={<JoinSkeleton />}>
      <div className={`sj ${fadeCls(rv)}`}>
        {err && <div className="sj-err" role="alert"><Icon name="info" />{err}</div>}
        <div className="sj-board">
          {COLS.map((c) => {
            const list = data.items.filter(c.has);
            return (
              <div key={c.key} className={`sj-col ${c.key}`}>
                <header><span className="jn">{COLS.indexOf(c) + 1}</span><span className="jt">{c.title}</span><b className="tn">{list.length}</b><i className="jline" aria-hidden="true" /></header>
                {list.length ? list.map((a) => <Card key={a.id} a={a} data={data} act={act} st={(k) => rs.state(`${a.id}:${k}`)} gone={['approve', 'reject', 'link'].some((k) => rs.gone(`${a.id}:${k}`))} onOpen={onOpen} />)
                  : <p className="sj-empty">{c.key === 'open' ? '새 신청이 없어요' : c.key === 'joined' ? '최근 7일 가입이 없어요' : '비어 있어요'}</p>}
              </div>
            );
          })}
        </div>
        <RoomBox api={api} room={data.room} onSaved={reload} />
      </div>
    </Swap>
  );
}

type Act = (a: StaffApplication, action: string, extra?: Record<string, unknown>, leave?: boolean) => Promise<unknown>;

function Card({ a, data, act, st, gone, onOpen }: { a: StaffApplication; data: StaffApplications; act: Act; st: (k: string) => ReturnType<ReturnType<typeof useResolve>['state']>; gone: boolean; onOpen?: (id: string) => void }) {
  const [memo, setMemo] = useState(a.memo ?? '');
  const [link, setLink] = useState('');
  const quiet = (a.status === 'new' || a.status === 'interview') && Date.now() - a.updatedAt > JOIN.quietDays * DAY;
  const dropIn = Math.max(0, Math.ceil((a.updatedAt + JOIN.dropDays * DAY - Date.now()) / DAY));
  const anyState = ['approve', 'reject', 'link'].map(st).find(Boolean);
  if (gone) return null;
  return (
    <div className={`sj-card ${actCls(anyState)} ${a.status === 'hold' ? 'hold' : ''}`}>
      <div className="sj-top">
        {a.member ? <MemberFace nick={a.member.nick} size={40} /> : <GuestFace name={a.riotId.split('#')[0]} size={40} />}
        <div className="sj-name"><b>{a.riotId.split('#')[0]}<small>#{a.riotId.split('#')[1] ?? ''}</small></b><span className="tn">{a.no} · {ago(a.createdAt)}</span></div>
        {a.status === 'hold' && <span className="sj-hold">보류</span>}
      </div>
      {a.note && <p className="sj-msg">{a.note}</p>}
      <dl className="sj-dl">
        <dt>카톡</dt><dd>{a.kakao}</dd>
        <dt>초대</dt><dd>{a.inviter ? <button type="button" className="sj-link" onClick={() => onOpen?.(a.inviter!.id)}>{shortNick(a.inviter.nick)}</button> : '추천인 없음'}{a.inviter && a.codeToday > 1 && <em> · 이 링크 오늘 {a.codeToday}건</em>}</dd>
        {a.times.length > 0 && <><dt>시간</dt><dd>{a.times.map((t) => TIME_KO[t]).filter(Boolean).join(' · ')}</dd></>}
      </dl>
      {quiet && <span className="sj-warn">연락 없음 {Math.floor((Date.now() - a.updatedAt) / DAY)}일 · {dropIn}일 뒤 정리</span>}
      {a.status !== 'joined' && a.status !== 'rejected' && (
        <label className="sj-memo"><span className="sr-only">코멘트</span><textarea rows={2} value={memo} placeholder="코멘트 (운영진끼리 보여요)" maxLength={300} onChange={(e) => setMemo(e.target.value)} onBlur={() => { if (memo !== (a.memo ?? '')) void act(a, 'memo', { memo }, false); }} /></label>
      )}
      {['new', 'interview', 'hold', 'confirmed'].includes(a.status) && <div className="sj-act">
        <button type="button" className="btn sm ghost sj-rej" onClick={() => void act(a, 'reject')}>거절</button>
        <ActBtn state={st('approve')} className="btn sm primary grow" label="승인" busy="승인 중" done="승인했어요" onClick={async () => { if (memo !== (a.memo ?? '')) await act(a, 'memo', { memo }, false); void act(a, 'approve'); }} />
      </div>}
      {(a.status === 'confirmed' || a.status === 'invited') && data.pendingMembers.length > 0 && (
        <div className="sj-linkrow">
          <span>롤 이름이 달라 자동으로 안 이어졌으면</span>
          <Select label="가입한 멤버와 연결" value={link} options={[['', '가입한 멤버 고르기'], ...data.pendingMembers.map((m) => [m.id, shortNick(m.nick)] as [string, string])]} onChange={setLink} />
          <ActBtn state={st('link')} className="btn sm" label="연결" disabled={!link} onClick={() => void act(a, 'link', { member: link })} />
        </div>
      )}
      {a.status === 'joined' && a.member && <button type="button" className="sj-link" onClick={() => onOpen?.(a.member!.id)}>준회원 승인 · {a.inviter ? `추천인 ${shortNick(a.inviter.nick)}` : '추천인 없음'}</button>}
      {a.log.length > 0 && <p className="sj-log">{(() => { const l = a.log[a.log.length - 1]; return `${l.by} · ${l.act} · ${ago(l.at)}`; })()}</p>}
      <span className="sr-only">{JOIN_STATUS_KO[a.status]}</span>
    </div>
  );
}

function RoomBox({ api, room, onSaved }: { api: Api; room: StaffApplications['room']; onSaved: () => unknown }) {
  const [url, setUrl] = useState(room.url);
  const [pw, setPw] = useState(room.pw ?? '');
  const [st, setSt] = useState<'busy' | 'done' | undefined>();
  const [err, setErr] = useState<string | null>(null);
  const dirty = url !== room.url || pw !== (room.pw ?? '');
  const save = async () => {
    setErr(null); setSt('busy');
    try { await api.post('/api/staff/applications/room', { url, pw }); await onSaved(); setSt('done'); setTimeout(() => setSt(undefined), 900); }
    catch (e) { setSt(undefined); setErr((e as Error).message); }
  };
  return (
    <section className="card pad sj-room">
      <div className="card-head"><h2>면접방 설정</h2></div>
      {!room.url && <p className="sj-warn">면접방 주소가 아직 없어요. 신청을 마친 분께 면접방 단추가 보이지 않아요.</p>}
      <div className="sj-room-row">
        <label className="field"><span>면접방 오픈카톡 주소</span><input className="input" value={url} placeholder="https://open.kakao.com/o/…" onChange={(e) => setUrl(e.target.value.trim())} /></label>
        <label className="field sm"><span>입장 비밀번호 <em>선택</em></span><input className="input" value={pw} maxLength={12} onChange={(e) => setPw(e.target.value.trim())} /></label>
        <ActBtn state={st} className="btn primary" label="저장" busy="저장 중" done="저장했어요" disabled={!dirty && !st} onClick={() => void save()} />
      </div>
      {err && <p className="sj-err-t">{err}</p>}
      <p className="meta">바꾸면 이미 신청한 분의 진행 화면에도 새 주소가 보여요. 주소와 비밀번호는 신청을 마친 분에게만 보여요.</p>
    </section>
  );
}
