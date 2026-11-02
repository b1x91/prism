/**
 * 허브 탭 (CLAUDE.md v3.142 → v3.143, 시안 A): 메뉴 하나로 묶은 화면(성장 = 도감·미션·랭킹, 멤버 = 멤버·소식·초대)의
 * 맨 위 머리 — 작은 허브 이름 · 큰 제목(지금 탭) · 글자 탭 한 줄. 고른 탭 밑의 선이 옆으로 미끄러져 간다.
 * 탭이 제목을 대신하므로 그 화면 자체의 제목(`hub-h`)은 숨긴다.
 */
import { useLayoutEffect, useRef } from 'react';
import type { Hub } from './navgroups';
import { LiveDot } from './basics';

/** 탭을 옮겨도 밑줄이 이전 자리에서 미끄러지도록 마지막 위치를 허브마다 기억 */
const lastInk = new Map<string, [number, number]>();

export function HubTabs({ hub, path, onGo, dots, counts, live, hide }: {
  hub: Hub; path: string; onGo: (to: string) => void;
  /** 새 소식처럼 점을 붙일 탭 */ dots?: Record<string, boolean>;
  /** 받을 보상처럼 숫자를 붙일 탭 */ counts?: Record<string, number>;
  /** NOW 가 돌아가는 탭 → LIVE (v3.144) */ live?: Record<string, number>;
  /** 이 사람에게 보이지 않는 탭 */ hide?: (to: string) => boolean;
}) {
  const tabs = hub.tabs.filter((t) => !hide?.(t.to));
  const cur = tabs.find((t) => path === t.to || path.startsWith(`${t.to}/`));
  const box = useRef<HTMLDivElement>(null);
  const ink = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = box.current?.querySelector<HTMLElement>('button.on');
    const bar = ink.current;
    if (!el || !bar) return;
    const prev = lastInk.get(hub.key);
    const next: [number, number] = [el.offsetLeft, el.offsetWidth];
    if (prev && (prev[0] !== next[0] || prev[1] !== next[1])) {
      bar.style.transition = 'none';
      bar.style.transform = `translateX(${prev[0]}px)`; bar.style.width = `${prev[1]}px`;
      void bar.offsetWidth;
      bar.style.transition = '';
    }
    bar.style.transform = `translateX(${next[0]}px)`; bar.style.width = `${next[1]}px`;
    lastInk.set(hub.key, next);
  }, [cur?.to, hub.key, tabs.length]);
  if (tabs.length < 2 || !cur) return null;
  return (
    <header className="hubhead">
      <span className="hh-kick">{hub.label}</span>
      {/* 제목과 탭을 한 줄로 (v3.146): 고른 탭이 곧 제목. 읽기 프로그램용 제목만 따로 */}
      <h1 className="sr-only">{cur.label}</h1>
      <div className="hh-tabs" role="tablist" aria-label={hub.label} ref={box}>
        {tabs.map((t) => {
          const on = t.to === cur.to;
          const n = counts?.[t.to] ?? 0;
          return (
            <button key={t.to} type="button" role="tab" aria-selected={on} title={t.hint} className={on ? 'on' : ''} onClick={() => { if (path !== t.to) onGo(t.to); }}>
              {(live?.[t.to] ?? 0) > 0 ? <><span className="live-text">{t.label}</span><LiveDot n={live![t.to]} /></> : t.label}
              {(live?.[t.to] ?? 0) > 0 ? null : n > 0 ? <span className="hh-cnt">{n}</span> : dots?.[t.to] ? <i className="hh-dot" aria-label="새 소식" /> : null}
            </button>
          );
        })}
        <span className="hh-ink" ref={ink} aria-hidden="true" />
      </div>
    </header>
  );
}
