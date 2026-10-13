import { useCallback, useEffect, useMemo, useState } from 'react';
import { AUGMENT, CHAMPIONS, ago, cdragon, pct, shortDate, type Api, type Board, type ChampionInfo, type Game, type Note, type Parties, type Party } from '@prism/core';
import { AugImg, ChampImg, Empty, Gem, MemberFace } from './basics';

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
            <div style={{ minWidth: 0 }}><b style={{ marginRight: 8 }}>{n.nick}</b>{n.text}</div>
            <span className="meta row" style={{ gap: 8 }}>{ago(n.createdAt)}{n.mine ? <button type="button" className="btn ghost sm" onClick={async () => { await api.del(`/api/notes/${n.id}`).catch(() => {}); reload(); }}>지우기</button> : null}</span>
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
  if (error) return <Empty>{error}</Empty>;
  if (!b) return <p className="meta">불러오는 중…</p>;
  const t = b.totals;
  const value = (r: Board['records'][number]) => (r.key === 'longest_game' ? <>{Math.round(r.value / 60)}<small className="meta"> 분</small></> : r.key === 'best_winrate' ? pct(r.w ?? 0, r.n ?? 0) : <>{r.value}<small className="meta"> {UNIT[r.key] ?? ''}</small></>);
  return (
    <div className="stack">
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
              {r.nick ? <><span className="v">{value(r)}</span><span className="s">{r.nick}{r.championId ? ` · ${CHAMPIONS[r.championId]?.name ?? ''}` : ''}{r.at ? ` · ${shortDate(r.at)}` : ''}</span></> : <span className="s">첫 기록을 기다리는 중입니다.</span>}
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
            <div key={tp.id} className="item"><ChampImg id={tp.championId} size={32} /><div style={{ minWidth: 0 }}><div className="title" style={{ fontWeight: 500 }}>{tp.text}</div><div className="meta">{CHAMPIONS[tp.championId]?.name} · {tp.nick}</div></div><span className="meta">{shortDate(tp.createdAt)}</span></div>
          ))}</div> : <Empty>아직 팁이 없습니다.</Empty>}
        </section>
      </div>
      <section className="card pad">
        <div className="card-head"><h2>최근 모임 판</h2></div>
        {b.recent.length ? <div className="list">{b.recent.map((g, i) => (
          <div key={i} className="item" style={{ gridTemplateColumns: '72px minmax(0,1fr)' }}><span className="meta">{ago(g.at)}</span>
            <div className="row wrapr" style={{ gap: 8 }}>{g.crew.map((c, j) => <span key={j} className="pill"><ChampImg id={c.championId} size={18} /><b className={c.win ? 'w' : 'l'}>{c.nick}</b>{c.k}/{c.d}/{c.a}</span>)}</div></div>
        ))}</div> : <Empty>회원 두 명 이상이 함께한 판이 아직 없습니다.</Empty>}
      </section>
    </div>
  );
}

/** 챔피언별 모임 기록 (모임 승률·장인·인기 증강·팁 쓰기와 공감) */
export function ChampionCrew({ api, championId }: { api: Api; championId: number }) {
  const { data, error, reload } = useLoad<ChampionInfo>(api, `/api/champions/${championId}`);
  const [text, setText] = useState('');
  if (error) return <Empty>{error}</Empty>;
  if (!data) return <p className="meta">불러오는 중…</p>;
  return (
    <div className="grid2">
      <section className="card pad">
        <div className="card-head"><h2>모임 기록</h2></div>
        <div className="grid2" style={{ gap: 12 }}>
          <div className="record"><span className="k">모임 승률</span><span className="v">{pct(data.crew.w, data.crew.n)}</span><span className="s">{data.crew.n}판</span></div>
          <div className="record"><span className="k">내 승률</span><span className="v">{pct(data.me.w, data.me.n)}</span><span className="s">{data.me.n}판</span></div>
        </div>
        {data.masters.length > 0 && <><h3 style={{ fontSize: 14, margin: '20px 0 8px' }}>장인</h3><div className="list">{data.masters.map((m) => <div key={m.id} className="item"><MemberFace nick={m.nick} skin={m.skin} champion={m.main} size={32} /><span className="title">{m.nick}</span><span className="meta">{m.n}판 {pct(m.w, m.n)}</span></div>)}</div></>}
        {data.topAugments.length > 0 && <><h3 style={{ fontSize: 14, margin: '20px 0 8px' }}>모임이 많이 고른 증강</h3><div className="list">{data.topAugments.map((a) => <div key={a.id} className="item"><AugImg id={a.id} size={28} /><span className="title">{/* 이름은 데이터에서 */}<AugName id={a.id} /></span><span className="meta">{a.n}회 {pct(a.w, a.n)}</span></div>)}</div></>}
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
  );
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
          <img src={cdragon(CHAMPIONS[g.championId]?.tile)} alt="" loading="lazy" /><span className="res">{g.win ? '승' : '패'}</span>
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

export function PartyBoard({ api, onMember }: { api: Api; onMember?: (id: string) => void }) {
  const { data, error, reload } = useParties(api);
  const [busy, setBusy] = useState<number | 'new' | null>(null);
  const [msg, setMsg] = useState('');
  const run = async (key: number | 'new', f: () => Promise<unknown>) => { setBusy(key); setMsg(''); try { await f(); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); reload(); } };
  const size = data?.size ?? 5, now = data?.now ?? Date.now();
  return (
    <section className="card pad parties">
      <div className="card-head"><h2>같이 할 판</h2><span className="sp" /><span className="meta">시간을 정해 열면 회원들이 자리를 채워요</span></div>
      <PartyComposer busy={busy === 'new'} onOpen={(startAt, note) => run('new', () => api.post('/api/parties', { startAt, note }))} />
      {msg && <p className="l" style={{ margin: 0 }}>{msg}</p>}
      {error && <p className="meta">{error}</p>}
      <div className="plist">
        {data?.parties.map((p) => {
          const [label, tone] = partyBadge(p, size, now);
          const full = p.members.length >= size;
          const host = p.members.find((m) => m.id === p.hostId) ?? p.members[0];
          return (
            <article key={p.id} className={`pcard ${tone} ${p.mine ? 'mine' : ''}`}>
              <div className="ptime"><b>{partyTime(p.startAt, now).split(' ')[1]}</b><span>{partyTime(p.startAt, now).split(' ')[0]}</span></div>
              <div className="pmain">
                <div className="phead"><span className={`pbadge ${tone}`}>{label}</span><span className="pcount"><b>{p.members.length}</b>/{size}</span>
                  {host && <span className="phost meta">{host.nick} 님이 열었어요</span>}</div>
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
                  ? <button type="button" className="btn" disabled={busy === p.id} onClick={() => run(p.id, () => api.post(`/api/parties/${p.id}/leave`, {}))}>빠지기</button>
                  : <button type="button" className={`btn ${full ? '' : 'primary'}`} disabled={full || busy === p.id} onClick={() => run(p.id, () => api.post(`/api/parties/${p.id}/join`, {}))}>{full ? '다 찼어요' : '참여'}</button>}
                {p.host && <button type="button" className="linkbtn meta" disabled={busy === p.id} onClick={() => run(p.id, () => api.post(`/api/parties/${p.id}/cancel`, {}))}>판 취소</button>}
              </div>
            </article>
          );
        })}
        {data && !data.parties.length && <Empty>아직 열린 판이 없어요. 위에서 시간을 골라 먼저 열어보세요.</Empty>}
      </div>
    </section>
  );
}

function PartyComposer({ busy, onOpen }: { busy: boolean; onOpen: (startAt: number, note: string) => void }) {
  const [now] = useState(() => Date.now());
  const quick = useMemo(() => quickTimes(now), [now]);
  const [at, setAt] = useState<number>(quick[3][1]);
  const [custom, setCustom] = useState('');
  const [note, setNote] = useState('');
  // 직접 고른 시각: 지났으면 내일
  const fromCustom = (v: string) => { const [h, m] = v.split(':').map(Number); const d = new Date(); d.setHours(h, m, 0, 0); if (d.getTime() < Date.now() - 5 * 60_000) d.setDate(d.getDate() + 1); return d.getTime(); };
  return (
    <form className="pcompose" onSubmit={(e) => { e.preventDefault(); onOpen(custom ? fromCustom(custom) : at, note); setNote(''); }}>
      <div className="ptimes">
        {quick.map(([l, t]) => <button key={l} type="button" className={`chip ${!custom && at === t ? 'on' : ''}`} onClick={() => { setAt(t); setCustom(''); }}>{l}</button>)}
        <label className={`chip time ${custom ? 'on' : ''}`}>직접<input type="time" value={custom} onChange={(e) => setCustom(e.target.value)} /></label>
      </div>
      <div className="prow">
        <input className="input" value={note} maxLength={40} onChange={(e) => setNote(e.target.value)} placeholder="한 줄 메모 (선택) 예: 디코 음성방에서 만나요" />
        <button type="submit" className="btn primary" disabled={busy}>{busy ? '여는 중…' : `${partyTime(custom ? fromCustom(custom) : at, Date.now())} 판 열기`}</button>
      </div>
    </form>
  );
}
