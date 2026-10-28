/**
 * 소식 피드 (CLAUDE.md v3.111, 시안 B) — 앱·웹 공용.
 *  - 고정 소식을 맨 위에, 그 아래는 날짜별 타임라인. 운영진 공지·이벤트와 저절로 생긴 소식(앱 새 버전·증강 패치·새 시즌)이 함께.
 *  - 거르기 칩(공지·이벤트·업데이트·패치·시즌, 전체 칩 없음) · 하트 · 안 읽은 소식은 NEW.
 *  - 운영진: 위에 '소식 쓰기'(공지/이벤트 · 제목 · 내용 · 고정 · 디스코드에도 올리기), 카드마다 고정·고치기·지우기.
 */
import { useEffect, useRef, useState } from 'react';
import { AUGMENT, NEWS_LABEL, NEWS_MAX, shortDate, type Api, type NewsItem, type NewsKind, type NewsList } from '@prism/core';
import { Empty, Seg, Toggle } from './basics';
import { AugRing, AugmentLink } from './augment';
import { Icon } from './icons';
import { useLoad } from './crew';
import { useKept } from './kept';
import { HeartBurst } from './likeheart';
import { Bone, SkeletonFrame, Swap, fadeCls, useReveal } from './skeleton';

const KINDS: NewsKind[] = ['notice', 'event', 'update', 'patch', 'season'];
const dayKey = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
function dayLabel(t: number) {
  const k = dayKey(t);
  if (k === dayKey(Date.now())) return '오늘';
  if (k === dayKey(Date.now() - 86_400_000)) return '어제';
  return shortDate(t);
}
const clock = (t: number) => new Date(t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });

/** onRead = 읽음 처리가 끝났을 때(메뉴의 빨간 점을 지운다) · onNewAugments = 증강 탭 '새로운 증강'으로 */
export function NewsView({ api, onRead, onNewAugments }: { api: Api; onRead?: () => void; onNewAugments?: () => void }) {
  const { data, error, reload } = useLoad<NewsList>(api, '/api/news');
  const rv = useReveal(Boolean(data));
  const [kinds, setKinds] = useKept<NewsKind[]>('news.kinds', []);
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const read = useRef(false);
  useEffect(() => { if (data) setItems(data.items); }, [data]);
  // 열면 여기까지 읽은 것으로 (NEW 표시는 이번에 연 화면에서는 그대로 둔다)
  useEffect(() => {
    if (!data || read.current) return;
    read.current = true;
    if (data.items.some((x) => x.at > data.readAt)) api.post('/api/news/read', {}).then(() => onRead?.()).catch(() => {});
  }, [data, api, onRead]);
  if (error) return <Empty>{error}</Empty>;
  if (!data || !items) return <NewsSkeleton />;
  const shown = items.filter((x) => !kinds.length || kinds.includes(x.kind));
  const pinned = shown.filter((x) => x.pinned), rest = shown.filter((x) => !x.pinned);
  const days: { key: string; label: string; list: NewsItem[] }[] = [];
  for (const x of rest) {
    const k = dayKey(x.at);
    const last = days[days.length - 1];
    if (last?.key === k) last.list.push(x); else days.push({ key: k, label: dayLabel(x.at), list: [x] });
  }
  const patch = (id: number, p: Partial<NewsItem>) => setItems((xs) => xs && xs.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const toggle = (k: NewsKind) => setKinds(kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k]);
  const card = (x: NewsItem) => <NewsCard key={x.id} api={api} x={x} isNew={x.at > data.readAt} canWrite={data.canWrite} onPatch={(p) => patch(x.id, p)} onChanged={reload} onNewAugments={onNewAugments} />;
  return (
    <Swap on={rv} skeleton={<NewsSkeleton />}>
      <div className={`nw ${fadeCls(rv)}`}>
        {data.canWrite && <Composer api={api} onDone={reload} />}
        <div className="nw-chips" role="group" aria-label="소식 거르기">
          {KINDS.map((k) => <button key={k} type="button" className={`chip ${kinds.includes(k) ? 'on' : ''}`} aria-pressed={kinds.includes(k)} onClick={() => toggle(k)}><i className={`nw-kd k-${k}`} aria-hidden="true" />{NEWS_LABEL[k]}</button>)}
        </div>
        {!shown.length ? <section className="card pad"><Empty>{kinds.length ? '고른 종류의 소식이 아직 없어요.' : '아직 소식이 없어요.'}</Empty></section> : <div className="nw-feed">
          {pinned.length > 0 && <div className="nw-day pin"><span>고정</span></div>}
          {pinned.map(card)}
          {days.map((d) => <div key={d.key} className="nw-group"><div className="nw-day"><span>{d.label}</span></div>{d.list.map(card)}</div>)}
        </div>}
      </div>
    </Swap>
  );
}

function NewsCard({ api, x, isNew, canWrite, onPatch, onChanged, onNewAugments }: { api: Api; x: NewsItem; isNew: boolean; canWrite: boolean; onPatch: (p: Partial<NewsItem>) => void; onChanged: () => void; onNewAugments?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(false);
  const [del, setDel] = useState(false);
  const [title, setTitle] = useState(x.title);
  const [body, setBody] = useState(x.body);
  const [err, setErr] = useState('');
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr('');
    try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const heart = () => {
    const was = x;
    onPatch({ mine: !x.mine, hearts: x.hearts + (x.mine ? -1 : 1) });
    api.post<{ hearts: number; mine: boolean }>(`/api/news/${x.id}/heart`, {}).then((r) => onPatch(r)).catch(() => onPatch({ mine: was.mine, hearts: was.hearts }));
  };
  const augs = x.kind === 'patch' && Array.isArray(x.data?.augments) ? (x.data!.augments as number[]).filter((id) => AUGMENT[id]) : [];
  return (
    <article className={`card nw-card k-${x.kind} ${x.pinned ? 'pinned' : ''} ${busy ? 'busy' : ''}`}>
      <div className="nw-top">
        <span className={`nw-tag k-${x.kind}`}>{NEWS_LABEL[x.kind]}</span>
        {x.pinned && <span className="nw-pin"><Icon name="pin" />고정</span>}
        {isNew && <span className="nw-new">NEW</span>}
        <span className="meta">{x.auto ? '자동 소식' : x.author ?? '운영진'} · {x.pinned ? `${shortDate(x.at)} ${clock(x.at)}` : clock(x.at)}{x.edited ? ' · 고침' : ''}</span>
        {canWrite && !edit && <span className="nw-tools">
          <button type="button" className="nw-ib" title={x.pinned ? '고정 풀기' : '맨 위에 고정'} aria-label={x.pinned ? '고정 풀기' : '맨 위에 고정'} disabled={busy} onClick={() => run(async () => { await api.post(`/api/news/${x.id}`, { pinned: !x.pinned }); onChanged(); })}><Icon name="pin" /></button>
          <button type="button" className="nw-ib" title="고치기" aria-label="고치기" disabled={busy} onClick={() => { setTitle(x.title); setBody(x.body); setEdit(true); }}><Icon name="edit" /></button>
          <button type="button" className={`nw-ib ${del ? 'warn' : ''}`} title={del ? '한 번 더 누르면 지워요' : '지우기'} aria-label="지우기" disabled={busy} onBlur={() => setDel(false)} onClick={() => (del ? run(async () => { await api.del(`/api/news/${x.id}`); onChanged(); }) : setDel(true))}><Icon name="trash" />{del && <span>지우기</span>}</button>
        </span>}
      </div>
      {edit ? <div className="nw-edit">
        <input className="input" value={title} maxLength={NEWS_MAX.title} aria-label="제목" onChange={(e) => setTitle(e.target.value)} />
        <textarea className="input nw-ta" value={body} maxLength={NEWS_MAX.body} rows={5} aria-label="내용" onChange={(e) => setBody(e.target.value)} />
        <div className="nw-act"><button type="button" className="btn sm" onClick={() => setEdit(false)}>그만두기</button><button type="button" className="btn sm primary" disabled={busy || title.trim().length < 2} onClick={() => run(async () => { await api.post(`/api/news/${x.id}`, { title, body }); setEdit(false); onChanged(); })}>저장</button></div>
      </div> : <>
        {x.kind === 'event' ? <div className="nw-hero"><h3>{x.title}</h3></div> : <h3 className="nw-title">{x.title}</h3>}
        {x.body && <p className="nw-body">{x.body}</p>}
        {augs.length > 0 && <div className="nw-augs">
          {augs.slice(0, 10).map((id) => <AugmentLink key={id} id={id} inline><AugRing id={id} size={36} /></AugmentLink>)}
          {augs.length > 10 && <span className="nw-more">+{augs.length - 10}</span>}
          {onNewAugments && <button type="button" className="btn sm nw-go" onClick={onNewAugments}>새로운 증강 보기<Icon name="chevR" /></button>}
        </div>}
      </>}
      {err && <p className="l nw-err">{err}</p>}
      {!edit && <div className="nw-foot"><HeartBurst on={x.mine} count={x.hearts} label={x.mine ? '하트 취소' : '하트'} size="sm" onToggle={heart} /></div>}
    </article>
  );
}

/** 운영진: 소식 쓰기 (평소에는 한 줄, 누르면 펼침) */
function Composer({ api, onDone }: { api: Api; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'notice' | 'event'>('notice');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pinned, setPinned] = useState(false);
  const [discord, setDiscord] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  if (!open) return <button type="button" className="card nw-open" onClick={() => { setOpen(true); setMsg(''); }}><Icon name="edit" /><span>새 소식 쓰기</span>{msg && <span className="nw-ok">{msg}</span>}</button>;
  const send = async () => {
    setBusy(true); setMsg('');
    try {
      const r = await api.post<{ posted: boolean }>('/api/news', { kind, title, body, pinned, discord });
      setTitle(''); setBody(''); setPinned(false); setOpen(false);
      setMsg(discord ? (r.posted ? '올렸어요 · 디스코드에도 올렸어요' : '올렸어요 · 디스코드에는 올리지 못했어요') : '올렸어요');
      onDone();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return (
    <section className="card pad nw-compose">
      <div className="nw-crow"><Seg value={kind} options={[['notice', '공지'], ['event', '이벤트']]} onChange={setKind} /><span className="meta">{title.length}/{NEWS_MAX.title}</span></div>
      <input className="input" value={title} maxLength={NEWS_MAX.title} placeholder={kind === 'event' ? '예: 11월 첫 주 내전 · 토요일 밤 10시' : '예: Prism 이용 수칙 안내'} aria-label="제목" onChange={(e) => setTitle(e.target.value)} />
      <textarea className="input nw-ta" value={body} maxLength={NEWS_MAX.body} rows={5} placeholder="내용 (줄바꿈 그대로 보여요)" aria-label="내용" onChange={(e) => setBody(e.target.value)} />
      <div className="nw-crow">
        <span className="nw-sw"><Toggle label="맨 위에 고정" on={pinned} onChange={setPinned} /><span>맨 위에 고정</span></span>
        <span className="nw-sw"><Toggle label="디스코드에도 올리기" on={discord} onChange={setDiscord} /><span>디스코드에도 올리기</span></span>
        <span className="nw-act"><button type="button" className="btn sm" onClick={() => setOpen(false)}>그만두기</button><button type="button" className="btn sm primary" disabled={busy || title.trim().length < 2} onClick={send}>{busy ? '올리는 중…' : '올리기'}</button></span>
      </div>
      {msg && <p className="l nw-err">{msg}</p>}
    </section>
  );
}

function NewsSkeleton() {
  return (
    <SkeletonFrame className="nw">
      <div className="nw-chips">{KINDS.map((k) => <span key={k} className="chip"><i className={`nw-kd k-${k}`} aria-hidden="true" />{NEWS_LABEL[k]}</span>)}</div>
      <div className="nw-feed">
        <div className="nw-group"><div className="nw-day"><Bone w={40} h={12} /></div>
          {[0, 1, 2].map((i) => <div key={i} className="card nw-card"><div className="nw-top"><Bone w={56} h={20} r="pill" /><Bone w={120} h={12} /></div><Bone w="60%" h={18} /><div className="nw-skb"><Bone w="96%" h={12} /><Bone w="72%" h={12} /></div><div className="nw-foot"><Bone w={56} h={28} r="pill" /></div></div>)}
        </div>
      </div>
    </SkeletonFrame>
  );
}
