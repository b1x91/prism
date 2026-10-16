import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AUGMENT, CHAMPIONS, ago, cdragon, pct, shortDate, type Api, type Board, type ChampionInfo, type Game, type Note, type DiscordNow, type Parties, type Party, type Prospects, type Scrim, type ScrimMember, type Scrims, shortNick } from '@prism/core';
import { AugImg, ChampImg, Empty, Gem, IconBtn, LockedMore, MemberFace } from './basics';
import { AugmentLink } from './augment';
import { Icon } from './icons';
import { BoardSkeleton, ChampionCrewSkeleton, Bone, imgIn, useReveal, Swap, fadeCls, SkeletonFrame } from './skeleton';

/** 서버 데이터 한 덩이 불러오기 (다시 불러오기 함수 포함) */
export function useLoad<T>(api: Api, path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    if (!path) return;
    api.get<T>(path).then((d) => { setData(d); setError(null); }).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [api, path]);
  useEffect(reload, [reload]);
  return { data, error, reload };
}

export function Notes({ api }: { api: Api }) {
  const { data, error, reload } = useLoad<{ notes: Note[]; max: number }>(api, '/api/notes');
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const max = data?.max ?? 60;
  const submit = async () => {
    if (!text.trim()) return;
    try { await api.post('/api/notes', { text }); setText(''); setMsg(''); reload(); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <section className="card pad">
      <div className="card-head"><h2>한 줄 생각</h2><span className="sp" /><span className="meta">오늘 판 한 줄, 아무 생각이나</span></div>
      <form className="composer" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <input className="input" value={text} maxLength={max} onChange={(e) => setText(e.target.value)} placeholder="한 줄 남기기" />
        <span className="meta num" style={{ minWidth: 44, textAlign: 'right' }}>{[...text].length}/{max}</span>
        <button className="btn primary" type="submit">남기기</button>
      </form>
      {msg && <p className="meta" style={{ color: 'var(--lose)' }}>{msg}</p>}
      <div className="list" style={{ marginTop: 12 }}>
        {error && <p className="meta">{error}</p>}
        {data?.notes.map((n) => (
          <div key={n.id} className="item">
            <MemberFace nick={n.nick} skin={n.skin} champion={n.main} size={28} />
            <div style={{ minWidth: 0 }}><b style={{ marginRight: 8 }}>{shortNick(n.nick)}</b>{n.text}</div>
            <span className="meta row" style={{ gap: 8 }}>{ago(n.createdAt)}{(n.canDelete ?? n.mine) ? <button type="button" className="btn ghost sm" onClick={async () => { await api.del(`/api/notes/${n.id}`).catch(() => {}); reload(); }}>지우기</button> : null}</span>
          </div>
        ))}
        {data && !data.notes.length && <Empty>첫 한 줄을 남겨보세요.</Empty>}
      </div>
    </section>
  );
}

const UNIT: Record<string, string> = { max_kills: '킬', dex_rank: '종', most_played_month: '판' };
export function BoardView({ api }: { api: Api }) {
  const { data: b, error } = useLoad<Board>(api, '/api/board');
  const rv = useReveal(Boolean(b));
  if (error) return <Empty>{error}</Empty>;
  if (!b) return <BoardSkeleton />;
  const t = b.totals;
  const value = (r: Board['records'][number]) => (r.key === 'longest_game' ? <>{Math.round(r.value / 60)}<small className="meta"> 분</small></> : r.key === 'best_winrate' ? pct(r.w ?? 0, r.n ?? 0) : <>{r.value}<small className="meta"> {UNIT[r.key] ?? ''}</small></>);
  return (<Swap on={rv} skeleton={<BoardSkeleton />}>
    <div className={`stack ${fadeCls(rv)}`}>
      <div className="grid4">
        {[['연결된 회원', t.linked, '명'], ['기록된 판', t.games, ''], ['이번 주 모임 판', t.crewGamesWeek, `/ ${t.crewGames}`], ['모임 도감', b.crewDex, '종']].map(([k, v, s]) => (
          <section key={k as string} className="card stat"><span className="k">{k}</span><span className="v">{v}<small>{s}</small></span></section>
        ))}
      </div>
      <section className="card pad">
        <div className="card-head"><h2>모임 기록</h2></div>
        <div className="grid3">
          {b.records.map((r) => (
            <div key={r.key} className="record">
              <span className="k">{r.nick && <Gem size={14} src="/brand/prism-32.png" />}{r.label}</span>
              {r.nick ? <><span className="v">{value(r)}</span><span className="s">{shortNick(r.nick)}{r.championId ? ` · ${CHAMPIONS[r.championId]?.name ?? ''}` : ''}{r.at ? ` · ${shortDate(r.at)}` : ''}</span></> : <span className="s">첫 기록을 기다리는 중입니다.</span>}
            </div>
          ))}
        </div>
      </section>
      <div className="grid2">
        <section className="card pad">
          <div className="card-head"><h2>같이 하면 이기는 사람</h2></div>
          {b.pairs.length ? <div className="list">{b.pairs.map((p) => (
            <div key={p.a + p.b} className="item"><span className="row pairfaces" style={{ gap: 0 }}><MemberFace nick={p.a} skin={p.sa} size={32} /><span style={{ marginLeft: -8 }}><MemberFace nick={p.b} skin={p.sb} size={32} /></span></span><span className="title">{p.a} + {p.b}</span><span><b>{pct(p.w, p.n)}</b> <span className="meta">{p.w}승 {p.n - p.w}패</span></span></div>
          ))}</div> : <Empty>같은 팀으로 3판 이상 한 회원이 아직 없습니다.</Empty>}
        </section>
        <section className="card pad">
          <div className="card-head"><h2>새 팁</h2></div>
          {b.newTips.length ? <div className="list">{b.newTips.map((tp) => (
            <div key={tp.id} className="item"><ChampImg id={tp.championId} size={32} /><div style={{ minWidth: 0 }}><div className="title" style={{ fontWeight: 500 }}>{tp.text}</div><div className="meta">{CHAMPIONS[tp.championId]?.name} · {shortNick(tp.nick)}</div></div><span className="meta">{shortDate(tp.createdAt)}</span></div>
          ))}</div> : <Empty>아직 팁이 없습니다.</Empty>}
        </section>
      </div>
      <section className="card pad">
        <div className="card-head"><h2>최근 모임 판</h2></div>
        {b.recent.length ? <div className="list">{b.recent.map((g, i) => (
          <div key={i} className="item" style={{ gridTemplateColumns: '72px minmax(0,1fr)' }}><span className="meta">{ago(g.at)}</span>
            <div className="row wrapr" style={{ gap: 8 }}>{g.crew.map((c, j) => <span key={j} className="pill"><ChampImg id={c.championId} size={18} /><b className={c.win ? 'w' : 'l'}>{shortNick(c.nick)}</b>{c.k}/{c.d}/{c.a}</span>)}</div></div>
        ))}</div> : <Empty>회원 두 명 이상이 함께한 판이 아직 없습니다.</Empty>}
      </section>
    </div>
  </Swap>);
}

/** 챔피언별 모임 기록 (모임 승률·장인·인기 증강·팁 쓰기와 공감) */
export function ChampionCrew({ api, championId }: { api: Api; championId: number }) {
  const { data, error, reload } = useLoad<ChampionInfo>(api, `/api/champions/${championId}`);
  const [text, setText] = useState('');
  const rv = useReveal(Boolean(data));
  if (error) return <Empty>{error}</Empty>;
  if (!data) return <ChampionCrewSkeleton />;
  return (<Swap on={rv} skeleton={<ChampionCrewSkeleton />}>
    <div className={`grid2 ${fadeCls(rv)}`}>
      <section className="card pad">
        <div className="card-head"><h2>모임 기록</h2></div>
        <div className="grid2" style={{ gap: 12 }}>
          <div className="record"><span className="k">모임 승률</span><span className="v">{pct(data.crew.w, data.crew.n)}</span><span className="s">{data.crew.n}판</span></div>
          <div className="record"><span className="k">내 승률</span><span className="v">{pct(data.me.w, data.me.n)}</span><span className="s">{data.me.n}판</span></div>
        </div>
        {data.topAugments.length > 0 && <><h3 style={{ fontSize: 14, margin: '20px 0 8px' }}>모임이 많이 고른 증강</h3><div className="list">{data.topAugments.map((a) => <AugmentLink key={a.id} id={a.id} champion={championId} className="item"><AugImg id={a.id} size={28} /><span className="title"><AugName id={a.id} /></span><span className="meta">{a.n}회 {pct(a.w, a.n)}</span></AugmentLink>)}</div></>}
      </section>
      <section className="card pad">
        <div className="card-head"><h2>회원 한 줄 팁</h2></div>
        <form className="composer" onSubmit={async (e) => { e.preventDefault(); if (!text.trim()) return; await api.post('/api/tips', { championId, text }).catch(() => {}); setText(''); reload(); }}>
          <input className="input" value={text} maxLength={80} onChange={(e) => setText(e.target.value)} placeholder={`${CHAMPIONS[championId]?.name ?? ''} 팁 남기기`} /><button className="btn primary" type="submit">남기기</button>
        </form>
        <div className="list" style={{ marginTop: 12 }}>
          {data.tips.map((t) => (
            <div key={t.id} className="item"><MemberFace nick={t.nick} skin={t.skin} champion={t.main} size={28} /><div style={{ minWidth: 0 }}><div>{t.text}</div><div className="meta">{t.nick} · {shortDate(t.createdAt)}</div></div>
              <span className="row" style={{ gap: 4 }}>
                <button type="button" className={`btn ghost sm ${t.liked ? 'l' : ''}`} onClick={async () => { await api.post(`/api/tips/${t.id}/like`).catch(() => {}); reload(); }}>♥ {t.likes}</button>
                {t.mine ? <button type="button" className="btn ghost sm" onClick={async () => { await api.del(`/api/tips/${t.id}`).catch(() => {}); reload(); }}>지우기</button> : null}
              </span></div>
          ))}
          {!data.tips.length && <Empty>첫 팁을 남겨보세요.</Empty>}
        </div>
      </section>
    </div>
  </Swap>);
}
function AugName({ id }: { id: number }) { return <>{AUGMENT[id]?.name ?? `#${id}`}</>; }

/** 최근 10판 (일러스트 카드) */
export function Recent10({ games, href }: { games: Game[]; href?: (championId: number) => string }) {
  const recent = games.slice(0, 10);
  if (!recent.length) return <Empty>아직 기록된 판이 없습니다. 첫 판이 끝나면 여기에 나타납니다.</Empty>;
  return (
    <div className="r10">
      {recent.map((g) => (
        <a key={g.gameId} className={g.win ? 'is-w' : 'is-l'} href={href?.(g.championId)} title={`${CHAMPIONS[g.championId]?.name} · ${g.kills}/${g.deaths}/${g.assists} · ${ago(g.playedAt)}`}>
          <img className="fi" {...imgIn} src={cdragon(CHAMPIONS[g.championId]?.tile)} alt="" loading="lazy" /><span className="res">{g.win ? '승' : '패'}</span>
        </a>
      ))}
    </div>
  );
}

// ───────── 같이 할 판 모집 (CLAUDE.md 9-3): 시간 + 한 줄 메모, 5자리, 원탭 참여 ─────────

const pad = (n: number) => String(n).padStart(2, '0');
const DAY = ['일', '월', '화', '수', '목', '금', '토'];
/** '오늘 22:00' · '내일 21:00' · '10/15(수) 21:00' */
export function partyTime(t: number, now = Date.now()) {
  const d = new Date(t), n = new Date(now);
  const day = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime()) / 864e5);
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return day === 0 ? `오늘 ${hm}` : day === 1 ? `내일 ${hm}` : `${d.getMonth() + 1}/${d.getDate()}(${DAY[d.getDay()]}) ${hm}`;
}
/** 상태 배지: 출발(5/5) · 지금 모이는 중 · N분 뒤 · N시간 뒤 */
function partyBadge(p: Party, size: number, now: number): [string, string] {
  if (p.members.length >= size) return ['출발', 'go'];
  const m = Math.round((p.startAt - now) / 60_000);
  if (m <= 0) return ['지금 모이는 중', 'now'];
  if (m < 60) return [`${m}분 뒤`, 'soon'];
  if (m < 24 * 60) return [`${Math.round(m / 60)}시간 뒤`, ''];
  return [`${Math.round(m / 1440)}일 뒤`, ''];
}
/** 빠른 시간: 지금 · 30분 뒤 · 21/22/23시 (지났으면 내일) */
function quickTimes(now: number): [string, number][] {
  const at = (h: number) => { const d = new Date(now); d.setHours(h, 0, 0, 0); if (d.getTime() < now - 5 * 60_000) d.setDate(d.getDate() + 1); return d.getTime(); };
  const half = Math.ceil((now + 30 * 60_000) / (10 * 60_000)) * 10 * 60_000;
  return [['지금', now], ['30분 뒤', half], ...[21, 22, 23].map((h) => [partyTime(at(h), now), at(h)] as [string, number])];
}

/** 다음 판 하나 (게임 화면 위쪽 같은 곳에 짧게) */
export function useParties(api: Api | null, every = 20_000) {
  const { data, error, reload } = useLoad<Parties>(api as Api, api ? '/api/parties' : null);
  useEffect(() => { if (!api) return; const t = setInterval(reload, every); return () => clearInterval(t); }, [api, reload, every]);
  return { data, error, reload };
}

/**
 * 함께 해요!: 같이 할 판 + 내전 + 남기고 싶은 말을 한 곳에서 (v3.23).
 * 여는 칸은 하나(5인 / 내전 / 한마디), 판은 시간순, 한마디는 그 아래 최근순.
 */
export function PartyBoard({ api, onMember }: { api: Api; onMember?: (id: string) => void }) {
  const { data, error, reload } = useParties(api);
  const scr = useLoad<Scrims>(api, '/api/scrims');
  useEffect(() => { const t = setInterval(scr.reload, 20_000); return () => clearInterval(t); }, [scr.reload]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const notes = useLoad<{ notes: Note[]; max: number }>(api, '/api/notes');
  const [kind, setKind] = useState<Kind>('party');
  const run = async (key: string, f: () => Promise<unknown>) => { setBusy(key); setMsg(''); try { await f(); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); reload(); scr.reload(); notes.reload(); } };
  const size = data?.size ?? 5, now = data?.now ?? Date.now();
  const canHost = Boolean(scr.data?.canHost);
  const list = [
    ...(data?.parties ?? []).map((p) => ({ at: p.startAt, key: `p${p.id}`, el: <PartyCard key={`p${p.id}`} p={p} size={size} now={now} busy={busy} run={run} api={api} onMember={onMember} /> })),
    ...(scr.data?.scrims ?? []).map((x) => ({ at: x.startAt, key: `s${x.id}`, el: <ScrimCard key={`s${x.id}`} s={x} size={scr.data!.size} now={scr.data!.now} busy={busy} run={run} api={api} onMember={onMember} /> })),
  ].sort((a, b) => a.at - b.at);
  const loaded = Boolean(data && scr.data);
  return (
    <section className="card pad parties">
      <div className="card-head"><h2>함께 해요!</h2><span className="sp" /><span className="meta">디스코드·카카오톡 알림봇을 준비하고 있어요</span></div>
      <PartyComposer busy={busy === 'new'} kind={kind} onKind={setKind} canScrim={canHost} noteMax={notes.data?.max ?? 60}
        onOpen={(startAt, note) => run('new', () => kind === 'note' ? api.post('/api/notes', { text: note }) : api.post(kind === 'scrim' ? '/api/scrims' : '/api/parties', { startAt, note }))} />
      {msg && <p className="l" style={{ margin: 0 }}>{msg}</p>}
      {(error || scr.error) && <p className="meta">{error || scr.error}</p>}
      <div className="plist">
        {list.map((x) => x.el)}
        {loaded && !list.length && !notes.data?.notes.length && <Empty>아직 아무도 없어요. 같이 할 판을 열거나 한마디 남겨 보세요.</Empty>}
      </div>
      {(notes.data?.notes.length ?? 0) > 0 && <div className="pnotes">
        {notes.data!.notes.map((n) => (
          <div key={n.id} className="pnote-row">
            <MemberFace nick={n.nick} skin={n.skin} champion={n.main} size={28} />
            <span className="pn-t"><b>{shortNick(n.nick)}</b>{n.text}</span>
            <span className="meta pn-at">{ago(n.createdAt)}</span>
            {(n.canDelete ?? n.mine) ? <IconBtn icon="trash" tone="danger" label="지우기" onClick={() => run(`n${n.id}`, () => api.del(`/api/notes/${n.id}`))} /> : <span />}
          </div>
        ))}
      </div>}
    </section>
  );
}

function PartyCard({ p, size, now, busy, run, api, onMember }: { p: Party; size: number; now: number; busy: string | null; run: (k: string, f: () => Promise<unknown>) => void; api: Api; onMember?: (id: string) => void }) {
  const [label, tone] = partyBadge(p, size, now);
  const full = p.members.length >= size;
  const host = p.members.find((m) => m.id === p.hostId) ?? p.members[0];
  const k = `p${p.id}`;
  return (
    <article className={`pcard ${tone} ${p.mine ? 'mine' : ''}`}>
      <div className="ptime"><b>{partyTime(p.startAt, now).split(' ')[1]}</b><span>{partyTime(p.startAt, now).split(' ')[0]}</span></div>
      <div className="pmain">
        <div className="phead"><span className="pkind">5인</span><span className={`pbadge ${tone}`}>{label}</span><span className="pcount"><b>{p.members.length}</b>/{size}</span>
          {host && <span className="phost meta">{shortNick(host.nick)} 님이 열었어요</span>}</div>
        {p.note && <p className="pnote">{p.note}</p>}
        <div className="pslots">{Array.from({ length: size }, (_, i) => {
          const m = p.members[i];
          return m
            ? <button key={m.id} type="button" className="pslot on" onClick={() => onMember?.(m.id)} title={m.nick}><MemberFace nick={m.nick} skin={m.skin} champion={m.main} size={44} /><span>{m.nick}</span>{m.id === p.hostId && <i className="crown">방장</i>}</button>
            : <span key={`e${i}`} className="pslot"><span className="ph">?</span><span>빈 자리</span></span>;
        })}</div>
      </div>
      <div className="pact">
        {p.mine
          ? <button type="button" className="btn" disabled={busy === k} onClick={() => run(k, () => api.post(`/api/parties/${p.id}/leave`, {}))}>빠지기</button>
          : <button type="button" className={`btn ${full ? '' : 'primary'}`} disabled={full || busy === k} onClick={() => run(k, () => api.post(`/api/parties/${p.id}/join`, {}))}>{full ? '다 찼어요' : '참여'}</button>}
        {p.host && <button type="button" className="linkbtn meta" disabled={busy === k} onClick={() => run(k, () => api.post(`/api/parties/${p.id}/cancel`, {}))}>판 취소</button>}
      </div>
    </article>
  );
}

type Kind = 'party' | 'scrim' | 'note';
function PartyComposer({ busy, onOpen, kind, onKind, canScrim, noteMax }: { busy: boolean; onOpen: (startAt: number, note: string) => void; kind: Kind; onKind: (k: Kind) => void; canScrim: boolean; noteMax: number }) {
  const placeholder = kind === 'note' ? '하고 싶은 말을 남겨 보세요' : kind === 'scrim' ? '한 줄 메모 (선택) 예: 단판, 디코 내전방' : '한 줄 메모 (선택) 예: 디코 음성방에서 만나요';
  const [now] = useState(() => Date.now());
  const quick = useMemo(() => quickTimes(now), [now]);
  const [at, setAt] = useState<number>(quick[3][1]);
  const [custom, setCustom] = useState('');
  const [note, setNote] = useState('');
  // 직접 고른 시각: 지났으면 내일
  const fromCustom = (v: string) => { const [h, m] = v.split(':').map(Number); const d = new Date(); d.setHours(h, m, 0, 0); if (d.getTime() < Date.now() - 5 * 60_000) d.setDate(d.getDate() + 1); return d.getTime(); };
  return (
    <form className="pcompose" onSubmit={(e) => { e.preventDefault(); if (kind === 'note' && !note.trim()) return; onOpen(custom ? fromCustom(custom) : at, note); setNote(''); }}>
      <div className="ptimes">
        <span className="pkinds" role="radiogroup" aria-label="종류">
          <button type="button" role="radio" aria-checked={kind === 'party'} className={`chip ${kind === 'party' ? 'on' : ''}`} onClick={() => onKind('party')}>5인 같이 하기</button>
          <button type="button" role="radio" aria-checked={kind === 'scrim'} className={`chip ${kind === 'scrim' ? 'on' : ''}`} disabled={!canScrim} title={canScrim ? '우리끼리 5:5' : '내전은 우수회원 이상이 열 수 있어요. 열린 내전에는 누구나 참여할 수 있어요.'} onClick={() => onKind('scrim')}>내전 5:5</button>
          <button type="button" role="radio" aria-checked={kind === 'note'} className={`chip ${kind === 'note' ? 'on' : ''}`} onClick={() => onKind('note')}>한마디</button>
        </span>
        {kind !== 'note' && <>{quick.map(([l, t]) => <button key={l} type="button" className={`chip ${!custom && at === t ? 'on' : ''}`} onClick={() => { setAt(t); setCustom(''); }}>{l}</button>)}
        <label className={`chip time ${custom ? 'on' : ''}`}>직접<input type="time" value={custom} onChange={(e) => setCustom(e.target.value)} /></label></>}
      </div>
      <div className="prow">
        <input className="input" value={note} maxLength={kind === 'note' ? noteMax : 40} onChange={(e) => setNote(e.target.value)} placeholder={placeholder} />
        <button type="submit" className="btn primary" disabled={busy || (kind === 'note' && !note.trim())}>{busy ? '등록 중…' : '등록'}</button>
      </div>
    </form>
  );
}

// ───────── 내전 (우리끼리 5:5): 10자리, 팀 나누기, 결과는 기록된 사용자 설정 판에서 자동으로 ─────────

const TEAM = { 1: '블루팀', 2: '레드팀' } as const;
const avg = (ms: ScrimMember[]) => (ms.length ? ms.reduce((s, m) => s + m.rating, 0) / ms.length : 0);

function ScrimCard({ s, size, now, busy, run, api, onMember }: { s: Scrim; size: number; now: number; busy: string | null; run: (k: string, f: () => Promise<unknown>) => void; api: Api; onMember?: (id: string) => void }) {
  const [pick, setPick] = useState<string | null>(null);
  const k = (x: string) => `${s.id}:${x}`;
  const act = (x: string, body: object = {}) => run(k(x), () => api.post(`/api/scrims/${s.id}/${x}`, body));
  const split = s.members.some((m) => m.team);
  const teams = { 1: s.members.filter((m) => m.team === 1), 2: s.members.filter((m) => m.team === 2) };
  const score = { 1: s.results.filter((r) => r.winner === 1).length, 2: s.results.filter((r) => r.winner === 2).length };
  const canSwap = s.host && split && !s.lockedAt;
  const onFace = (m: ScrimMember) => {
    if (!canSwap) return onMember?.(m.id);
    if (!pick) return setPick(m.id);
    if (pick === m.id) return setPick(null);
    const other = s.members.find((x) => x.id === pick);
    setPick(null);
    if (other && other.team !== m.team) act('swap', { a: pick, b: m.id });
  };
  const Face = ({ m }: { m: ScrimMember }) => (
    <button type="button" className={`sface ${pick === m.id ? 'picked' : ''}`} onClick={() => onFace(m)} title={canSwap ? '눌러서 다른 팀 사람과 바꾸기' : m.nick}>
      <MemberFace nick={m.nick} skin={m.skin} champion={m.main} size={40} />
      <span className="nm">{shortNick(m.nick)}{m.id === s.hostId && <i>방장</i>}</span>
      <span className="rt">{m.n ? `${pct(m.w, m.n)} · ${m.n}판` : '기록 없음'}</span>
    </button>
  );
  const state = s.results.length ? '경기 기록됨' : s.lockedAt ? '팀 확정' : s.confirmedAt ? '개최 확정' : split ? '팀 나눔' : '모집 중';
  const full = s.members.length >= size;
  return (
    <article className={`scard ${s.mine ? 'mine' : ''} ${s.lockedAt ? 'locked' : ''}`}>
      <div className="shead">
        <div className="ptime"><b>{partyTime(s.startAt, now).split(' ')[1]}</b><span>{partyTime(s.startAt, now).split(' ')[0]}</span></div>
        <div className="pmain">
          <div className="phead"><span className="pkind scrim">내전</span><span className={`pbadge ${s.confirmedAt || s.lockedAt || s.results.length ? 'go' : ''}`}>{state}</span><span className="pcount"><b>{s.members.length}</b>/{size}{s.waiting.length > 0 && <span className="meta"> · 대기 {s.waiting.length}</span>}</span></div>
          {s.note && <p className="pnote">{s.note}</p>}
        </div>
        <div className="pact">
          {!s.lockedAt && (s.mine
            ? s.hostId !== undefined && !s.host && <button type="button" className="btn" disabled={busy === k('leave')} onClick={() => act('leave')}>빠지기</button>
            : <button type="button" className={`btn ${full ? '' : 'primary'}`} disabled={busy === k('join')} onClick={() => act('join')}>{full ? '대기 신청' : '참여'}</button>)}
        </div>
      </div>
      {s.results.length > 0 && <div className="sscore">
        <span className="t1">블루 <b>{score[1]}</b></span><span className="vs">:</span><span className="t2"><b>{score[2]}</b> 레드</span>
        <span className="games">{s.results.map((r, i) => <span key={r.gameId} className={`g t${r.winner}`}>{i + 1}판 {TEAM[r.winner]} 승 · {Math.round(r.duration / 60)}분</span>)}</span>
      </div>}
      {split ? <div className="steams">{([1, 2] as const).map((t) => (
        <div key={t} className={`steam t${t} ${s.results.length && score[t] > score[(3 - t) as 1 | 2] ? 'won' : ''}`}>
          <div className="sth"><b>{TEAM[t]}</b><span className="meta">평균 {Math.round(avg(teams[t]) * 100)}%</span></div>
          <div className="sfaces">{teams[t].map((m) => <Face key={m.id} m={m} />)}</div>
        </div>))}</div>
        : <div className="sfaces grid">{Array.from({ length: size }, (_, i) => s.members[i] ? <Face key={s.members[i].id} m={s.members[i]} /> : <span key={`e${i}`} className="sface empty"><span className="ph">?</span><span className="nm">빈 자리</span></span>)}</div>}
      {s.waiting.length > 0 && <div className="swait"><span className="meta">대기</span>{s.waiting.map((w, i) => <span key={w.id} className="wchip"><b>{i + 1}</b><MemberFace nick={w.nick} skin={w.skin} champion={w.main} size={20} />{w.nick}</span>)}<span className="meta">· 참가자가 빠지면 1번부터 자동으로 들어가요</span></div>}
      {s.host && <div className="shost">
        {!s.confirmedAt ? <button type="button" className="btn sm primary" disabled={!full || busy === k('confirm')} title={full ? '' : `${size}명이 모이면 누를 수 있어요`} onClick={() => act('confirm')}>개최 확정</button>
          : <button type="button" className="btn sm" disabled={busy === k('unconfirm')} onClick={() => act('unconfirm')}>개최 확정 취소</button>}
        {!s.lockedAt && <button type="button" className="btn sm" disabled={busy === k('balance')} onClick={() => act('balance')}>{split ? '다시 나누기' : '팀 자동 나누기'}</button>}
        {split && !s.lockedAt && <button type="button" className="btn sm" disabled={busy === k('lock')} onClick={() => act('lock')}>팀 확정</button>}
        {s.lockedAt && <button type="button" className="btn sm" disabled={busy === k('unlock')} onClick={() => act('unlock')}>팀 다시 풀기</button>}
        {canSwap && <span className="meta">{pick ? '바꿀 상대 팀 사람을 누르세요' : '두 사람을 차례로 누르면 팀을 바꿔요'}</span>}
        <span className="sp" />
        <button type="button" className="linkbtn meta" disabled={busy === k('cancel')} onClick={() => act('cancel')}>내전 취소</button>
      </div>}
    </article>
  );
}

// ───────── 포텐 멤버: 같이 여러 판 했거나 내전·사용자 설정 판을 함께한 비회원 (회원 전용) ─────────

export function ProspectBoard({ api, invite, admin }: { api: Api; invite?: string | null; admin?: boolean }) {
  const { data, error, reload } = useLoad<Prospects>(api, '/api/prospects');
  const [copied, setCopied] = useState<string | null>(null);
  const [del, setDel] = useState<string | null>(null);
  const copy = async (puuid: string) => {
    if (!invite) return;
    try { await navigator.clipboard.writeText(invite); setCopied(puuid); setTimeout(() => setCopied(null), 2000); } catch { /* 클립보드 막힘 */ }
  };
  const rv = useReveal(Boolean(data));
  if (error) return null;
  const prospectSk = <SkeletonFrame className="plist2">{[0, 1, 2].map((i) => <div key={i} className="prow2"><Bone w={44} h={44} r="round" /><span className="sk-row-t"><Bone w="40%" h={14} /><Bone w="72%" h={10} /></span><Bone w={64} h={32} r="m" /></div>)}</SkeletonFrame>;
  return (
    <section className="card pad prospects">
      <div className="card-head"><h2>포텐 멤버</h2><span className="sp" /><span className="meta">우리와 {data?.queueMin ?? 3}판 넘게 같이 했거나 내전을 함께한 분들</span></div>
      {!data ? prospectSk : !data.prospects.length ? <Empty>아직 없어요. 회원과 자주 같이 하는 분이 생기면 여기에 나타나요.</Empty> : (<Swap on={rv} skeleton={prospectSk}>
        <div className={`plist2 ${fadeCls(rv)}`}>{data.prospects.map((p) => {
          const [name, tag] = (p.riotId ?? '이름 모름').split('#');
          return (
            <div key={p.puuid} className="prow2">
              {p.main ? <img className="face fi" {...imgIn} src={cdragon(CHAMPIONS[p.main]?.tile)} width={44} height={44} alt="" loading="lazy" /> : <span className="face ph" />}
              <div className="pinfo">
                <div className="pname"><b>{name}</b>{tag && <span className="meta">#{tag}</span>}{p.customs > 0 && <span className="ptag">내전 {p.customs}</span>}</div>
                <div className="meta">같이 {p.n}판 · 그 판 승률 {pct(p.w, p.n)}{p.mates.length > 0 && <> · {p.mates.map((m) => `${shortNick(m.nick)} ${m.n}판`).join(', ')}</>} · {ago(p.lastAt)}</div>
              </div>
              <div className="pbtns">
                {invite && <IconBtn icon="link" label={copied === p.puuid ? '복사했어요' : '초대 링크 복사'} done={copied === p.puuid} onClick={() => copy(p.puuid)} />}
                {admin && <IconBtn icon="trash" tone="danger" done={false} label={del === p.puuid ? '한 번 더 누르면 지워요' : '이 분의 기록 지우기'} onClick={async () => {
                  // 실수로 지우지 않게 두 번 눌러야 지운다
                  if (del !== p.puuid) { setDel(p.puuid); setTimeout(() => setDel((x) => (x === p.puuid ? null : x)), 3000); return; }
                  setDel(null); await api.del(`/api/prospects/${p.puuid}`).catch(() => {}); reload();
                }} armed={del === p.puuid} />}
              </div>
            </div>
          );
        })}</div>
      </Swap>)}
      {data?.limited && <LockedMore more={data.limited.total - data.prospects.length} what="전체 목록" />}
    </section>
  );
}

// ───────── 지금 디스코드: 음성 채널에 누가 있는지 (서버 위젯) ─────────

/** 접속 중인 사람: 얼굴 몇 개만 겹쳐 보이고, 누르면 디스코드 열기 + 전체 목록 */
function OnlinePeek({ data }: { data: Extract<DiscordNow, { enabled: true }> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    addEventListener('mousedown', off); addEventListener('keydown', esc);
    return () => { removeEventListener('mousedown', off); removeEventListener('keydown', esc); };
  }, [open]);
  // 겹쳐 보일 얼굴: Prism 회원 먼저
  const peek = [...data.members].sort((a, b) => Number(Boolean(b.memberId)) - Number(Boolean(a.memberId))).slice(0, 5);
  const groups: [string, typeof data.members][] = [['Prism 회원', data.members.filter((m) => m.memberId)], ['그 외', data.members.filter((m) => !m.memberId)]];
  return (
    <div className="dn-peek" ref={ref}>
      <button type="button" className={`dn-who ${open ? 'on' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open} aria-label={`접속 중 ${data.online}명`}>
        <span className="dn-stack">{peek.map((m) => <span key={m.name} className="dn-f"><MemberFace nick={m.name} skin={m.skin} champion={m.main} size={28} /></span>)}</span>
        <span className="dn-n"><i className="dot" />{data.online}</span>
      </button>
      {open && <div className="dn-pop" role="dialog" aria-label="지금 디스코드에 접속 중인 사람">
        <div className="dn-pop-h">
          <span className="dn-cnt"><i className="dot" />온라인 <b>{data.online}</b></span>
          {data.inVoice > 0 && <span className="dn-cnt voice">음성 <b>{data.inVoice}</b></span>}
        </div>
        {groups.map(([label, list]) => list.length > 0 && <div key={label} className="dn-group">
          <span className="dn-gl">{label} <small>{list.length}</small></span>
          <div className="dn-list">{list.map((m) => (
            <span key={m.name} className={`dn-m ${m.status}`} title={m.name}>
              <span className="op"><MemberFace nick={m.name} skin={m.skin} champion={m.main} size={24} /><i /></span>
              <span className="on">{m.name}</span>
            </span>
          ))}</div>
        </div>)}
        {data.online > data.members.length && <span className="dn-more">외 {data.online - data.members.length}명</span>}
      </div>}
    </div>
  );
}

export function DiscordNowCard({ api, onOpen, admin }: { api: Api; onOpen?: (url: string) => void; admin?: boolean }) {
  const { data: got, reload } = useLoad<DiscordNow>(api, '/api/discord/now');
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => { const t = setInterval(reload, 30_000); return () => clearInterval(t); }, [reload]);
  // 디스코드가 잠깐 답하지 않으면(unavailable) 이전 내용을 그대로 둔다
  const last = useRef<DiscordNow | null>(null);
  if (got && !(got as { unavailable?: boolean }).unavailable) last.current = got;
  const data = last.current;
  // 아직 못 받았으면(디스코드가 늦거나 잠깐 실패) 자리를 잡아 두고 수집 중이라고 알린다 — 사라지지 않게
  if (!data) return (
    <section className="card pad dnow loading" aria-busy="true">
      <div className="card-head"><h2>지금 디스코드</h2><span className="sp" /><span className="dn-collect"><i className="dn-spin" aria-hidden="true" />정보를 수집하고 있습니다</span></div>
      <div className="vchans">{[0, 1, 2].map((i) => <div key={i} className="vchan sk-chan"><i className="sk ln t" /><i className="sk ln s" /><span className="vact"><i className="sk sq32" /><i className="sk sq32" /></span></div>)}</div>
    </section>
  );
  const copy = async (id: string, link: string) => {
    try { await navigator.clipboard.writeText(link); setCopied(id); setTimeout(() => setCopied((x) => (x === id ? null : x)), 2000); } catch { /* 클립보드 막힘 */ }
  };
  const open = (u: string | null) => { if (!u) return; if (onOpen) onOpen(u); else window.open(u, '_blank', 'noopener'); };
  if (!data.enabled) return admin ? <section className="card pad dnow off"><b>지금 디스코드</b><span className="meta">디스코드 서버 설정에서 '서버 위젯'을 켜면 음성방에 누가 있는지 여기에 떠요.</span></section> : null;
  return (
    <section className="card pad dnow">
      <div className="card-head"><h2>지금 디스코드</h2><span className="sp" />
        <OnlinePeek data={data} /></div>
      <div className="vchans">{data.channels.map((c) => (
        <div key={c.id} className={`vchan ${c.members.length ? 'live' : ''}`}>
          <div className="vh"><span className="vi" aria-hidden="true">🔊</span><b>{c.name}</b><span className="meta">{c.members.length ? `${c.members.length}명` : '비어 있음'}</span></div>
          {c.members.length > 0 && <div className="vmembers">{c.members.map((m) => (
            <span key={m.name} className="vm" title={m.name}>
              <MemberFace nick={m.name} skin={m.skin} champion={m.main} size={28} />
              <span>{m.name}</span>{(m.muted || m.deaf) && <i className="vmute">{m.deaf ? '소리 끔' : '마이크 끔'}</i>}
            </span>
          ))}</div>}
          <span className="vact">
            {c.invite && <IconBtn icon="link" label={copied === c.id ? '복사했어요' : '초대 링크 복사 (누구나 들어올 수 있어요)'} done={copied === c.id} onClick={() => copy(c.id, c.invite!)} />}
            <IconBtn icon="login" tone="go" label="디스코드에서 이 채널 들어가기" onClick={() => open(c.link)} />
          </span>
        </div>
      ))}</div>
    </section>
  );
}
