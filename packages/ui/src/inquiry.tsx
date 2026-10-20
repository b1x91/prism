/**
 * 문의하기 창 (CLAUDE.md v3.100, 앱 설정 · 웹 아래쪽). 보내면 Prism 운영진에게 디스코드 DM으로 바로 전달되고,
 * 답장은 디스코드 DM과 이 창의 '내 문의'에 남는다. 앱은 문제 확인에 필요한 상태를 함께 보낼 수 있다(기본 켜짐).
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { INQUIRY, INQUIRY_KIND_KO, INQUIRY_KINDS, type Api, type Inquiry, type InquiryContext, type InquiryKind } from '@prism/core';
import { Toggle } from './basics';
import { Icon } from './icons';

export type InquiryExtra = { context: InquiryContext; diag?: string | null };

const when = (t: number) => {
  const d = new Date(t), now = new Date();
  const hm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  return d.toDateString() === now.toDateString() ? `오늘 ${hm}` : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
};
const STATUS_KO = { open: '확인 중', replied: '답장 왔어요', done: '해결' } as const;
const msgOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** extra: 앱이 함께 보낼 상태를 만든다 (없으면 웹: 보던 화면만). 실패해도 문의는 보낸다 */
export function InquiryDialog({ api, extra, onClose }: { api: Api; extra?: () => Promise<InquiryExtra>; onClose: () => void }) {
  const [kind, setKind] = useState<InquiryKind>('bug');
  const [text, setText] = useState('');
  const [withState, setWithState] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(false);
  const [items, setItems] = useState<Inquiry[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => { api.get<{ items: Inquiry[] }>('/api/me/inquiry').then((r) => setItems(r.items)).catch(() => setItems([])); }, [api]);
  useEffect(() => { const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); }; addEventListener('keydown', esc); return () => removeEventListener('keydown', esc); }, [busy, onClose]);
  const len = text.trim().length;
  const send = async () => {
    setBusy(true); setErr('');
    try {
      let context: InquiryContext = { web: true, path: location.pathname + location.hash };
      let diag: string | null = null;
      if (extra) {
        const x = await extra().catch(() => null);
        if (x) { context = withState ? x.context : { app: x.context.app }; diag = withState ? x.diag ?? null : null; }
      }
      const r = await api.post<{ items: Inquiry[] }>('/api/me/inquiry', { kind, body: text, context, diag });
      setItems(r.items); setSent(true); setText('');
    } catch (e) { setErr(msgOf(e)); } finally { setBusy(false); }
  };
  const hint = INQUIRY_KINDS.find((k) => k.id === kind)!.hint;
  return createPortal(
    <div className="md-wrap" role="dialog" aria-modal="true" aria-label="문의하기">
      <button type="button" className="md-scrim" aria-label="닫기" onClick={busy ? undefined : onClose} />
      <div className="inq-dlg">
        <header className="gd-head"><Icon name="mail" /><b>문의하기</b><span className="sp" /><button type="button" className="gd-x" aria-label="닫기" onClick={onClose}><Icon name="x" /></button></header>
        {sent ? (
          <div className="gd-done">
            <span className="gd-ok" aria-hidden="true"><Icon name="check" /></span>
            <b>문의를 보냈어요</b>
            <p className="meta">운영진이 확인하고 디스코드 DM으로 답장드릴게요. 아래 '내 문의'에서도 볼 수 있어요.</p>
            <button type="button" className="btn" onClick={() => setSent(false)}>하나 더 보내기</button>
          </div>
        ) : <>
          <p className="meta" style={{ margin: 0 }}>Prism 운영진에게 바로 전달돼요. 답장은 디스코드 DM과 이 창에서 볼 수 있어요.</p>
          <div className="inq-kinds" role="radiogroup" aria-label="종류">
            {INQUIRY_KINDS.map((k) => <button key={k.id} type="button" role="radio" aria-checked={kind === k.id} className={`chip ${kind === k.id ? 'on' : ''}`} onClick={() => setKind(k.id)}>{k.name}</button>)}
          </div>
          <label className="inq-text">
            <textarea value={text} maxLength={INQUIRY.max} rows={6} placeholder={hint} onChange={(e) => setText(e.target.value)} />
            <small className={len > 0 && len < INQUIRY.min ? 'l' : ''}>{len}/{INQUIRY.max}</small>
          </label>
          {extra && (
            <label className="inq-opt">
              <span><b>앱 상태 함께 보내기</b><small>버전·롤 연결·자동 인식 상태처럼 문제를 찾는 데 필요한 것만 보내요.</small></span>
              <Toggle on={withState} label="앱 상태 함께 보내기" onChange={setWithState} />
            </label>
          )}
          {err && <p className="l" role="alert" style={{ margin: 0 }}>{err}</p>}
          <div className="inq-act">
            <button type="button" className="btn" onClick={onClose}>닫기</button>
            <button type="button" className="btn primary" disabled={busy || len < INQUIRY.min} onClick={send}><Icon name="send" />{busy ? '보내는 중…' : '보내기'}</button>
          </div>
        </>}
        <section className="inq-mine" aria-label="내 문의">
          <h3>내 문의</h3>
          {!items ? <div className="inq-list">{[0, 1].map((i) => <span key={i} className="sk inq-sk" aria-hidden="true" />)}</div>
            : !items.length ? <p className="meta" style={{ margin: 0 }}>아직 보낸 문의가 없어요.</p>
            : <div className="inq-list">{items.map((q) => (
              <article key={q.id} className={`inq-item st-${q.status}`}>
                <button type="button" className="inq-row" aria-expanded={open === q.id} onClick={() => setOpen(open === q.id ? null : q.id)}>
                  <span className="inq-k">{INQUIRY_KIND_KO[q.kind]}</span>
                  <span className="inq-b">{q.body}</span>
                  <span className={`inq-st st-${q.status}`}>{STATUS_KO[q.status]}</span>
                </button>
                {open === q.id && (
                  <div className="inq-more">
                    <p className="inq-full">{q.body}</p>
                    <small className="meta">{when(q.at)}</small>
                    {q.reply && <div className="inq-reply"><b>운영진 답장</b><p>{q.reply}</p>{q.repliedAt && <small className="meta">{when(q.repliedAt)}</small>}</div>}
                  </div>
                )}
              </article>
            ))}</div>}
        </section>
      </div>
    </div>, document.body,
  );
}
