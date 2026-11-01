/**
 * 내전 팀 나누기 — 프리즘 빛 갈래 (CLAUDE.md v3.135).
 * 한 명씩 빛줄기가 되어 프리즘을 지나 블루·레드로 갈라진다.
 * - 팀과 순서는 서버가 정한다. 화면은 서버 시각에 맞춰 같은 순간에 시작한다 (`useDraw` 가 1.5초마다 묻고 시계 차이를 잰다).
 * - 연출은 '지금 몇 ms 지났나' 하나로만 그린다 → 늦게 연 화면은 그만큼 앞으로 감아서 같은 장면을 본다.
 * - 동작 줄이기면 빛줄기 없이 차례로 자리만 채운다.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Api, NowDraw, NowDrawRes } from '@prism/core';
import { MemberFace, Toggle } from './basics';

/** 한 사람이 출발하는 간격 · 빛이 자리까지 가는 시간 · 끝난 뒤 결과가 뜨기까지 */
const STEP = 560;
const BEAM = 640;
const SETTLE = 450;
const POLL = 1500;

export const drawLength = (n: number) => (n - 1) * STEP + BEAM + SETTLE;
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const msgOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** 그 내전의 마지막 팀 나누기 + 서버와의 시계 차이. active 동안만 1.5초마다 (화면이 보일 때만) */
export function useDraw(api: Api, lobby: string, active: boolean) {
  const [draw, setDraw] = useState<NowDraw | null>(null);
  const offset = useRef(0);
  const pull = useCallback(async () => {
    const t0 = Date.now();
    const r = await api.get<NowDrawRes>(`/api/now/draw?lobby=${encodeURIComponent(lobby)}`);
    const t1 = Date.now();
    // 서버 시각 − 내 시각 (오간 시간의 가운데 기준). 튀는 값은 반만 따라간다
    const o = r.now - (t0 + t1) / 2;
    offset.current = offset.current === 0 ? o : offset.current * 0.5 + o * 0.5;
    setDraw((d) => (d && r.draw && d.id === r.draw.id && d.confirmed === r.draw.confirmed ? d : r.draw));
    return r;
  }, [api, lobby]);
  useEffect(() => {
    let on = true;
    void pull().catch(() => {});
    if (!active) return () => { on = false; };
    const t = window.setInterval(() => { if (on && document.visibilityState === 'visible') void pull().catch(() => {}); }, POLL);
    return () => { on = false; window.clearInterval(t); };
  }, [pull, active]);
  return { draw, setDraw, offset, pull };
}

/** 서버 시각 기준으로 지금이 연출의 몇 ms 째인지 (시작 전이면 음수) */
function useElapsed(draw: NowDraw | null, offset: { current: number }) {
  const [t, setT] = useState(() => (draw ? Date.now() + offset.current - draw.start : 0));
  useEffect(() => {
    if (!draw) return;
    const end = drawLength(draw.people.length);
    let raf = 0;
    const tick = () => {
      const e = Date.now() + offset.current - draw.start;
      setT(e);
      if (e < end) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [draw, offset]);
  return t;
}

type Pt = { x: number; y: number };

/** 빛 갈래 무대: 왼쪽 사람들 → 가운데 프리즘 → 오른쪽 블루 5칸 · 레드 5칸 */
export function PrismSplit({ draw, offset, meId, canRun, busy, onAgain, onConfirm }: {
  draw: NowDraw; offset: { current: number }; meId: string; canRun: boolean; busy: boolean;
  onAgain: () => void; onConfirm: () => void;
}) {
  const t = useElapsed(draw, offset);
  const n = draw.people.length;
  const end = drawLength(n);
  const calm = reduced();
  const stage = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState<{ w: number; h: number; from: Pt[]; to: Pt[]; inL: Pt; outB: Pt; outR: Pt } | null>(null);
  // 좁은 칸(휴대폰)에서는 위 → 아래로: 얼굴 줄 → 프리즘 → 두 팀
  const [vert, setVert] = useState(false);
  // 각 사람이 몇 번째로 자기 팀에 들어가는지
  const slotOf: number[] = [];
  const cnt = { blue: 0, red: 0 };
  draw.people.forEach((p) => { slotOf.push(cnt[p.team]++); });
  const perTeam = Math.max(cnt.blue, cnt.red);

  const measure = useCallback(() => {
    const el = stage.current; if (!el) return;
    const b = el.getBoundingClientRect();
    const v = b.width < 560;
    if (v !== vert) { setVert(v); return; }
    const c = (q: Element | null, side: 'l' | 'r' | 'c' | 't' | 'b'): Pt => {
      if (!q) return { x: 0, y: 0 };
      const r = q.getBoundingClientRect();
      const x = side === 'r' ? r.right : side === 'l' ? r.left : r.left + r.width / 2;
      const y = side === 't' ? r.top : side === 'b' ? r.bottom : r.top + r.height / 2;
      return { x: x - b.left, y: y - b.top };
    };
    const from = draw.people.map((_, i) => c(el.querySelector(`[data-p="${i}"]`), v ? 'b' : 'r'));
    const to = draw.people.map((p, i) => c(el.querySelector(`[data-s="${p.team}-${slotOf[i]}"]`), v ? 't' : 'l'));
    const pr = el.querySelector('.ps-prism')?.getBoundingClientRect();
    const cx = pr ? pr.left + pr.width / 2 - b.left : b.width / 2, cy = pr ? pr.top + pr.height * 0.62 - b.top : b.height / 2;
    const half = pr ? pr.width * 0.26 : 24;
    if (v && pr) {
      const top = pr.top - b.top + pr.height * 0.3, bot = pr.bottom - b.top - 4;
      setGeo({ w: b.width, h: b.height, from, to, inL: { x: cx, y: top }, outB: { x: cx - 8, y: bot }, outR: { x: cx + 8, y: bot } });
    } else {
      setGeo({ w: b.width, h: b.height, from, to, inL: { x: cx - half, y: cy }, outB: { x: cx + half, y: cy - 6 }, outR: { x: cx + half, y: cy + 6 } });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draw, vert]);
  useLayoutEffect(() => {
    measure();
    const el = stage.current; if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  const arrived = (i: number) => t >= i * STEP + (calm ? 0 : BEAM);
  const started = (i: number) => t >= i * STEP;
  const done = t >= end;
  // 지금 프리즘을 지나는 빛이 있으면 프리즘이 밝아진다
  const lit = !calm && draw.people.some((_, i) => { const p = (t - i * STEP) / BEAM; return p > 0.3 && p < 0.62; });
  const count = t < 0 ? Math.ceil(-t / 1000) : 0;
  const blue = draw.people.filter((p, i) => p.team === 'blue' && arrived(i));
  const red = draw.people.filter((p, i) => p.team === 'red' && arrived(i));
  const sum = (a: typeof blue) => a.reduce((s, p) => s + p.score, 0);
  const diff = Math.abs(sum(draw.people.filter((p) => p.team === 'blue')) - sum(draw.people.filter((p) => p.team === 'red')));
  const isHost = draw.host === meId;

  const face = (p: NowDraw['people'][number], size: number) => p.id
    ? <MemberFace nick={p.nick ?? '멤버'} skin={p.skin ?? null} champion={p.main ?? null} size={size} />
    : <span className="ps-guest" style={{ width: size, height: size }}>손</span>;

  return (
    <div className={`ps ${done ? 'done' : ''} ${t < 0 ? 'wait' : ''}`}>
      <div className={`ps-stage ${vert ? 'vert' : ''}`} ref={stage}>
        <ol className="ps-people">
          {draw.people.map((p, i) => (
            <li key={p.key} data-p={i} className={`ps-person ${started(i) ? 'gone' : ''} ${p.id === meId ? 'me' : ''}`}>
              {face(p, 32)}<span className="ps-nm">{p.nick}</span>
            </li>
          ))}
        </ol>
        <div className="ps-mid">
          <svg className={`ps-prism ${lit ? 'lit' : ''}`} viewBox="0 0 120 108" aria-hidden="true">
            <defs>
              <linearGradient id="ps-edge" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#7ae7ff" /><stop offset=".5" stopColor="#b48cff" /><stop offset="1" stopColor="#ff7ab6" /></linearGradient>
              <linearGradient id="ps-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".16" /><stop offset="1" stopColor="#fff" stopOpacity=".02" /></linearGradient>
            </defs>
            <polygon className="ps-glow" points="60,6 114,102 6,102" fill="url(#ps-edge)" />
            <polygon points="60,6 114,102 6,102" fill="url(#ps-fill)" stroke="url(#ps-edge)" strokeWidth="2.5" strokeLinejoin="round" />
          </svg>
          {t < 0 && <span key={count} className="ps-count">{count}</span>}
        </div>
        <div className="ps-teams">
          {(['blue', 'red'] as const).map((side) => (
            <div key={side} className={`ps-team ${side}`}>
              <span className="ps-team-h"><i />{side === 'blue' ? '블루' : '레드'}</span>
              {Array.from({ length: perTeam }, (_, k) => {
                const i = draw.people.findIndex((p, j) => p.team === side && slotOf[j] === k);
                const p = i >= 0 ? draw.people[i] : null;
                const on = p && arrived(i);
                return (
                  <div key={k} data-s={`${side}-${k}`} className={`ps-slot ${on ? 'on' : ''} ${p?.id === meId && on ? 'me' : ''}`}>
                    {on && p ? <>{face(p, 28)}<span className="ps-nm">{p.nick}</span><small>{p.score}</small></> : <span className="ps-empty" />}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        {geo && !calm && (
          <svg className="ps-beams" width={geo.w} height={geo.h} viewBox={`0 0 ${geo.w} ${geo.h}`} aria-hidden="true">
            {draw.people.map((p, i) => {
              const k = (t - i * STEP) / BEAM;
              if (k <= 0) return null;
              const a = geo.from[i], z = geo.to[i], o = p.team === 'blue' ? geo.outB : geo.outR;
              const prog = Math.min(1, k);
              const fade = k >= 1 ? 0.16 : 1;
              const col = p.team === 'blue' ? '#5b8cff' : '#ff5d6c';
              return (
                <g key={p.key} opacity={fade} className={k >= 1 ? 'ps-beam rest' : 'ps-beam'}>
                  <path d={vert ? `M${a.x},${a.y + 2} L${geo.inL.x},${geo.inL.y}` : `M${a.x + 6},${a.y} L${geo.inL.x},${geo.inL.y}`} pathLength={1} strokeDasharray="1" strokeDashoffset={1 - Math.min(1, prog / 0.45)} stroke="#fff" />
                  {prog > 0.45 && <path d={vert ? `M${o.x},${o.y} L${z.x},${z.y - 2}` : `M${o.x},${o.y} L${z.x - 6},${z.y}`} pathLength={1} strokeDasharray="1" strokeDashoffset={1 - Math.min(1, (prog - 0.45) / 0.55)} stroke={col} />}
                </g>
              );
            })}
          </svg>
        )}
      </div>
      <div className={`ps-foot ${done ? 'on' : ''}`} aria-live="polite">
        {done ? (
          <>
            <span className="ps-sum blue">블루 <b>{sum(blue)}</b></span>
            <span className={`ps-diff ${diff > 60 ? 'warn' : ''}`}>Prism 점수 합 차이 {diff}{draw.balanced ? ' · 밸런스' : ''}</span>
            <span className="ps-sum red">레드 <b>{sum(red)}</b></span>
            <span className="sp" />
            {draw.confirmed
              ? <span className="ps-ok">팀 확정 · 롤 로비에서 이대로 자리를 옮겨 주세요</span>
              : isHost || canRun
                ? <>{canRun && <button type="button" className="btn sm ghost-dark" disabled={busy} onClick={onAgain}>다시 나누기</button>}{isHost && <button type="button" className="btn sm equip" disabled={busy} onClick={onConfirm}>팀 확정</button>}</>
                : <span className="ps-wait">나눈 분이 확정하면 알려 드려요</span>}
          </>
        ) : <span className="ps-wait">{t < 0 ? '곧 빛을 비춰요' : `${blue.length + red.length} / ${n}`}</span>}
      </div>
    </div>
  );
}

/** 팀 나누기를 여는 칸: 밸런스 맞추기 + 빛 비추기 */
export function SplitStarter({ api, lobby, total, onStarted, onClose }: { api: Api; lobby: string; total: number; onStarted: (r: NowDrawRes) => void; onClose: () => void }) {
  const [bal, setBal] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const ok = total >= 4 && total % 2 === 0;
  const go = async () => {
    setBusy(true); setErr('');
    try { onStarted(await api.post<NowDrawRes>(`/api/now/${encodeURIComponent(lobby)}/draw`, { balance: bal })); }
    catch (e) { setErr(msgOf(e)); }
    finally { setBusy(false); }
  };
  return (
    <div className="ps-start">
      <span className="ps-start-t"><b>팀 나누기</b><small>{ok ? `${total}명을 블루·레드로 나눠요. 모두의 화면에서 함께 시작돼요` : `${total}명이에요. 짝수(4명 이상)일 때 나눌 수 있어요`}</small></span>
      <label className="ps-bal"><small>밸런스 맞추기</small><Toggle on={bal} onChange={setBal} label="Prism 점수가 비슷하게 나누기" /></label>
      <button type="button" className="btn sm ghost-dark" onClick={onClose} disabled={busy}>닫기</button>
      <button type="button" className="btn sm primary" onClick={() => void go()} disabled={busy || !ok}>빛 비추기</button>
      {err && <span className="ps-err">{err}</span>}
    </div>
  );
}
