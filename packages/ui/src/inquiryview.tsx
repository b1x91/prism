/**
 * 문의 메뉴 (CLAUDE.md v3.137). 회원: 문의 쓰기 + 내 문의. 운영진: '작업 목록' 탭 —
 * 서버가 열린 문의를 '어느 부분 · 어떤 종류'로 묶어 우선순위 순으로 세우고(`/api/staff/inquiries`),
 * 묶음마다 '작업 중' · '해결'을 누르고, 전체를 작업 지시용 마크다운으로 복사한다.
 */
import { useEffect, useState } from 'react';
import { INQUIRY_KIND_KO, type Api, type Inquiry, type InquiryStatus, type WorkGroup, type WorkItem } from '@prism/core';
import { useLoad } from './crew';
import { Seg } from './basics';
import { Icon } from './icons';
import { useKept } from './kept';
import { ActBtn, actCls, useResolve } from './motion';
import { InquiryForm, MyInquiries, type InquiryExtra } from './inquiry';
import { Bone, Swap, fadeCls, useReveal } from './skeleton';

type Worklist = { groups: WorkGroup[]; done: WorkItem[]; md: string; total: number };
const ST_KO: Record<InquiryStatus, string> = { open: '새 문의', replied: '답장함', working: '작업 중', done: '해결' };
const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60_000);
  if (m < 60) return `${Math.max(1, m)}분 전`;
  if (m < 60 * 24) return `${Math.round(m / 60)}시간 전`;
  const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()}`;
};

export function InquiryView({ api, extra, canManage }: { api: Api; extra?: () => Promise<InquiryExtra>; canManage?: boolean }) {
  const [tab, setTab] = useKept<'write' | 'work'>('inq-tab', 'write');
  const mine = useLoad<{ items: Inquiry[] }>(api, '/api/me/inquiry');
  const [items, setItems] = useState<Inquiry[] | null>(null);
  useEffect(() => { if (mine.data) setItems(mine.data.items); }, [mine.data]);
  const showWork = Boolean(canManage) && tab === 'work';
  return (
    <div className="stack inq-page" style={{ gap: 16 }}>
      <header className="inq-head">
        <h1>문의</h1>
        {canManage && <Seg value={tab} onChange={setTab} options={[['write', '문의하기'], ['work', '작업 목록']]} />}
      </header>
      {showWork ? <Worklist api={api} /> : <>
        <section className="card pad inq-card">
          <div className="card-head"><h2>문의하기</h2><span className="sp" /><span className="meta">운영진에게 바로 전달되고, 답장은 디스코드 DM으로 와요</span></div>
          <InquiryForm api={api} extra={extra} onSent={setItems} />
        </section>
        <section className="card pad inq-card">
          <div className="card-head"><h2>내 문의</h2></div>
          <MyInquiries items={items} />
        </section>
      </>}
    </div>
  );
}

/** 운영진 작업 목록 */
function Worklist({ api }: { api: Api }) {
  const { data, error, reload } = useLoad<Worklist>(api, '/api/staff/inquiries');
  const rv = useReveal(Boolean(data));
  const res = useResolve(reload);
  const [copied, setCopied] = useState(false);
  const [showDone, setShowDone] = useState(false);
  if (error) return <section className="card pad"><p className="meta">{error}</p></section>;
  if (!data) return <WorkSkeleton />;
  const set = (key: string, ids: number[], status: 'open' | 'working' | 'done', leave: boolean) =>
    res.run(key, () => api.post('/api/staff/inquiries/status', { ids, status }), leave);
  const copy = async () => {
    try { await navigator.clipboard.writeText(data.md); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* 복사 못 함 */ }
  };
  const open = data.groups.reduce((n, g) => n + g.count, 0);
  return (
    <Swap on={rv} skeleton={<WorkSkeleton />}>
      <div className={`stack ${fadeCls(rv)}`} style={{ gap: 12 }}>
        <section className="card pad wl-top">
          <span className="wl-sum"><b className="num">{data.groups.length}</b><small>묶음</small></span>
          <span className="wl-sum"><b className="num">{open}</b><small>열린 문의</small></span>
          <span className="wl-sum"><b className="num">{data.groups.filter((g) => g.kind === 'bug').reduce((n, g) => n + g.count, 0)}</b><small>버그·오류</small></span>
          <span className="sp" />
          <button type="button" className="btn" disabled={!data.groups.length} onClick={copy}><Icon name={copied ? 'check' : 'copy'} />{copied ? '복사했어요' : '작업 목록 복사'}</button>
        </section>
        {!data.groups.length && <section className="card pad"><p className="meta" style={{ margin: 0 }}>열린 문의가 없어요.</p></section>}
        {data.groups.filter((g) => !res.gone(g.key)).map((g, i) => {
          const ids = g.items.map((x) => x.id);
          const working = g.items.every((x) => x.status === 'working');
          return (
            <section key={g.key} className={`card wl-group k-${g.kind} ${actCls(res.state(g.key))}`}>
              <header className="wl-gh">
                <span className="wl-rank num">{i + 1}</span>
                <span className="wl-gt">
                  <b>{g.areaName}</b>
                  <span className="wl-meta"><i className={`wl-kind k-${g.kind}`}>{INQUIRY_KIND_KO[g.kind]}</i>{g.people}명 · {g.count}건 · 최근 {ago(g.last)}</span>
                </span>
                <span className="wl-acts">
                  {!working && <ActBtn className="btn sm" state={res.state(`${g.key}:w`)} label="작업 중으로" busy="바꾸는 중" done="작업 중" onClick={() => set(`${g.key}:w`, ids, 'working', false)} />}
                  <ActBtn className="btn sm equip" state={res.state(g.key)} label="모두 해결" busy="처리 중" done="해결" onClick={() => set(g.key, ids, 'done', true)} />
                </span>
              </header>
              <ul className="wl-items">{g.items.filter((x) => !res.gone(`i${x.id}`)).map((x) => (
                <li key={x.id} className={`wl-item st-${x.status} ${actCls(res.state(`i${x.id}`))}`}>
                  <p>{x.body}</p>
                  <span className="wl-im">
                    <span className="num">#{x.id}</span><span>{x.who}</span><span>{ago(x.at)}</span>{x.ctx && <span>{x.ctx}</span>}
                    <i className={`wl-st st-${x.status}`}>{ST_KO[x.status]}</i>
                    <span className="sp" />
                    <ActBtn className="btn xs ghost" state={res.state(`i${x.id}`)} label="해결" busy="처리 중" done="해결" onClick={() => set(`i${x.id}`, [x.id], 'done', true)} />
                  </span>
                  {x.reply && <span className="wl-reply"><b>답장</b>{x.reply}</span>}
                </li>
              ))}</ul>
            </section>
          );
        })}
        {data.done.length > 0 && <section className="card pad wl-done">
          <button type="button" className="wl-done-h" aria-expanded={showDone} onClick={() => setShowDone((v) => !v)}><b>최근 해결한 문의 {data.done.length}건</b><Icon name="chevD" className={showDone ? 'flip' : ''} /></button>
          {showDone && <ul className="wl-items">{data.done.map((x) => (
            <li key={x.id} className={`wl-item st-done ${actCls(res.state(`r${x.id}`))}`}>
              <p>{x.body}</p>
              <span className="wl-im"><span className="num">#{x.id}</span><span>{INQUIRY_KIND_KO[x.kind]}</span><span>{x.who}</span><span>{ago(x.at)}</span><span className="sp" />
                <ActBtn className="btn xs ghost" state={res.state(`r${x.id}`)} label="다시 열기" busy="여는 중" done="열었어요" onClick={() => set(`r${x.id}`, [x.id], 'open', true)} /></span>
            </li>
          ))}</ul>}
        </section>}
      </div>
    </Swap>
  );
}

function WorkSkeleton() {
  return (
    <div className="stack" style={{ gap: 12 }} aria-busy="true">
      <section className="card pad wl-top">
        {[0, 1, 2].map((i) => <span key={i} className="wl-sum"><Bone w={32} h={24} /><Bone w={56} h={12} /></span>)}
        <span className="sp" /><Bone w={132} h={36} r="m" />
      </section>
      {[0, 1].map((i) => (
        <section key={i} className="card wl-group">
          <header className="wl-gh"><Bone w={28} h={28} r="round" /><span className="wl-gt"><Bone w={160} h={16} /><Bone w={200} h={12} /></span></header>
          <ul className="wl-items"><li className="wl-item"><Bone w="90%" h={14} /><Bone w="50%" h={12} /></li></ul>
        </section>
      ))}
    </div>
  );
}
