/**
 * 운영 › 가입 신청 (CLAUDE.md v3.148). 칸 넷: 신청 → 면접 중 → 확정 · 초대 보내기 → 가입 완료.
 * 확정은 운영진 JOIN.signs 명이 각각 눌러야 한다(서명 칸). 보류·거절은 한 명이 해도 된다.
 * 다른 운영진이 먼저 바꿨으면 서버가 409 로 알려 주고 새로 불러온다.
 */
import { useState } from 'react';
import { JOIN, JOIN_STATUS_KO, JOIN_TIMES, ago, shortNick, type Api, type StaffApplication, type StaffApplications } from '@prism/core';
import { Empty, MemberFace, Select, Toggle } from './basics';
import { Icon } from './icons';
import { useLoad } from './crew';
import { ActBtn, actCls, useResolve } from './motion';
import { Bone, SkeletonFrame, Swap, fadeCls, useReveal } from './skeleton';

const DAY = 86_400_000;
const TIME_KO = Object.fromEntries(JOIN_TIMES.map((t) => [t.key, t.label]));
const COLS = [
  { key: 'new', title: '신청', has: (a: StaffApplication) => a.status === 'new' },
  { key: 'interview', title: '면접 중', has: (a: StaffApplication) => a.status === 'interview' || a.status === 'hold' },
  { key: 'confirmed', title: '확정 · 초대 보내기', has: (a: StaffApplication) => a.status === 'confirmed' || a.status === 'invited' },
  { key: 'joined', title: '가입 완료', has: (a: StaffApplication) => a.status === 'joined' },
] as const;

function JoinSkeleton() {
  return (
    <SkeletonFrame>
      <div className="sj-board">{COLS.map((c) => (
        <div key={c.key} className="sj-col"><header><span>{c.title}</span></header>
          <div className="sj-card"><div className="sj-top"><Bone w={36} h={36} r="round" /><div style={{ flex: 1 }}><Bone w="70%" h={14} /><Bone w="50%" h={12} style={{ marginTop: 6 }} /></div></div><Bone w="90%" h={12} /><Bone w={120} h={32} /></div>
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
              <div key={c.key} className="sj-col">
                <header><span>{c.title}</span><b>{list.length}</b></header>
                {list.length ? list.map((a) => <Card key={a.id} a={a} data={data} act={act} st={(k) => rs.state(`${a.id}:${k}`)} gone={COLS.some((k) => rs.gone(`${a.id}:${k.key}`))} onOpen={onOpen} />)
                  : <p className="sj-empty">{c.key === 'new' ? '새 신청이 없어요' : c.key === 'joined' ? '최근 7일 가입이 없어요' : '비어 있어요'}</p>}
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
  const need = data.signsNeeded;
  const quiet = (a.status === 'new' || a.status === 'interview') && Date.now() - a.updatedAt > JOIN.quietDays * DAY;
  const dropIn = Math.max(0, Math.ceil((a.updatedAt + JOIN.dropDays * DAY - Date.now()) / DAY));
  const anyState = ['interview', 'confirm', 'hold', 'reject', 'reopen', 'invited', 'link'].map(st).find(Boolean);
  if (gone) return null;
  return (
    <div className={`sj-card ${actCls(anyState)} ${a.status === 'hold' ? 'hold' : ''}`}>
      <div className="sj-top">
        {a.member ? <MemberFace nick={a.member.nick} size={36} /> : <span className="sj-init" aria-hidden="true">{a.riotId.slice(0, 1)}</span>}
        <div className="sj-name"><b>{a.riotId}</b><span>카톡 '{a.kakao}' · {ago(a.createdAt)}</span></div>
        <span className="sj-no">{a.no}</span>
      </div>
      <dl className="sj-dl">
        <dt>초대</dt><dd>{a.inviter ? <button type="button" className="sj-link" onClick={() => onOpen?.(a.inviter!.id)}>{shortNick(a.inviter.nick)}</button> : '추천인 없음'}{a.inviter && a.codeToday > 1 && <em> · 이 링크 오늘 {a.codeToday}건</em>}</dd>
        {a.times.length > 0 && <><dt>시간</dt><dd>{a.times.map((t) => TIME_KO[t]).filter(Boolean).join(' · ')}</dd></>}
        {a.note && <><dt>한마디</dt><dd>{a.note}</dd></>}
        {a.status === 'hold' && <><dt>상태</dt><dd className="sj-hold">보류</dd></>}
      </dl>
      {quiet && <span className="sj-warn">연락 없음 {Math.floor((Date.now() - a.updatedAt) / DAY)}일 · {dropIn}일 뒤 정리</span>}
      {(a.status === 'interview' || a.status === 'hold' || a.status === 'new') && a.signs.length > 0 && (
        <div className="sj-signs">{Array.from({ length: need }, (_, i) => a.signs[i] ? <i key={i} className="ok" title={a.signs[i].nick}>{a.signs[i].nick.slice(0, 1)}</i> : <i key={i}>?</i>)}<span>확정 {a.signs.length}/{need}</span></div>
      )}
      {(a.status === 'confirmed' || a.status === 'invited') && (
        <div className="sj-signs">{a.signs.map((s) => <i key={s.id} className="ok" title={s.nick}>{s.nick.slice(0, 1)}</i>)}<span>{a.status === 'invited' ? '초대함 · 로그인을 기다려요' : `${a.signs.length}명 확정`}</span></div>
      )}
      {a.status !== 'joined' && a.status !== 'rejected' && (
        <label className="sj-memo"><span className="sr-only">메모</span><input className="input sm" value={memo} placeholder="메모 (운영진끼리)" maxLength={300} onChange={(e) => setMemo(e.target.value)} onBlur={() => { if (memo !== (a.memo ?? '')) void act(a, 'memo', { memo }, false); }} /></label>
      )}
      <div className="sj-act">
        {a.status === 'new' && <ActBtn state={st('interview')} className="btn sm primary" label="면접 시작" onClick={() => void act(a, 'interview')} />}
        {(a.status === 'interview' || a.status === 'hold') && (
          a.signs.some((s) => s.id === data.me)
            ? <button type="button" className="btn sm" onClick={() => void act(a, 'unsign', {}, false)}>확정 취소</button>
            : <ActBtn state={st('confirm')} className="btn sm primary" label={a.signs.length + 1 >= need ? '확정' : `확정 (${a.signs.length + 1}/${need})`} onClick={() => void act(a, 'confirm', {}, a.signs.length + 1 >= need)} />
        )}
        {(a.status === 'interview' || a.status === 'new') && <button type="button" className="btn sm" onClick={() => void act(a, 'hold', {}, false)}>보류</button>}
        {(a.status === 'interview' || a.status === 'hold' || a.status === 'new') && <button type="button" className="btn sm" onClick={() => void act(a, 'reject')}>거절</button>}
        {(a.status === 'confirmed' || a.status === 'invited') && <>
          <span className="sj-tg"><Toggle on={a.sentKakao} label="톡방 초대 보냄" onChange={(on) => void act(a, 'kakao', { on }, false)} />톡방 초대</span>
          <span className="sj-tg"><Toggle on={a.sentDiscord} label="디스코드 초대 보냄" onChange={(on) => void act(a, 'discord', { on }, false)} />디스코드 초대</span>
        </>}
        {a.status === 'confirmed' && <ActBtn state={st('invited')} className="btn sm primary" label="초대함으로" disabled={!a.sentKakao || !a.sentDiscord} onClick={() => void act(a, 'invited')} />}
      </div>
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
