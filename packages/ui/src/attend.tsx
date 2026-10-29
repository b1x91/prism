/**
 * 출석 연출 (CLAUDE.md v3.120). 매일 첫 접속에 서버가 돌려준 출석(연속 일수·피스)으로 화면 가운데에서 터진다.
 * 이어서 올수록 크게: 1단계(1~2일) 빛 고리·반짝임 → 2단계(3~6일) 금빛 조각 → 3단계(7~13일) 도는 빛살
 * → 4단계(14~29일) 프리즘 조각·겹 충격파 → 5단계(30일~) 프리즘 색종이·보석 왕관. 7·14·30·60·100일째에는 보너스 리본.
 * 다 보면(또는 누르면) 금빛 조각이 보유 피스로 날아간다. 동작 줄이기면 멈춘 카드만.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ATTEND, attendBase, attendReward, type Api } from '@prism/core';
import { PieceIcon, refreshPieces } from './shop';
import { flyPieces } from './missions';

export type Attend = { day: string; streak: number; reward: number; base: number; bonus: number; stage: 1 | 2 | 3 | 4 | 5 };

const STAGE_NAME = ['', '출석 완료', '꾸준히 오셨어요', '일주일 연속!', '2주 연속!', '한 달 연속!'] as const;
/** 단계마다 조각 수·머무는 시간 */
const SHARDS = [0, 10, 18, 26, 34, 44];
const HOLD = [0, 2600, 3000, 3400, 3800, 4400];
// 금빛 · 프리즘 (로고 결정의 면 색)
const GOLD = ['#ffe9a8', '#ffd25e', '#f5b52e', '#fff4cf'];
const SPECTRUM = ['#ff5fa2', '#ffb341', '#ffe45c', '#5ee38a', '#4cc9ff', '#7c7bff', '#c86bff'];

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function AttendBurst({ a, api, onDone }: { a: Attend; api: Api | null; onDone: () => void }) {
  const stage = a.stage;
  const [closing, setClosing] = useState(false);
  const [num, setNum] = useState(reduced() ? a.reward : 0);
  const gem = useRef<HTMLDivElement>(null);
  const done = useRef(false);
  // 일주일 칸: 연속 일수만큼 (7일부터는 늘 다 찬다)
  const inWeek = Math.min(a.streak, 7);
  // 서버가 등급 배율을 곱해 보낸다 → 내일 값도 같은 배율로
  const rate = a.base / attendBase(a.streak);
  const next = Math.round(attendReward(a.streak + 1) * rate);
  const nextMs = Object.keys(ATTEND.milestones).map(Number).find((d) => d > a.streak);
  const nextText = nextMs === a.streak + 1 ? ' · 보너스 포함' : nextMs && nextMs - a.streak <= 7 ? ` · ${nextMs}일째에 보너스` : '';

  const shards = useMemo(() => {
    const n = SHARDS[stage];
    const palette = stage >= 4 ? [...GOLD, ...SPECTRUM] : GOLD;
    return Array.from({ length: n }, (_, i) => {
      const ang = (i / n) * 360 + (i % 2 ? 9 : -9);
      const dist = 120 + ((i * 47) % 90) + stage * 14;
      return { ang, dist, size: 6 + ((i * 13) % 9) + (stage >= 3 ? 3 : 0), color: palette[i % palette.length], delay: ((i * 37) % 120) / 1000, rot: (i * 71) % 360, kind: stage >= 5 && i % 3 === 0 ? 'conf' : 'gem' };
    });
  }, [stage]);

  const close = () => {
    if (done.current) return;
    done.current = true;
    setClosing(true);
    const r = gem.current?.getBoundingClientRect();
    window.setTimeout(() => {
      const wait = r && !reduced() ? flyPieces(r, a.reward) : 0;
      window.setTimeout(() => { if (api) void refreshPieces(api, 900); }, Math.max(0, wait));
      onDone();
    }, reduced() ? 0 : 260);
  };

  // 숫자 차오름 · 저절로 닫힘
  useEffect(() => {
    if (reduced()) { const t = window.setTimeout(close, 2600); return () => window.clearTimeout(t); }
    let raf = 0;
    const t0 = performance.now() + 380, dur = 700 + stage * 80;
    const step = (t: number) => { const k = Math.min(1, Math.max(0, (t - t0) / dur)); setNum(Math.round(a.reward * (1 - (1 - k) ** 3))); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    const t = window.setTimeout(close, HOLD[stage] + (a.bonus ? 600 : 0));
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    addEventListener('keydown', esc);
    return () => { cancelAnimationFrame(raf); window.clearTimeout(t); removeEventListener('keydown', esc); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 한 번만
  }, []);

  return createPortal(
    <div className={`att s${stage} ${a.bonus ? 'ms' : ''} ${closing ? 'out' : ''}`} role="dialog" aria-modal="true" aria-label={`출석 ${a.streak}일째, ${a.reward} 피스`}>
      <button type="button" className="att-scrim" aria-label="닫기" onClick={close} />
      <div className="att-stage" onClick={close}>
        {stage >= 3 && <span className="att-rays" aria-hidden="true" />}
        <span className="att-halo" aria-hidden="true" />
        <span className="att-ring r1" aria-hidden="true" />
        {stage >= 4 && <span className="att-ring r2" aria-hidden="true" />}
        {shards.map((p, i) => (
          <i key={i} className={`att-shard ${p.kind}`} aria-hidden="true"
            style={{ '--a': `${p.ang}deg`, '--d': `${p.dist}px`, '--s': `${p.size}px`, '--c': p.color, '--r': `${p.rot}deg`, animationDelay: `${0.22 + p.delay}s` } as CSSProperties} />
        ))}
        <div className="att-card">
          {stage >= 5 && <span className="att-crown" aria-hidden="true"><svg viewBox="0 0 40 24" width="40" height="24"><path d="M2 22 6 6l9 8 5-12 5 12 9-8 4 16z" /></svg></span>}
          <span className="att-kicker">{STAGE_NAME[stage]}</span>
          <div className="att-gem" ref={gem}><PieceIcon size={stage >= 3 ? 64 : 56} /></div>
          <b className="att-num">+{num.toLocaleString()}</b>
          <span className="att-streak"><b>{a.streak}</b>일 연속 출석</span>
          {a.bonus > 0 && <span className="att-ribbon">{a.streak}일 달성 보너스 +{a.bonus.toLocaleString()}</span>}
          <div className="att-week" aria-hidden="true">
            {Array.from({ length: 7 }, (_, i) => <i key={i} className={`${i < inWeek ? 'on' : ''} ${i === inWeek - 1 ? 'today' : ''}`} style={{ animationDelay: `${0.5 + i * 0.07}s` }} />)}
          </div>
          <span className="att-next">내일도 오면 +{next}{nextText}</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
