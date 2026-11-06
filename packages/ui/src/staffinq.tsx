/**
 * 운영 › 문의 (CLAUDE.md v3.160). 문의 메뉴의 '작업 목록'을 여기로 옮겼다.
 *  - 머리: 새 문의 수 · 상태 칩(열린 문의 · 새 문의 · 작업 중 · 답장함 · 해결)으로 거르기
 *  - 묶음: 서버가 '어느 부분 · 어떤 종류'로 묶어 우선순위 순으로(버그 · 여러 명 · 최근일수록 위) — 1위 번호는 종류 색
 *  - 문의 줄: 이름 · 상태 · 시각 · 내용 · 사진 · 앱 버전/롤 상태/화면 · 보낸 답장. 동작은 한 알약(답장 | 작업 시작 | 해결)
 *  - 답장: 줄 아래로 펼쳐지는 작성 칸 — 빠른 문구 · 글자 수 · '보내고 해결로 표시'(기본 켜짐). 회원에게 디스코드 DM + 내 문의
 */
import { useEffect, useRef, useState } from 'react';
import { INQUIRY_KIND_KO, type Api, type InquiryKind, type InquiryStatus, type WorkGroup, type WorkItem } from '@prism/core';
import { Empty, MemberFace } from './basics';
import { Icon } from './icons';
import { useLoad } from './crew';
import { useKept } from './kept';
import { actCls, useFlip, useResolve, type ActState } from './motion';
import { InquiryPics } from './inquiry';
import { Bone, SkeletonFrame, Swap, fadeCls, useReveal } from './skeleton';

type Worklist = { groups: WorkGroup[]; done: WorkItem[]; total: number };
type Filter = 'all' | InquiryStatus;
const ST: Record<InquiryStatus, { name: string; color: string }> = {
  open: { name: '새 문의', color: 'var(--lose)' }, working: { name: '작업 중', color: 'var(--accent)' },
  replied: { name: '답장함', color: 'var(--ok)' }, done: { name: '해결', color: 'var(--text-3)' },
};
const KIND_C: Record<InquiryKind, string> = { bug: '#e5484d', idea: '#7c3aed', account: '#d97706', etc: '#64748b' };
const REPLY: [string, string][] = [
  ['확인했어요', '확인했어요. 살펴보고 다시 알려 드릴게요.'],
  ['다음 업데이트에서', '다음 업데이트에서 고칠게요. 알려 주셔서 고마워요!'],
  ['고쳤어요', '고쳤어요. 앱을 업데이트한 뒤 다시 확인해 주세요.'],
  ['더 알려 주세요', '조금 더 알려 주실 수 있을까요? 언제, 어느 화면에서였는지요.'],
];
const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60_000);
  if (m < 60) return `${Math.max(1, m)}분 전`;
  if (m < 60 * 24) return `${Math.round(m / 60)}시간 전`;
  if (m < 60 * 48) return '어제';
  const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()}`;
};

export function StaffInquiryView({ api, onOpen }: { api: Api; onOpen?: (id: string) => void }) {
  const { data, error, reload } = useLoad<Worklist>(api, '/api/staff/inquiries');
  const rv = useReveal(Boolean(data));
  const [f, setF] = useKept<Filter>('staff.inq', 'all');
  const res = useResolve(reload);
  if (error) return <Empty>{error}</Empty>;
  if (!data) return <InqSkeleton />;
  const open = data.groups.flatMap((g) => g.items);
  const c = (s: InquiryStatus) => (s === 'done' ? data.done.length : open.filter((x) => x.status === s).length);
  const groups: { key: string; title: string; kind: InquiryKind | null; people: number; items: WorkItem[] }[] = f === 'done'
    ? (data.done.length ? [{ key: 'done', title: '최근 해결한 문의', kind: null, people: new Set(data.done.map((x) => x.whoId)).size, items: data.done }] : [])
    : data.groups.map((g) => ({ key: g.key, title: g.areaName, kind: g.kind, people: g.people, items: g.items.filter((x) => (f === 'all' || x.status === f) && !res.gone(String(x.id))) })).filter((g) => g.items.length);
  const chips: [Filter, string, number, string][] = [['all', '열린 문의', open.length, 'var(--lose)'], ...(['open', 'working', 'replied', 'done'] as InquiryStatus[]).map((s) => [s, ST[s].name, c(s), ST[s].color] as [Filter, string, number, string])];
  return (
    <Swap on={rv} skeleton={<InqSkeleton />}>
      <div className={`sv ${fadeCls(rv)}`}>
        <section className="card sv-card sv-iqtop">
          <div><h2>{c('open') ? `새 문의 ${c('open')}개` : '새 문의가 없어요'}</h2><p>같은 부분·같은 종류는 한 묶음으로 · 버그 · 여러 명 · 최근일수록 위에</p></div>
          <div className="sv-kinds">{chips.map(([k, l, n, col]) => <button key={k} type="button" className={`sv-tk ${f === k ? 'on' : ''} ${n ? '' : 'zero'}`} style={{ ['--kc' as string]: col }} aria-pressed={f === k} onClick={() => setF(k)}><i />{l} <b>{n}</b></button>)}</div>
        </section>
        {groups.length ? groups.map((g, i) => (
          <section key={g.key} className="card sv-card sv-tsec sv-iqg" style={{ ['--kc' as string]: g.kind ? KIND_C[g.kind] : 'var(--text-3)' }}>
            <div className="sv-head"><h2>{g.kind && f !== 'done' && <span className={`prio ${i === 0 ? 'top' : ''}`}>{i + 1}</span>}{g.title}{g.kind && <span className="sv-kchip">{INQUIRY_KIND_KO[g.kind]}</span>}</h2><span className="meta">{g.people}명 · {g.items.length}건</span></div>
            <Items api={api} items={g.items} res={res} onOpen={onOpen} reload={reload} />
          </section>
        )) : <section className="card sv-card"><div className="sv-tdone"><span className="big"><Icon name="check" /></span><h3>여기는 비었어요</h3><p>다른 상태를 골라 보세요.</p></div></section>}
      </div>
    </Swap>
  );
}

function Items({ api, items, res, onOpen, reload }: { api: Api; items: WorkItem[]; res: ReturnType<typeof useResolve>; onOpen?: (id: string) => void; reload: () => Promise<unknown> }) {
  const box = useFlip<HTMLDivElement>(items.map((x) => x.id).join());
  return <div className="sv-titems" ref={box}>{items.map((q) => <Item key={q.id} api={api} q={q} st={res.state(String(q.id))} res={res} onOpen={onOpen} reload={reload} />)}</div>;
}

function Item({ api, q, st, res, onOpen, reload }: { api: Api; q: WorkItem; st: ActState; res: ReturnType<typeof useResolve>; onOpen?: (id: string) => void; reload: () => Promise<unknown> }) {
  const [reply, setReply] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const setStatus = (status: 'open' | 'working' | 'done', leave: boolean) => { setErr(''); res.run(String(q.id), () => api.post('/api/staff/inquiries/status', { ids: [q.id], status }), leave).catch((e) => setErr(e instanceof Error ? e.message : String(e))); };
  const toggleWork = async () => { setBusy(true); setErr(''); try { await api.post('/api/staff/inquiries/status', { ids: [q.id], status: q.status === 'working' ? 'open' : 'working' }); await reload(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } };
  const done = q.status === 'done';
  return (
    <div data-flip={q.id} className={`sv-ti sv-iqi ${actCls(st)}`}>
      <button type="button" className="sv-tface" onClick={() => onOpen?.(q.whoId)} aria-label={`${q.who} 회원 페이지`}><MemberFace nick={q.who} size={40} /></button>
      <div>
        <h4>{q.who}<span className="stp" style={{ ['--kc' as string]: ST[q.status].color }}><i />{ST[q.status].name}</span><span className="meta">#{q.id} · {ago(q.at)}</span></h4>
        <p className="iq-text">{q.body}</p>
        {(q.files ?? 0) > 0 && <InquiryPics api={api} id={q.id} n={q.files!} />}
        {q.ctx && <div className="sv-sub">{q.ctx.split(', ').map((x) => <span key={x}>{x}</span>)}</div>}
        {q.reply && <div className="iq-reply"><b>내 답장 · 디스코드 DM으로 보냈어요</b>{q.reply}</div>}
        {err && <p className="sv-err">{err}</p>}
      </div>
      <div className="sv-acts">
        <div className="sv-abar">
          {done ? <button type="button" onClick={() => setStatus('open', true)}><Icon name="refresh" />다시 열기</button> : <>
            <button type="button" className={reply ? 'on' : ''} aria-expanded={reply} onClick={() => setReply(!reply)}><Icon name="send" />답장</button>
            <button type="button" className={`w ${q.status === 'working' ? 'on' : ''}`} aria-pressed={q.status === 'working'} disabled={busy} onClick={toggleWork}><Icon name="spark" />{q.status === 'working' ? '작업 중' : '작업 시작'}</button>
            <button type="button" className={`ok act ${st === 'busy' ? 'busy' : st ? 'done' : ''}`} disabled={Boolean(st)} onClick={() => setStatus('done', true)}>
              <span className="s0"><Icon name="check" />해결</span><span className="s1"><i className="act-spin" />처리 중</span><span className="s2"><Icon name="check" />해결함</span>
            </button>
          </>}
        </div>
      </div>
      {!done && <ReplyBox api={api} q={q} open={reply} onClose={() => setReply(false)} onSent={async (resolved) => { setReply(false); if (resolved) await res.run(String(q.id), async () => {}, true); else await reload(); }} />}
    </div>
  );
}

function ReplyBox({ api, q, open, onClose, onSent }: { api: Api; q: WorkItem; open: boolean; onClose: () => void; onSent: (resolved: boolean) => Promise<void> }) {
  const [text, setText] = useState('');
  const [resolve, setResolve] = useState(true);
  const [st, setSt] = useState<'idle' | 'busy' | 'done'>('idle');
  const [err, setErr] = useState('');
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (open) { const t = setTimeout(() => ta.current?.focus({ preventScroll: true }), 260); return () => clearTimeout(t); } }, [open]);
  useEffect(() => { const el = ta.current; if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(220, el.scrollHeight)}px`; } }, [text]);
  const send = async () => {
    if (!text.trim() || st !== 'idle') return;
    setSt('busy'); setErr('');
    try {
      await api.post(`/api/staff/inquiries/${q.id}/reply`, { text: text.trim(), resolve });
      setSt('done'); await new Promise((r) => setTimeout(r, 650));
      await onSent(resolve); setText(''); setSt('idle');
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setSt('idle'); }
  };
  return (
    <div className={`sv-rbox ${open ? 'open' : ''}`} aria-hidden={!open}>
      <div><div className="rb-in">
        <div className="rb-to"><MemberFace nick={q.who} size={24} /><b>{q.who}</b>님께 답장 <span className="meta">· 디스코드 DM과 '내 문의'로 가요</span></div>
        <div className="rb-tpl">{REPLY.map(([l, t]) => <button key={l} type="button" title={t} tabIndex={open ? 0 : -1} onClick={() => { setText(t); ta.current?.focus(); }}>{l}</button>)}</div>
        <textarea ref={ta} rows={3} maxLength={1500} placeholder="답장을 써 주세요" value={text} tabIndex={open ? 0 : -1} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void send(); }} />
        {err && <p className="sv-err">{err}</p>}
        <div className="rb-foot">
          <label className="rb-chk"><input type="checkbox" checked={resolve} tabIndex={open ? 0 : -1} onChange={(e) => setResolve(e.target.checked)} /><i />보내고 해결로 표시</label>
          <span className="rb-n">{text.length} / 1500</span><span className="sp" />
          <button type="button" className="btn ghost" tabIndex={open ? 0 : -1} onClick={onClose}>취소</button>
          <button type="button" className={`btn primary rb-send act-btn ${st === 'idle' ? 'idle' : st}`} disabled={!text.trim() || st !== 'idle'} tabIndex={open ? 0 : -1} onClick={send}>
            <span className="act-stack"><span className={st === 'idle' ? 'on' : ''}><Icon name="send" />보내기</span><span className={st === 'busy' ? 'on' : ''}><i className="act-spin" />보내는 중</span><span className={st === 'done' ? 'on' : ''}><Icon name="check" />보냈어요</span></span>
          </button>
        </div>
      </div></div>
    </div>
  );
}

function InqSkeleton() {
  return (
    <SkeletonFrame className="sv">
      <section className="card sv-card sv-iqtop"><div><Bone w={140} h={22} /><Bone w="90%" h={12} /></div><div className="sv-kinds">{[0, 1, 2, 3, 4].map((i) => <Bone key={i} w={96} h={36} r="pill" />)}</div></section>
      {[0, 1].map((s) => <section key={s} className="card sv-card sv-tsec sv-iqg"><div className="sv-head"><Bone w="40%" h={22} /></div><div className="sv-titems">{[0, 1].map((i) => <div key={i} className="sv-ti sv-iqi"><Bone w={40} h={40} r="round" /><div style={{ display: 'grid', gap: 8, alignContent: 'start' }}><Bone w="50%" h={14} /><Bone w="90%" h={14} /><Bone w="40%" h={22} /></div><div className="sv-acts"><div className="sv-abar"><Bone w={72} h={32} r="m" /><Bone w={104} h={32} r="m" /><Bone w={88} h={32} r="m" /></div></div></div>)}</div></section>)}
    </SkeletonFrame>
  );
}
