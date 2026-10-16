/**
 * 미션 화면 (CLAUDE.md v3.27 · v3.38). 웹·앱 공용.
 * 이번 주 미션 3개 · 처음 해 볼 챔프 한 줄 · 역할(분포 + 개척).
 * 깬 미션은 '받기'를 눌러야 피스가 들어온다 — 버튼에서 금빛 조각이 터져 보유 피스로 날아가고, 숫자가 차오른다.
 */
import { useRef, useState } from 'react';
import { CHAMPIONS, MISSION_ROLE_KO, PIECE, cdragon, type Api, type Mission, type MissionState } from '@prism/core';
import { Empty } from './basics';
import { useLoad } from './crew';
import { Icon } from './icons';
import { PieceIcon, addPieces } from './shop';
import { MissionsSkeleton, imgIn, useReveal, Swap, fadeCls } from './skeleton';

const DAY = 86_400_000;
const left = (end: number, now = Date.now()) => { const d = Math.ceil((end - now) / DAY); return d <= 1 ? '오늘 밤까지' : `${d}일 남음`; };
const md = (t: number) => { const d = new Date(t + 9 * 3_600_000); return `${d.getUTCMonth() + 1}.${d.getUTCDate()}`; };
/** 주마다 같은 순서로 섞기 (주 안에서는 그대로) */
const shuffle = (ids: number[], seed: number) => [...ids].sort((a, b) => ((a * 9301 + seed) % 233280) - ((b * 9301 + seed) % 233280));
const ROLE_C: Record<string, string> = { marksman: 'var(--spectrum-1)', fighter: 'var(--spectrum-2)', tank: 'var(--spectrum-4)', support: 'var(--spectrum-5)', mage: 'var(--spectrum-6)', assassin: 'var(--spectrum-7)' };
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

type ClaimRes = { gained: number; ids: string[]; state: MissionState };

/** 받기: 버튼에서 조각이 터져 보유 피스(사이드바·상단)로 날아간다 */
function flyPieces(from: DOMRect, count: number) {
  if (reduced()) return 0;
  const target = [...document.querySelectorAll<HTMLElement>('[data-pieces]')].find((e) => e.offsetParent !== null);
  const to = target?.getBoundingClientRect() ?? new DOMRect(innerWidth - 48, 16, 24, 24);
  const tx = to.left + to.width / 2, ty = to.top + to.height / 2;
  const cx = from.left + from.width / 2, cy = from.top + from.height / 2;
  const n = Math.min(14, Math.max(6, Math.round(count / 6)));
  let last = 0;
  for (let i = 0; i < n; i++) {
    const el = document.createElement('span');
    el.className = 'msn-fly';
    el.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M8 1.5 14.5 8 8 14.5 1.5 8z" fill="#f2b233"/><path d="M8 1.5 14.5 8H1.5z" fill="#ffd970"/></svg>';
    el.style.left = `${cx - 7}px`; el.style.top = `${cy - 7}px`;
    document.body.appendChild(el);
    const ang = (i / n) * Math.PI * 2 + Math.random() * 0.6;
    const r = 36 + Math.random() * 40;
    const bx = Math.cos(ang) * r, by = Math.sin(ang) * r - 12;
    const delay = 60 + i * 45;
    const dur = 900 + Math.random() * 200;
    last = Math.max(last, delay + dur);
    el.animate([
      { transform: 'translate(0,0) scale(.3) rotate(0deg)', opacity: 0 },
      { transform: `translate(${bx}px,${by}px) scale(1.15) rotate(90deg)`, opacity: 1, offset: 0.3, easing: 'cubic-bezier(.3,0,.2,1)' },
      { transform: `translate(${tx - cx}px,${ty - cy}px) scale(.55) rotate(260deg)`, opacity: 0.9 },
    ], { duration: dur, delay, easing: 'cubic-bezier(.5,0,.8,.4)', fill: 'both' }).onfinish = () => {
      el.remove();
      if (target) { target.classList.remove('pc-bump'); void target.offsetWidth; target.classList.add('pc-bump'); }
    };
  }
  return last;
}

export function MissionsView({ api, onChampion }: { api: Api; onChampion?: (id: number) => void }) {
  const { data: loaded, error } = useLoad<MissionState>(api, '/api/me/missions');
  const [over, setOver] = useState<MissionState | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  // '모두 받기' 뒤: 줄이 '받았어요'로 바뀌어 잠깐 남았다가 부드럽게 접힌다 (카드가 튀지 않게)
  const [got, setGot] = useState<{ n: number; closing: boolean } | null>(null);
  const data = over ?? loaded;
  const rv = useReveal(Boolean(data));
  if (error) return <Empty>{error}</Empty>;
  if (!data) return <MissionsSkeleton />;

  const claim = async (key: string, body: { ids?: string[]; all?: boolean }, el: HTMLElement | null) => {
    if (busy) return;
    setBusy(key); setMsg('');
    try {
      const r = await api.post<ClaimRes>('/api/me/missions/claim', body);
      const wait = el ? flyPieces(el.getBoundingClientRect(), r.gained) : 0;
      setFresh(new Set(r.ids));
      setOver(r.state);
      if (body.all) { setGot({ n: r.gained, closing: false }); setTimeout(() => setGot({ n: r.gained, closing: true }), 1800); setTimeout(() => setGot(null), 2300); }
      // 조각이 닿을 즈음 잔액이 차오른다
      setTimeout(() => addPieces(r.gained, 800), Math.max(0, wait - 700));
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };

  const w = data.week;
  const done = w.missions.filter((m) => m.done).length;
  const r1 = w.missions[0].role;
  const suggest = shuffle(data.suggest, Math.floor(w.start / DAY));
  const ready = data.ready ?? 0;
  return (<Swap on={rv} skeleton={<MissionsSkeleton />}>
    <div className={`msn ${fadeCls(rv)}`}>
      <header className="msn-head">
        <div className="msn-title">
          <span className="msn-kicker">{md(w.start)} – {md(w.end - 1)} · {left(w.end)}</span>
          <h1>이번 주 미션</h1>
        </div>
        <WeekDial done={done} total={w.missions.length} />
      </header>

      {(ready > 0 || got) && <ReadyBar amount={got ? got.n : ready} done={Boolean(got)} closing={got?.closing ?? false} busy={busy === 'all'} onClaim={(el) => claim('all', { all: true }, el)} />}
      {msg && <p className="l" style={{ margin: 0 }}>{msg}</p>}

      <div className="msn-cards">{w.missions.map((m, i) => (
        <MissionCard key={m.id} m={m} i={i} fresh={fresh.has(m.id)} busy={busy === m.id} onClaim={(el) => claim(m.id, { ids: [m.id] }, el)} />
      ))}</div>
      {w.bonus > 1 && w.top && <p className="msn-bonus"><b>보상 ×{w.bonus}</b> 지난주까지 {MISSION_ROLE_KO[w.top.role]}를 {Math.round(w.top.share * 100)}% 했어요. 다른 역할로 넓힐수록 보상이 커요.</p>}

      {data.past.length > 0 && <section className="msn-past">
        <span className="msn-sec">지난주에 깬 미션</span>
        {data.past.map((m) => <div key={m.id} className="msn-pr"><Icon name="check" /><span>{m.title}</span><span className="sp" /><span className="msn-amt">+{m.reward}<PieceIcon size={12} /></span></div>)}
      </section>}

      {suggest.length > 0 && r1 && <section className="msn-try">
        <div className="msn-try-h"><span className="msn-sec">처음 해 볼 {MISSION_ROLE_KO[r1]} 챔프</span><span className="meta">아직 안 해 본 {data.suggest.length}개 중</span></div>
        <div className="msn-strip">{suggest.slice(0, 8).map((id) => (
          <button key={id} type="button" className="msn-champ" onClick={() => onChampion?.(id)} title={`${CHAMPIONS[id]?.name} 증강 가이드 보기`}>
            <img className="fi" src={cdragon(CHAMPIONS[id]?.splash)} alt="" loading="lazy" {...imgIn} />
            <span className="msn-champ-nm">{CHAMPIONS[id]?.name}</span>
            <span className="msn-new">NEW</span>
          </button>
        ))}</div>
      </section>}

      <section className="card pad msn-roles">
        <div className="card-head"><h2>역할</h2><span className="sp" /><span className="meta">한 비율 · 해 본 챔프</span></div>
        {data.pioneer.map((p) => {
          const sh = data.shares.find((x) => x.role === p.role);
          const open = p.steps.filter((x) => x.done && !x.claimed);
          const next = p.steps.find((x) => !x.done);
          const sum = open.reduce((s, x) => s + x.reward, 0);
          return (
            <div key={p.role} className="msn-role">
              <span className="msn-rn"><i style={{ background: ROLE_C[p.role] }} />{MISSION_ROLE_KO[p.role]}</span>
              <span className="msn-share"><span className="msn-bar"><span style={{ width: `${Math.round((sh?.share ?? 0) * 100)}%`, background: ROLE_C[p.role] }} /></span><small>{Math.round((sh?.share ?? 0) * 100)}%</small></span>
              <span className="msn-pio">
                <span className="msn-track">
                  <span className="msn-fill" style={{ width: `${(p.played / Math.max(1, p.pool)) * 100}%` }} />
                  {p.steps.map((s) => <i key={s.id} className={`msn-step ${s.claimed ? 'got' : s.done ? 'ready' : ''}`} style={{ left: `${(s.at / Math.max(1, p.pool)) * 100}%` }} title={`${s.at}개 · ${s.reward} ${PIECE}`} />)}
                </span>
                <small>{p.played}<i>/{p.pool}</i></small>
              </span>
              {open.length ? <button type="button" className="msn-mini" disabled={busy !== null} onClick={(e) => claim(`p-${p.role}`, { ids: open.map((x) => x.id) }, e.currentTarget)}>받기 <b>+{sum}</b><PieceIcon size={12} /></button>
                : <span className="msn-next">{next ? <>{next.at}개 <b>+{next.reward}</b><PieceIcon size={12} /></> : <><Icon name="check" />완료</>}</span>}
            </div>
          );
        })}
      </section>
    </div>
  </Swap>);
}

/** 이번 주 깬 수: 점 세 개가 이어진 고리 */
function WeekDial({ done, total }: { done: number; total: number }) {
  const R = 26, C = 2 * Math.PI * R;
  return (
    <div className="msn-dial" role="img" aria-label={`이번 주 ${done}/${total}`}>
      <svg viewBox="0 0 64 64" width="64" height="64">
        <circle cx="32" cy="32" r={R} className="bg" />
        <circle cx="32" cy="32" r={R} className="fg" strokeDasharray={`${(done / total) * C} ${C}`} />
      </svg>
      <span><b>{done}</b>/{total}</span>
    </div>
  );
}

function ReadyBar({ amount, done, closing, busy, onClaim }: { amount: number; done: boolean; closing: boolean; busy: boolean; onClaim: (el: HTMLElement) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <div className={`msn-ready-wrap ${closing ? 'closing' : ''}`}>
      <div className={`msn-ready ${done ? 'done' : ''}`}>
        <span className="msn-ready-ic">{done ? <Icon name="check" /> : <PieceIcon size={22} />}</span>
        <span className="msn-ready-t">{done ? <><b>{amount.toLocaleString()} {PIECE}를 받았어요</b><small>보유 {PIECE}에 더했어요</small></> : <><b>받을 보상이 있어요</b><small>깬 미션의 {PIECE}를 받아 가세요</small></>}</span>
        {!done && <button ref={ref} type="button" className="msn-claim all" disabled={busy} onClick={() => ref.current && onClaim(ref.current)}>
          <span>{busy ? '받는 중…' : '모두 받기'}</span><b>+{amount.toLocaleString()}</b><PieceIcon size={14} />
        </button>}
      </div>
    </div>
  );
}

function MissionCard({ m, i, fresh, busy, onClaim }: { m: Mission; i: number; fresh: boolean; busy: boolean; onClaim: (el: HTMLElement) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const state = m.claimed ? 'got' : m.done ? 'ready' : 'go';
  return (
    <article className={`msn-card s-${state} ${fresh ? 'fresh' : ''}`} style={{ '--rc': m.role ? ROLE_C[m.role] : 'var(--accent)', animationDelay: `${i * 70}ms` } as React.CSSProperties}>
      <div className="msn-card-top">
        <span className="msn-tag">{m.role ? MISSION_ROLE_KO[m.role] : '골고루'}</span>
        <span className="msn-amt">+{m.reward}<PieceIcon size={12} /></span>
      </div>
      <h3>{m.title}</h3>
      <p>{m.hint}</p>
      <div className="msn-pips" aria-label={`${m.progress}/${m.target}`}>
        {Array.from({ length: m.target }, (_, k) => <i key={k} className={k < m.progress ? 'on' : ''} />)}
        <small>{m.progress}/{m.target}</small>
      </div>
      {state === 'ready' && <button ref={ref} type="button" className="msn-claim" disabled={busy} onClick={() => ref.current && onClaim(ref.current)}>
        <span>{busy ? '받는 중…' : '받기'}</span><b>+{m.reward}</b><PieceIcon size={14} />
      </button>}
      {state === 'got' && <span className="msn-got"><Icon name="check" />받았어요</span>}
      {fresh && <span className="msn-plus" aria-hidden="true">+{m.reward}</span>}
    </article>
  );
}
