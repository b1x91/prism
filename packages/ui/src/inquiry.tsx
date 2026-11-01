/**
 * 문의하기 창 (CLAUDE.md v3.100, 앱 설정 · 웹 아래쪽). 보내면 Prism 운영진에게 디스코드 DM으로 바로 전달되고,
 * 답장은 디스코드 DM과 이 창의 '내 문의'에 남는다. 앱은 문제 확인에 필요한 상태를 함께 보낼 수 있다(기본 켜짐).
 */
import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
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
const STATUS_KO = { open: '확인 중', replied: '답장 왔어요', working: '작업 중', done: '해결' } as const;
const msgOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** 첨부 사진 (v3.141): 최대 5장. 보내기 전에 긴 변 1600px 로 줄여 가볍게 (서버는 장당 1.2MB 까지) */
export const INQ_FILES = { max: 5, side: 1600, bytes: 1_200_000 } as const;
async function shrink(f: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(f.type)) throw new Error('사진(PNG·JPG·WEBP·GIF)만 붙일 수 있어요.');
  const url = URL.createObjectURL(f);
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('사진을 읽지 못했어요.')); i.src = url; });
    const k = Math.min(1, INQ_FILES.side / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    // 글자가 많은 스크린샷은 webp 가 또렷하고 가볍다. 너무 크면 품질을 낮춰 다시
    for (const q of [0.86, 0.75, 0.6]) {
      const d = c.toDataURL('image/webp', q);
      const out = d.startsWith('data:image/webp') ? d : c.toDataURL('image/jpeg', q);
      if (out.length * 0.75 <= INQ_FILES.bytes) return out;
    }
    throw new Error('사진이 너무 커요.');
  } finally { URL.revokeObjectURL(url); }
}

/** 사진 크게 보기 (화살표·Esc·바깥 누르면 닫힘) */
function PicViewer({ pics, at, onClose }: { pics: string[]; at: number; onClose: () => void }) {
  const [i, setI] = useState(at);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') setI((x) => (x + 1) % pics.length); if (e.key === 'ArrowLeft') setI((x) => (x - 1 + pics.length) % pics.length); };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  }, [pics.length, onClose]);
  return createPortal(
    <div className="inq-view" role="dialog" aria-modal="true" aria-label="첨부 사진" onClick={onClose}>
      <img key={i} src={pics[i]} alt={`첨부 사진 ${i + 1}`} onClick={(e) => e.stopPropagation()} />
      {pics.length > 1 && <span className="inq-view-n">{i + 1} / {pics.length}</span>}
      <button type="button" className="inq-view-x" aria-label="닫기"><Icon name="x" /></button>
    </div>, document.body,
  );
}

/** 보낸 문의의 첨부 사진: 펼칠 때 불러온다 (보낸 회원 본인 · 운영진만) */
export function InquiryPics({ api, id, n }: { api: Api; id: number; n: number }) {
  const [pics, setPics] = useState<string[] | null>(null);
  const [view, setView] = useState<number | null>(null);
  useEffect(() => { let on = true; api.get<{ files: string[] }>(`/api/inquiry/${id}/files`).then((r) => on && setPics(r.files)).catch(() => on && setPics([])); return () => { on = false; }; }, [api, id]);
  return (
    <div className="inq-pics" aria-label={`첨부 사진 ${n}장`}>
      {pics ? pics.map((p, i) => <button key={i} type="button" className="inq-pic" onClick={() => setView(i)} aria-label={`사진 ${i + 1} 크게 보기`}><img src={p} alt="" /></button>)
        : Array.from({ length: n }, (_, i) => <span key={i} className="inq-pic sk" aria-hidden="true" />)}
      {pics && view != null && <PicViewer pics={pics} at={view} onClose={() => setView(null)} />}
    </div>
  );
}

/** 문의 쓰기 칸: 종류 · 글 · (앱) 상태 함께 보내기 · 보내기. 보낸 뒤에는 '보냈어요' (v3.137 문의 메뉴와 창 공용) */
export function InquiryForm({ api, extra, onSent, onClose }: { api: Api; extra?: () => Promise<InquiryExtra>; onSent: (items: Inquiry[]) => void; onClose?: () => void }) {
  const [kind, setKind] = useState<InquiryKind>('bug');
  const [text, setText] = useState('');
  const [withState, setWithState] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(false);
  const [pics, setPics] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const len = text.trim().length;
  const add = useCallback(async (list: FileList | File[]) => {
    const fs = [...list].filter((f) => f.type.startsWith('image/'));
    if (!fs.length) return;
    setErr(''); setAdding(true);
    try {
      const room = INQ_FILES.max - pics.length;
      if (room <= 0) { setErr(`사진은 ${INQ_FILES.max}장까지 붙일 수 있어요.`); return; }
      const out: string[] = [];
      for (const f of fs.slice(0, room)) out.push(await shrink(f));
      setPics((p) => [...p, ...out].slice(0, INQ_FILES.max));
      if (fs.length > room) setErr(`사진은 ${INQ_FILES.max}장까지 붙일 수 있어요.`);
    } catch (e) { setErr(msgOf(e)); } finally { setAdding(false); }
  }, [pics.length]);
  const onPaste = (e: ClipboardEvent) => { const fs = [...e.clipboardData.files]; if (fs.some((f) => f.type.startsWith('image/'))) { e.preventDefault(); void add(fs); } };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDrag(false); void add(e.dataTransfer.files); };
  const send = async () => {
    setBusy(true); setErr('');
    try {
      let context: InquiryContext = { web: true, path: location.pathname + location.hash };
      let diag: string | null = null;
      if (extra) {
        const x = await extra().catch(() => null);
        if (x) { context = withState ? x.context : { app: x.context.app }; diag = withState ? x.diag ?? null : null; }
      }
      const r = await api.post<{ items: Inquiry[] }>('/api/me/inquiry', { kind, body: text, context, diag, files: pics });
      onSent(r.items); setSent(true); setText(''); setPics([]);
    } catch (e) { setErr(msgOf(e)); } finally { setBusy(false); }
  };
  const hint = INQUIRY_KINDS.find((k) => k.id === kind)!.hint;
  if (sent) return (
    <div className="gd-done">
      <span className="gd-ok" aria-hidden="true"><Icon name="check" /></span>
      <b>문의를 보냈어요</b>
      <p className="meta">운영진이 확인하고 디스코드 DM으로 답장드릴게요. '내 문의'에서 진행 상황을 볼 수 있어요.</p>
      <button type="button" className="btn" onClick={() => setSent(false)}>하나 더 보내기</button>
    </div>
  );
  return <>
    <div className="inq-kinds" role="radiogroup" aria-label="종류">
      {INQUIRY_KINDS.map((k) => <button key={k.id} type="button" role="radio" aria-checked={kind === k.id} className={`chip ${kind === k.id ? 'on' : ''}`} onClick={() => setKind(k.id)}>{k.name}</button>)}
    </div>
    <div className={`inq-compose ${drag ? 'drag' : ''}`} onDragOver={(e) => { if ([...e.dataTransfer.items].some((i) => i.kind === 'file')) { e.preventDefault(); setDrag(true); } }} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrag(false); }} onDrop={onDrop}>
      <label className="inq-text">
        <textarea value={text} maxLength={INQUIRY.max} rows={6} placeholder={hint} onChange={(e) => setText(e.target.value)} onPaste={onPaste} />
        <small className={len > 0 && len < INQUIRY.min ? 'l' : ''}>{len}/{INQUIRY.max}</small>
      </label>
      <div className="inq-attach">
        {pics.map((p, i) => (
          <span key={p.slice(-24) + i} className="inq-pic">
            <img src={p} alt={`붙인 사진 ${i + 1}`} />
            <button type="button" className="inq-pic-x" aria-label={`사진 ${i + 1} 빼기`} onClick={() => setPics((x) => x.filter((_, j) => j !== i))}><Icon name="x" /></button>
          </span>
        ))}
        {pics.length < INQ_FILES.max && (
          <button type="button" className="inq-add" disabled={adding} onClick={() => fileRef.current?.click()} aria-label="사진 붙이기">
            {adding ? <i className="inq-spin" /> : <Icon name="plus" />}<small>{pics.length}/{INQ_FILES.max}</small>
          </button>
        )}
        <span className="inq-attach-t">스크린샷은 붙여 넣거나(Ctrl+V) 끌어다 놓아도 돼요</span>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden onChange={(e) => { if (e.target.files) void add(e.target.files); e.target.value = ''; }} />
      </div>
      {drag && <div className="inq-drop" aria-hidden="true"><Icon name="plus" />여기에 놓으면 사진이 붙어요</div>}
    </div>
    {extra && (
      <label className="inq-opt">
        <span><b>앱 상태 함께 보내기</b><small>버전·롤 연결·자동 인식 상태처럼 문제를 찾는 데 필요한 것만 보내요.</small></span>
        <Toggle on={withState} label="앱 상태 함께 보내기" onChange={setWithState} />
      </label>
    )}
    {err && <p className="l" role="alert" style={{ margin: 0 }}>{err}</p>}
    <div className="inq-act">
      {onClose && <button type="button" className="btn" onClick={onClose}>닫기</button>}
      <button type="button" className="btn primary" disabled={busy || adding || len < INQUIRY.min} onClick={send}><Icon name="send" />{busy ? '보내는 중…' : '보내기'}</button>
    </div>
  </>;
}

/** 내 문의 목록 (누르면 펼쳐 원문·운영진 답장) */
export function MyInquiries({ items, api }: { items: Inquiry[] | null; api?: Api }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!items) return <div className="inq-list">{[0, 1].map((i) => <span key={i} className="sk inq-sk" aria-hidden="true" />)}</div>;
  if (!items.length) return <p className="meta" style={{ margin: 0 }}>아직 보낸 문의가 없어요.</p>;
  return <div className="inq-list">{items.map((q) => (
    <article key={q.id} className={`inq-item st-${q.status}`}>
      <button type="button" className="inq-row" aria-expanded={open === q.id} onClick={() => setOpen(open === q.id ? null : q.id)}>
        <span className="inq-k">{INQUIRY_KIND_KO[q.kind]}</span>
        <span className="inq-b">{q.body}</span>
        {(q.files ?? 0) > 0 && <span className="inq-nf" title={`사진 ${q.files}장`}><Icon name="image" />{q.files}</span>}
        <span className={`inq-st st-${q.status}`}>{STATUS_KO[q.status]}</span>
      </button>
      {open === q.id && (
        <div className="inq-more">
          <p className="inq-full">{q.body}</p>
          {api && (q.files ?? 0) > 0 && <InquiryPics api={api} id={q.id} n={q.files!} />}
          <small className="meta">{when(q.at)}</small>
          {q.reply && <div className="inq-reply"><b>운영진 답장</b><p>{q.reply}</p>{q.repliedAt && <small className="meta">{when(q.repliedAt)}</small>}</div>}
        </div>
      )}
    </article>
  ))}</div>;
}

/** 문의하기 창 (앱 설정 · 웹 아래쪽에서 열던 것 — 이제는 '문의' 메뉴가 기본, 창은 남겨 둔다) */
export function InquiryDialog({ api, extra, onClose }: { api: Api; extra?: () => Promise<InquiryExtra>; onClose: () => void }) {
  const [items, setItems] = useState<Inquiry[] | null>(null);
  useEffect(() => { api.get<{ items: Inquiry[] }>('/api/me/inquiry').then((r) => setItems(r.items)).catch(() => setItems([])); }, [api]);
  useEffect(() => { const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; addEventListener('keydown', esc); return () => removeEventListener('keydown', esc); }, [onClose]);
  return createPortal(
    <div className="md-wrap" role="dialog" aria-modal="true" aria-label="문의하기">
      <button type="button" className="md-scrim" aria-label="닫기" onClick={onClose} />
      <div className="inq-dlg">
        <header className="gd-head"><Icon name="mail" /><b>문의하기</b><span className="sp" /><button type="button" className="gd-x" aria-label="닫기" onClick={onClose}><Icon name="x" /></button></header>
        <p className="meta" style={{ margin: 0 }}>Prism 운영진에게 바로 전달돼요. 답장은 디스코드 DM과 이 창에서 볼 수 있어요.</p>
        <InquiryForm api={api} extra={extra} onSent={setItems} onClose={onClose} />
        <section className="inq-mine" aria-label="내 문의"><h3>내 문의</h3><MyInquiries items={items} api={api} /></section>
      </div>
    </div>, document.body,
  );
}
