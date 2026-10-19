/**
 * 미션 화면 (CLAUDE.md v3.27 · v3.38). 웹·앱 공용.
 * 이번 주 미션 3개 · 처음 해 볼 챔프 한 줄 · 역할(분포 + 개척).
 * 깬 미션은 '받기'를 눌러야 피스가 들어온다 — 버튼에서 금빛 조각이 터져 보유 피스로 날아가고, 숫자가 차오른다.
 */
import { useRef, useState } from 'react';
import { AUGMENT, CHAMPIONS, RARITY_KO, MISSION_ROLE_KO, PIECE, cdragon, shortNick, type Api, type Mission, type MissionState, type WTonight, type WTrack, type WeeklyState, josa } from '@prism/core';
import { AugRing, AugmentLink } from './augment';
import { Empty, MemberFace } from './basics';
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
type WClaimRes = { gained: number; ids: string[]; state: WeeklyState };

/** 받기: 버튼에서 금빛 조각이 터져 곡선을 그리며 보유 피스(사이드바·상단)로 날아간다 (v3.82).
 * 터짐·닿음 효과와 '+N' 은 화면 맨 위 층(body)에 그린다 — 보유 피스 칸은 넘치는 부분을 잘라 내므로 그 안에서 키우면 잘린다.
 * 보유 피스 글자 자체는 크기를 바꾸지 않고 밝게만 빛난다. */
const PIECE_SVG = (s: number) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true"><defs><linearGradient id="pg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3c4"/><stop offset=".45" stop-color="#ffcf4d"/><stop offset="1" stop-color="#c98a12"/></linearGradient></defs><path d="M12 1.5 22.5 12 12 22.5 1.5 12z" fill="url(#pg)"/><path d="M12 1.5 22.5 12H1.5z" fill="#fff" opacity=".28"/><path d="M12 6.5 17.5 12 12 17.5 6.5 12z" fill="#fff6d6" opacity=".55"/><path d="M12 1.5 22.5 12 12 22.5 1.5 12z" fill="none" stroke="#8a5a06" stroke-opacity=".35" stroke-width=".8"/></svg>`;

function fx(cls: string, x: number, y: number, html = '') {
  const el = document.createElement('span');
  el.className = cls; el.style.left = `${x}px`; el.style.top = `${y}px`; el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

function flyPieces(from: DOMRect, count: number) {
  if (reduced()) return 0;
  const target = [...document.querySelectorAll<HTMLElement>('[data-pieces]')].find((e) => e.offsetParent !== null);
  const to = target?.getBoundingClientRect() ?? new DOMRect(innerWidth - 48, 16, 24, 24);
  const tx = to.left + to.width / 2, ty = to.top + to.height / 2;
  const cx = from.left + from.width / 2, cy = from.top + from.height / 2;
  // 터지는 빛 (버튼 자리)
  const flash = fx('pf-flash', cx, cy);
  flash.animate([{ transform: 'translate(-50%,-50%) scale(.2)', opacity: 0.9 }, { transform: 'translate(-50%,-50%) scale(1.6)', opacity: 0 }], { duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)' }).onfinish = () => flash.remove();
  const n = Math.min(18, Math.max(10, Math.round(count / 5)));
  let last = 0, landed = 0;
  for (let i = 0; i < n; i++) {
    const size = 20 + Math.round(Math.random() * 10);
    const el = fx('pf-piece', cx - size / 2, cy - size / 2, PIECE_SVG(size));
    // 1) 터짐: 위쪽으로 치우친 원형으로 튀어나감
    const ang = -Math.PI / 2 + (i / n - 0.5) * Math.PI * 1.7 + (Math.random() - 0.5) * 0.4;
    const r = 60 + Math.random() * 70;
    const bx = Math.cos(ang) * r, by = Math.sin(ang) * r;
    // 2) 곡선 비행: 터진 자리 → 보유 피스, 옆으로 휘는 조절점
    const ex = tx - cx, ey = ty - cy;
    const mx = (bx + ex) / 2, my = (by + ey) / 2;
    const len = Math.hypot(ex - bx, ey - by) || 1;
    const bend = (Math.random() < 0.5 ? -1 : 1) * (0.18 + Math.random() * 0.22) * len;
    const kx = mx + (-(ey - by) / len) * bend, ky = my + ((ex - bx) / len) * bend;
    const spin = (Math.random() < 0.5 ? -1 : 1) * (240 + Math.random() * 300);
    const frames: Keyframe[] = [
      { offset: 0, transform: 'translate(0,0) scale(.2) rotate(0deg)', opacity: 0 },
      { offset: 0.26, transform: `translate(${bx}px,${by}px) scale(1.15) rotate(${spin * 0.25}deg)`, opacity: 1, easing: 'cubic-bezier(.2,.9,.3,1)' },
      { offset: 0.34, transform: `translate(${bx}px,${by + 6}px) scale(1.05) rotate(${spin * 0.3}deg)`, opacity: 1 },
    ];
    for (let k = 1; k <= 10; k++) {
      const t = Math.pow(k / 10, 1.7); // 점점 빨라지게
      const x = (1 - t) * (1 - t) * bx + 2 * (1 - t) * t * kx + t * t * ex;
      const y = (1 - t) * (1 - t) * (by + 6) + 2 * (1 - t) * t * ky + t * t * ey;
      frames.push({ offset: 0.34 + 0.66 * (k / 10), transform: `translate(${x}px,${y}px) scale(${1.05 - 0.6 * t}) rotate(${spin * (0.3 + 0.7 * t)}deg)`, opacity: k === 10 ? 0.85 : 1 });
    }
    const delay = 40 + i * 38;
    const dur = 1050 + Math.random() * 250;
    last = Math.max(last, delay + dur);
    el.animate(frames, { duration: dur, delay, fill: 'both' }).onfinish = () => {
      el.remove();
      landed++;
      // 닿음: 빛 고리 + 반짝이, 보유 피스는 밝게만
      const ring = fx('pf-ring', tx, ty);
      ring.animate([{ transform: 'translate(-50%,-50%) scale(.3)', opacity: 0.95 }, { transform: 'translate(-50%,-50%) scale(1.4)', opacity: 0 }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' }).onfinish = () => ring.remove();
      for (let s = 0; s < 3; s++) {
        const sp = fx('pf-spark', tx, ty);
        const a = Math.random() * Math.PI * 2, d = 14 + Math.random() * 18;
        sp.animate([{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }, { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(.2)`, opacity: 0 }], { duration: 380 + Math.random() * 160, easing: 'cubic-bezier(.2,.8,.2,1)' }).onfinish = () => sp.remove();
      }
      if (target) { target.classList.remove('pc-hit'); void target.offsetWidth; target.classList.add('pc-hit'); }
      // 첫 조각이 닿을 때 '+N'
      if (landed === 1) {
        // 보유 피스 오른쪽에서 떠오른다 (이름·얼굴을 가리지 않게)
        const plus = fx('pf-plus', Math.min(to.right + 10, innerWidth - 96), ty, `+${count.toLocaleString()}${PIECE_SVG(14)}`);
        plus.animate([{ transform: 'translate(-8px,-50%) scale(.7)', opacity: 0 }, { transform: 'translate(0,-60%) scale(1.08)', opacity: 1, offset: 0.25 }, { transform: 'translate(0,-90%) scale(1)', opacity: 1, offset: 0.7 }, { transform: 'translate(0,-150%) scale(.96)', opacity: 0 }], { duration: 1500, easing: 'cubic-bezier(.2,.8,.2,1)' }).onfinish = () => plus.remove();
      }
    };
  }
  return last;
}

export function MissionsView({ api, onChampion }: { api: Api; onChampion?: (id: number) => void }) {
  const { data: loaded, error } = useLoad<MissionState>(api, '/api/me/missions');
  const { data: wLoaded, error: wError } = useLoad<WeeklyState>(api, '/api/me/weekly');
  const [over, setOver] = useState<MissionState | null>(null);
  const [wOver, setWOver] = useState<WeeklyState | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  // '모두 받기' 뒤: 줄이 '받았어요'로 바뀌어 잠깐 남았다가 부드럽게 접힌다 (카드가 튀지 않게)
  const [got, setGot] = useState<{ n: number; closing: boolean } | null>(null);
  const data = over ?? loaded;
  const weekly = wOver ?? wLoaded;
  // 미션과 도전을 함께 기다린다 — 하나가 먼저 보였다가 다른 하나가 위에 끼어들며 화면이 밀리지 않게 (v3.93)
  const ok = Boolean(data && (weekly || wError));
  const rv = useReveal(ok);
  if (error) return <Empty>{error}</Empty>;
  if (!data || !ok) return <MissionsSkeleton />;

  // 받기: 미션·도전을 따로 또는 '모두 받기'로 함께. 받은 만큼 조각이 날아가고 잔액이 차오른다
  const claim = async (key: string, body: { ids?: string[]; all?: boolean }, el: HTMLElement | null, kind: 'mission' | 'weekly' | 'both' = 'mission') => {
    if (busy) return;
    setBusy(key); setMsg('');
    try {
      let gained = 0;
      const ids: string[] = [];
      if (kind !== 'weekly' && (kind === 'mission' || (data?.ready ?? 0) > 0)) {
        const r = await api.post<ClaimRes>('/api/me/missions/claim', body);
        gained += r.gained; ids.push(...r.ids); setOver(r.state);
      }
      if (kind !== 'mission' && (kind === 'weekly' || (weekly?.ready ?? 0) > 0)) {
        const r = await api.post<WClaimRes>('/api/me/weekly/claim', body);
        gained += r.gained; ids.push(...r.ids); setWOver(r.state);
      }
      const wait = el ? flyPieces(el.getBoundingClientRect(), gained) : 0;
      setFresh(new Set(ids));
      if (body.all) { setGot({ n: gained, closing: false }); setTimeout(() => setGot({ n: gained, closing: true }), 1800); setTimeout(() => setGot(null), 2300); }
      // 조각이 닿을 즈음 잔액이 차오른다
      setTimeout(() => addPieces(gained, 800), Math.max(0, wait - 700));
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };

  const w = data.week;
  const done = w.missions.filter((m) => m.done).length;
  const r1 = w.missions[0].role;
  const suggest = shuffle(data.suggest, Math.floor(w.start / DAY));
  const ready = (data.ready ?? 0) + (weekly?.ready ?? 0);
  return (<Swap on={rv} skeleton={<MissionsSkeleton />}>
    <div className={`msn ${fadeCls(rv)}`}>
      <header className="msn-head">
        <div className="msn-title">
          <span className="msn-kicker">{md(w.start)} – {md(w.end - 1)} · {left(w.end)}</span>
          <h1>미션</h1>
        </div>
      </header>

      {(ready > 0 || got) && <ReadyBar amount={got ? got.n : ready} done={Boolean(got)} closing={got?.closing ?? false} busy={busy === 'all'} onClaim={(el) => claim('all', { all: true }, el, 'both')} />}
      {msg && <p className="l" style={{ margin: 0 }}>{msg}</p>}

      {weekly && <WeeklyBoard w={weekly} busy={busy} fresh={fresh} onClaim={(k, ids, el) => claim(k, { ids }, el, 'weekly')} />}

      <div className="msn-sec-row"><h2>이번 주 미션</h2><span className="sp" /><span className="meta num">{done}/{w.missions.length} 완료</span></div>
      <div className="msn-cards">{w.missions.map((m, i) => (
        <MissionCard key={m.id} m={m} i={i} fresh={fresh.has(m.id)} busy={busy === m.id} onClaim={(el) => claim(m.id, { ids: [m.id] }, el)} />
      ))}</div>
      {w.bonus > 1 && w.top && <p className="msn-bonus"><b>보상 ×{w.bonus}</b> 지난주까지 {josa(MISSION_ROLE_KO[w.top.role], '을/를')} {Math.round(w.top.share * 100)}% 했어요. 다른 역할로 넓힐수록 보상이 커요.</p>}

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
              {open.length ? <button type="button" className="msn-mini" disabled={busy !== null} onClick={(e) => claim(`p-${p.role}`, { ids: open.map((x) => x.id) }, e.currentTarget)}>받기 <b>+{sum}</b><PieceIcon size={12} ink /></button>
                : <span className="msn-next">{next ? <>{next.at}개 <b>+{next.reward}</b><PieceIcon size={12} /></> : <><Icon name="check" />완료</>}</span>}
            </div>
          );
        })}
      </section>
    </div>
  </Swap>);
}


function ReadyBar({ amount, done, closing, busy, onClaim }: { amount: number; done: boolean; closing: boolean; busy: boolean; onClaim: (el: HTMLElement) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <div className={`msn-ready-wrap ${closing ? 'closing' : ''}`}>
      <div className={`msn-ready ${done ? 'done' : ''}`}>
        <span className="msn-ready-ic">{done ? <Icon name="check" /> : <PieceIcon size={22} />}</span>
        <span className="msn-ready-t">{done ? <><b>{amount.toLocaleString()} {PIECE}를 받았어요</b><small>보유 {PIECE}에 더했어요</small></> : <><b>받을 보상이 있어요</b><small>이룬 도전·미션의 {PIECE}를 받아 가세요</small></>}</span>
        {!done && <button ref={ref} type="button" className="msn-claim all" disabled={busy} onClick={() => ref.current && onClaim(ref.current)}>
          <span>{busy ? '받는 중…' : '모두 받기'}</span><b>+{amount.toLocaleString()}</b><PieceIcon size={14} ink />
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
        <span>{busy ? '받는 중…' : '받기'}</span><b>+{m.reward}</b><PieceIcon size={14} ink />
      </button>}
      {state === 'got' && <span className="msn-got"><Icon name="check" />받았어요</span>}
      {fresh && <span className="msn-plus" aria-hidden="true">+{m.reward}</span>}
    </article>
  );
}

// ───────── 이번 주 도전 (v3.90) ─────────

type WClaim = (key: string, ids: string[], el: HTMLElement | null) => void;
const readyOf = (t: WTrack) => t.steps.filter((s) => s.done && !s.claimed);
const sumOf = (xs: { reward: number }[]) => xs.reduce((s, x) => s + x.reward, 0);

/** 받기 알약 (도전 칸 머리 오른쪽) */
function WGet({ k, ids, amount, busy, onClaim }: { k: string; ids: string[]; amount: number; busy: string | null; onClaim: WClaim }) {
  const ref = useRef<HTMLButtonElement>(null);
  return <button ref={ref} type="button" className="msn-mini" disabled={busy !== null} onClick={() => onClaim(k, ids, ref.current)}>{busy === k ? '받는 중…' : '받기'} <b>+{amount.toLocaleString()}</b><PieceIcon size={12} ink /></button>;
}

/** 연승 칸: 지금 이어지는 수 + 단계 사슬 (받음 · 받을 수 있음 · 아직) */
function StreakTrack({ k, title, sub, t, busy, onClaim }: { k: string; title: string; sub: string; t: WTrack; busy: string | null; onClaim: WClaim }) {
  const open = readyOf(t);
  const top = t.steps[t.steps.length - 1].at;
  // 막대는 이번 주 최고 연승까지 (단계 표시와 맞게). 큰 숫자는 지금 이어지는 연승
  const fill = Math.min(1, t.best / top);
  return (
    <div className={`cw-box cw-streak ${k}`}>
      <div className="cw-bh">
        <span className="cw-t"><b>{title}</b><small>{sub}</small></span>
        {open.length > 0 && <WGet k={k} ids={open.map((s) => s.id)} amount={sumOf(open)} busy={busy} onClaim={onClaim} />}
      </div>
      <div className="cw-now">
        <span className="cw-big num">{t.now}</span>
        <span className="cw-now-t"><b>{t.now > 0 ? '연승 중' : '다음 판부터'}</b><small>이번 주 최고 {t.best}연승</small></span>
      </div>
      <div className="cw-chain" style={{ '--fill': fill } as React.CSSProperties}>
        <span className="cw-rail"><span /></span>
        {t.steps.map((s) => (
          <span key={s.id} className={`cw-node ${s.claimed ? 'got' : s.done ? 'ready' : ''}`} style={{ left: `${(s.at / top) * 100}%` }}>
            <i>{s.claimed ? <Icon name="check" /> : s.at}</i>
            <small className="num">+{s.reward}</small>
          </span>
        ))}
      </div>
    </div>
  );
}

/** 막대 칸: 함께 쌓는 승리 · 모두의 목표 */
function BarTrack({ k, title, sub, t, unit, foot, busy, onClaim }: { k: string; title: string; sub: string; t: WTrack; unit: string; foot?: React.ReactNode; busy: string | null; onClaim: WClaim }) {
  const open = readyOf(t);
  const top = t.steps[t.steps.length - 1].at;
  const next = t.steps.find((s) => !s.done);
  return (
    <div className={`cw-box cw-bar ${k}`}>
      <div className="cw-bh">
        <span className="cw-t"><b>{title}</b><small>{sub}</small></span>
        {open.length > 0 && <WGet k={k} ids={open.map((s) => s.id)} amount={sumOf(open)} busy={busy} onClaim={onClaim} />}
      </div>
      <div className="cw-count"><b className="num">{t.now.toLocaleString()}</b><span>{next ? <>/ {next.at}{unit}</> : unit}</span>{next && <em className="num">다음 +{next.reward}<PieceIcon size={12} /></em>}</div>
      <div className="cw-meter">
        <span className="cw-meter-f" style={{ width: `${Math.min(100, (t.now / top) * 100)}%` }} />
        {t.steps.map((s) => <i key={s.id} className={s.claimed ? 'got' : s.done ? 'ready' : ''} style={{ left: `${(s.at / top) * 100}%` }} title={`${s.at}${unit} +${s.reward}`} />)}
      </div>
      {foot && <p className="cw-foot">{foot}</p>}
    </div>
  );
}

/** 오늘 밤 증강: 봇이 21시에 올린 증강 3개, 그중 하나를 골라 이기면 (다음 공지 전까지 한 번) */
function TonightBox({ t, busy, fresh, onClaim }: { t: WTonight; busy: string | null; fresh: boolean; onClaim: WClaim }) {
  const today = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
  const untilDay = new Date(t.until + 9 * 3_600_000).toISOString().slice(0, 10);
  const state = t.claimed ? 'got' : t.done ? 'ready' : 'go';
  return (
    <div className={`cw-box cw-tonight s-${state} ${fresh ? 'fresh' : ''}`}>
      <div className="cw-bh">
        <span className="cw-t"><b>오늘 밤 증강</b><small>셋 중 하나를 골라 이기면 · {untilDay === today ? '오늘' : '내일'} 21시까지</small></span>
        {state === 'ready' && <WGet k="tonight" ids={[t.id]} amount={t.reward} busy={busy} onClaim={onClaim} />}
        {state === 'got' && <span className="msn-amt cw-got"><Icon name="check" />받았어요</span>}
        {state === 'go' && <span className="msn-amt">+{t.reward}<PieceIcon size={12} /></span>}
      </div>
      <div className="cw-augs">{t.augs.map((id) => (
        <AugmentLink key={id} id={id} className="cw-aug"><AugRing id={id} size={40} /><span><b>{AUGMENT[id]?.name ?? '증강'}</b><small>{AUGMENT[id] ? RARITY_KO[AUGMENT[id].rarity] : ''}</small></span></AugmentLink>
      ))}</div>
      {state === 'go' && t.picked > 0 && <p className="cw-foot">골라 본 판이 {t.picked}판 있어요. 이기면 받을 수 있어요.</p>}
    </div>
  );
}

export function WeeklyBoard({ w, busy, fresh, onClaim }: { w: WeeklyState; busy: string | null; fresh: Set<string>; onClaim: WClaim }) {
  const pairsOpen = w.pairs.filter((p) => !p.claimed);
  const bondsOpen = w.bonds.filter((b) => !b.claimed);
  const goalFoot = w.goal.mine > 0
    ? <>{w.goal.helpers}명이 보탰어요 · 나는 {w.goal.mine}승</>
    : <>{w.goal.helpers > 0 ? `${w.goal.helpers}명이 보탰어요 · ` : ''}멤버와 함께 1승을 보태면 같이 받아요</>;
  const PAIR_MAX = 3;
  return (
    <section className="cw">
      <div className="cw-head"><h2>이번 주 도전</h2></div>
      {w.tonight && <TonightBox t={w.tonight} busy={busy} fresh={fresh.has(w.tonight.id)} onClaim={onClaim} />}
      <div className="cw-grid two">
        <StreakTrack k="streak" title="연승" sub="기록된 판에서 연달아" t={w.streak} busy={busy} onClaim={onClaim} />
        <StreakTrack k="crew" title="프리즘 연승" sub="멤버와 같은 팀인 판만" t={w.crewStreak} busy={busy} onClaim={onClaim} />
      </div>
      <div className="cw-grid two">
        <BarTrack k="wins" title="함께 쌓는 승리" sub="멤버와 같은 팀으로 이긴 판" t={w.wins} unit="승" busy={busy} onClaim={onClaim} />
        <BarTrack k="goal" title="모두의 목표" sub="모임 전체가 함께 이긴 판" t={w.goal} unit="승" foot={goalFoot} busy={busy} onClaim={onClaim} />
      </div>
      <div className="cw-grid two">
        <div className="cw-box cw-pairs">
          <div className="cw-bh">
            <span className="cw-t"><b>새로운 짝</b><small>처음으로 함께 이긴 멤버 · 주에 {PAIR_MAX}명까지</small></span>
            {pairsOpen.length > 0 && <WGet k="pair" ids={pairsOpen.map((p) => p.id)} amount={sumOf(pairsOpen)} busy={busy} onClaim={onClaim} />}
          </div>
          <div className="cw-slots">
            {Array.from({ length: PAIR_MAX }, (_, i) => {
              const p = w.pairs[i];
              if (!p) return <span key={i} className="cw-slot empty"><i>?</i><small>+{Math.round(25 * w.rate)}</small></span>;
              return (
                <span key={p.id} className={`cw-slot ${p.claimed ? 'got' : 'ready'} ${fresh.has(p.id) ? 'fresh' : ''}`}>
                  <MemberFace nick={p.face?.nick ?? '?'} skin={p.face?.skin} champion={p.face?.main} size={44} />
                  <small>{shortNick(p.face?.nick ?? '')}</small>
                </span>
              );
            })}
          </div>
        </div>
        <div className="cw-box cw-bonds">
          <div className="cw-bh">
            <span className="cw-t"><b>듀오 등급</b><small>함께할수록 오르는 관계 등급</small></span>
            {bondsOpen.length > 0 && <WGet k="bond" ids={bondsOpen.map((b) => b.id)} amount={sumOf(bondsOpen)} busy={busy} onClaim={onClaim} />}
          </div>
          {bondsOpen.slice(0, 3).map((b) => (
            <div key={b.id} className="cw-bond ready">
              <MemberFace nick={b.face?.nick ?? '?'} skin={b.face?.skin} champion={b.face?.main} size={32} />
              <span className="cw-bond-t"><b>{shortNick(b.face?.nick ?? '')}</b><small>Lv{b.grade} {b.name} 달성</small></span>
            </div>
          ))}
          {w.bondNext.filter((b) => !bondsOpen.some((o) => o.member === b.member)).slice(0, Math.max(0, 3 - bondsOpen.length)).map((b) => (
            <div key={b.member} className="cw-bond">
              <MemberFace nick={b.face?.nick ?? '?'} skin={b.face?.skin} champion={b.face?.main} size={32} />
              <span className="cw-bond-t"><b>{shortNick(b.face?.nick ?? '')}</b><small>{b.next}까지 {b.toNext}점</small><span className="msn-bar"><span style={{ width: `${Math.round(b.pct * 100)}%`, background: 'var(--accent)' }} /></span></span>
              <span className="msn-amt">+{b.reward}<PieceIcon size={12} /></span>
            </div>
          ))}
          {!bondsOpen.length && !w.bondNext.length && <p className="cw-foot">멤버와 같은 팀으로 함께하면 등급이 오르기 시작해요.</p>}
        </div>
      </div>
    </section>
  );
}
