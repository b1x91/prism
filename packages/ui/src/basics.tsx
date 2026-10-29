import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AUGMENT, CHAMPIONS, cdragon, champIcon, augIcon, loadSkins, withDefaults, PRESENCE_LABEL, type DiscordRole, type Links, type Presence, type Skin, josa } from '@prism/core';
import { Icon, type IconName } from './icons';
import { imgIn } from './skeleton';

export function Gem({ size = 28, float, src = '/brand/prism-64.png' }: { size?: number; float?: boolean; src?: string }) {
  return <span className={`gem${float ? ' float' : ''}`} style={{ ['--size' as string]: `${size}px` }}><img src={src} alt="" /></span>;
}

/** 빛 한 줄기가 보석을 지나 일곱 색으로 갈라지는 장면 (첫 화면 전용) */
export function Refraction({ gem = 120 }: { gem?: number }) {
  const colors = [1, 2, 3, 4, 5, 6, 7].map((i) => `var(--spectrum-${i})`);
  return (
    <div className="refract">
      <svg className="rays" viewBox="0 0 800 500" preserveAspectRatio="none" aria-hidden="true">
        <line className="in" x1="-40" y1="330" x2="328" y2="250" />
        <line className="in glowline" x1="-40" y1="330" x2="328" y2="250" />
        {colors.map((c, i) => <line key={i} className="out" stroke={c} x1="330" y1="250" x2="860" y2={70 + i * 52} />)}
      </svg>
      <div className="gem-at"><Gem size={gem} float src="/brand/prism-256.png" /></div>
    </div>
  );
}

export function ChampImg({ id, size = 40, className = '' }: { id: number; size?: number; className?: string }) {
  return <img className={`champ fi ${className}`} {...imgIn} src={champIcon(id)} width={size} height={size} alt={CHAMPIONS[id]?.name ?? ''} loading="lazy" />;
}
export function AugImg({ id, size = 36 }: { id: number; size?: number }) {
  return <img className="aug fi" {...imgIn} src={augIcon(id)} width={size} height={size} alt={AUGMENT[id]?.name ?? ''} loading="lazy" />;
}

export function Empty({ children, action, className = '' }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return <div className={`empty ${className}`}><Gem /><div>{children}</div>{action}</div>;
}

/** 아이콘만 있는 작은 버튼. 이름은 마우스를 올리면(title) · 화면 읽기(aria-label)로 */
export function IconBtn({ icon, label, onClick, tone, done, armed, disabled }: { icon: IconName; label: string; onClick: (e: ReactMouseEvent<HTMLButtonElement>) => void; tone?: 'go' | 'danger'; done?: boolean; armed?: boolean; disabled?: boolean }) {
  return <button type="button" className={`ibtn ${tone ?? ''} ${done ? 'done' : ''} ${armed ? 'armed' : ''}`} title={label} aria-label={label} onClick={onClick} disabled={disabled}><Icon name={done ? 'check' : icon} /></button>;
}

/** 어두운 배너 위 아이콘 버튼: 좋아요 하트 알약과 같은 높이·둥근 모서리·유리 바탕 (v3.52). 이름은 마우스를 올리면 */
export function GlassBtn({ icon, label, onClick, href, as: Link }: { icon: IconName; label: string; onClick?: () => void; href?: string; as?: (p: { to: string; className: string; title: string; 'aria-label': string; children: ReactNode }) => ReactNode }) {
  const inner = <Icon name={icon} />;
  if (href && Link) return <>{Link({ to: href, className: 'glass-ib', title: label, 'aria-label': label, children: inner })}</>;
  return <button type="button" className="glass-ib" title={label} aria-label={label} onClick={onClick}>{inner}</button>;
}

/**
 * 드롭다운 (브라우저 기본 select 대신, 앱 전체 공용). 눌러서 열고, 바깥·Esc 로 닫힌다. 위아래 화살표·Enter 로도 고른다.
 * 아래에 자리가 모자라면 위로 펼치고, 양쪽 다 모자라면 칸 안에서 스크롤 — 목록이 화면 밖으로 나가 페이지가 길어지지 않게.
 */
export function Select<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ up: boolean; max: number }>({ up: false, max: 0 });
  const cur = options.find(([k]) => k === value);
  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const need = options.length * 38 + 12, below = innerHeight - r.bottom - 12, above = r.top - 12;
    const up = below < need && above > below;
    setPlace({ up, max: Math.max(120, Math.min(need, up ? above : below)) });
  }, [open, options.length]);
  useEffect(() => {
    if (!open) return;
    setHi(Math.max(0, options.findIndex(([k]) => k === value)));
    const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    addEventListener('mousedown', off);
    return () => removeEventListener('mousedown', off);
  }, [open, options, value]);
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      setHi((h) => (h + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length);
    }
    if ((e.key === 'Enter' || e.key === ' ') && open) { e.preventDefault(); onChange(options[hi][0]); setOpen(false); }
  };
  return (
    <div className={`sel ${open ? 'open' : ''}`} ref={ref} onKeyDown={key}>
      <button type="button" className="sel-btn" aria-haspopup="listbox" aria-expanded={open} aria-label={label} onClick={() => setOpen(!open)}>
        <span>{cur?.[1]}</span><Icon name="chevD" />
      </button>
      {open && <div className={`sel-pop ${place.up ? 'up' : ''}`} style={place.max ? { maxHeight: place.max } : undefined} role="listbox" aria-label={label}>
        {options.map(([k, l], i) => (
          <button key={k} type="button" role="option" aria-selected={k === value} className={`sel-opt ${k === value ? 'on' : ''} ${i === hi ? 'hi' : ''}`} onMouseEnter={() => setHi(i)} onClick={() => { onChange(k); setOpen(false); }}>
            <span>{l}</span>{k === value && <Icon name="check" />}
          </button>
        ))}
      </div>}
    </div>
  );
}

/** 켜기·끄기 스위치 (지금 상태가 한눈에 보이게). 오른쪽 = 켜짐 */
export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={`toggle ${on ? 'on' : ''}`} disabled={disabled} onClick={() => onChange(!on)}><i /></button>;
}

/** 고르기 탭: 고른 표시가 다음 칸으로 미끄러져 간다 (v3.51). 재기 전 첫 그림은 칸 자체의 바탕으로 */
export function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [ind, setInd] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const el = box.current?.querySelector<HTMLButtonElement>('button.on');
      if (el) setInd({ x: el.offsetLeft, w: el.offsetWidth });
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' && box.current ? new ResizeObserver(measure) : null;
    if (ro && box.current) ro.observe(box.current);
    return () => ro?.disconnect();
  }, [value, options.length]);
  return (
    <div ref={box} className={`seg ${ind ? 'live' : ''}`}>
      {ind && <span className="seg-ind" aria-hidden="true" style={{ transform: `translateX(${ind.x}px)`, width: ind.w }} />}
      {options.map(([k, l]) => <button key={k} type="button" className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{l}</button>)}
    </div>
  );
}

/** 디스코드·카카오톡 앱 아이콘 (글자 없이 아이콘만). 앱에서는 onOpen 으로 브라우저를 연다 */
const DISCORD_PATH = 'M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z';
export function DiscordGlyph() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d={DISCORD_PATH} /></svg>; }
export function KakaoGlyph() {
  const id = `kk${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  // 말풍선에서 TALK 글자를 뚫어 낸 한 가지 색 아이콘 (어떤 바탕에서도 같은 모양)
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <mask id={id}>
        <rect width="24" height="24" fill="#fff" />
        <text x="12" y="13.1" textAnchor="middle" fontSize="4.6" fontWeight="900" fontFamily="Arial, sans-serif" fill="#000" letterSpacing=".1">TALK</text>
      </mask>
      <path fill="currentColor" mask={`url(#${id})`} d="M12 3.6c-5.3 0-9.6 3.4-9.6 7.6 0 2.7 1.8 5.1 4.5 6.4l-1 3.6c-.1.3.3.6.6.4l4.3-2.8c.4 0 .8.1 1.2.1 5.3 0 9.6-3.4 9.6-7.7S17.3 3.6 12 3.6z" />
    </svg>
  );
}

/**
 * 카카오톡 오픈채팅은 PC 에서 작은 팝업 창(460×720, 브라우저 창 가운데)으로 연다 — 전체 페이지로 크게 뜨면 부담 (v3.59).
 * 휴대폰·터치 기기는 그대로 이동해 카카오톡 앱이 받게 둔다. 팝업이 막히면 새 탭으로.
 */
function kakaoClick(e: ReactMouseEvent<HTMLAnchorElement>) {
  if (typeof window === 'undefined' || !window.matchMedia('(pointer: fine)').matches || window.innerWidth < 768) return;
  e.preventDefault();
  const w = 460, h = 720;
  const left = Math.round(window.screenX + (window.outerWidth - w) / 2), top = Math.round(window.screenY + (window.outerHeight - h) / 2);
  const pop = window.open(e.currentTarget.href, 'prism-kakao', `popup=yes,width=${w},height=${h},left=${left},top=${top}`);
  if (!pop) window.open(e.currentTarget.href, '_blank', 'noopener');
}

export function ChannelIcons({ links, size = 36, onOpen }: { links?: Links | null; size?: number; onOpen?: (url: string) => void }) {
  const l = withDefaults(links);
  const st = { width: size, height: size };
  const item = (url: string | null, cls: string, name: string, glyph: ReactNode) => {
    if (!url) return <span className={`chi ${cls} soon`} style={st} title={`${name} · 곧 열립니다`} aria-label={`${name} (곧 열림)`}>{glyph}</span>;
    return onOpen
      ? <button type="button" className={`chi ${cls}`} style={st} title={name} aria-label={name} onClick={() => onOpen(url)}>{glyph}</button>
      : <a className={`chi ${cls}`} style={st} href={url} target="_blank" rel="noopener noreferrer" title={name} aria-label={name} onClick={cls === 'kakao' ? kakaoClick : undefined}>{glyph}</a>;
  };
  return <div className="chis">{item(l.discord, 'discord', '디스코드', <DiscordGlyph />)}{item(l.kakao, 'kakao', '카카오톡', <KakaoGlyph />)}</div>;
}

/** 모임 화면 오른쪽 위: 디스코드 · 카카오톡 (아이콘 + 이름, 한 곳에만) */
export function ChannelButtons({ links, onOpen }: { links?: Links | null; onOpen?: (url: string) => void }) {
  const l = withDefaults(links);
  const item = (url: string | null, cls: string, name: string, glyph: ReactNode) => {
    if (!url) return <span className={`chb ${cls} soon`} title={`${name} · 곧 열립니다`}>{glyph}{name}</span>;
    return onOpen
      ? <button type="button" className={`chb ${cls}`} onClick={() => onOpen(url)}>{glyph}{name}</button>
      : <a className={`chb ${cls}`} href={url} target="_blank" rel="noopener noreferrer" onClick={cls === 'kakao' ? kakaoClick : undefined}>{glyph}{name}</a>;
  };
  return <div className="chbs">{item(l.discord, 'discord', '디스코드', <DiscordGlyph />)}{item(l.kakao, 'kakao', '카카오톡', <KakaoGlyph />)}</div>;
}

/** (옛 이름) 모임 소통 창구 = 앱 아이콘만 */
export function Channels({ links, size }: { links?: Links | null; size?: 'lg' }) {
  return <ChannelIcons links={links} size={size === 'lg' ? 48 : 36} />;
}

const TONES = ['#5b6b8c', '#6b5b8c', '#5b8c7f', '#8c6b5b', '#7f8c5b', '#5b7f8c', '#8c5b6b', '#6b7a99'];
export function Initial({ nick, size = 32 }: { nick: string; size?: number }) {
  let h = 0;
  for (const c of nick) h = (h * 31 + (c.codePointAt(0) ?? 0)) >>> 0;
  return <span className="initial" style={{ background: TONES[h % TONES.length], width: size, height: size }}>{[...nick][0] ?? '?'}</span>;
}

/** 테마: 시스템 설정 따라감(기본) / 밝게 / 어둡게. 고르면 기억한다 */
export type ThemeMode = 'system' | 'light' | 'dark';
export function getThemeMode(): ThemeMode {
  try { const t = localStorage.getItem('prism-theme'); return t === 'light' || t === 'dark' ? t : 'system'; } catch { return 'system'; }
}
export function setThemeMode(m: ThemeMode) {
  if (m === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', m);
  try { if (m === 'system') localStorage.removeItem('prism-theme'); else localStorage.setItem('prism-theme', m); } catch { /* 저장소 없음 */ }
}
/** 테마 전환 (시스템 따라감 → 직접 고르면 기억) */
export function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('prism-theme', next); } catch { /* 저장소 없음 */ }
}
export function restoreTheme() {
  try { const t = localStorage.getItem('prism-theme'); if (t) document.documentElement.setAttribute('data-theme', t); } catch { /* 저장소 없음 */ }
}

/** 스킨 목록 (처음 필요할 때 한 번만 불러온다. 여러 곳에서 불러도 실제로는 한 번) */
export function useSkins() {
  const [s, setS] = useState<Record<number, Skin> | null>(null);
  useEffect(() => { let on = true; loadSkins().then((x) => on && setS(x)).catch(() => {}); return () => { on = false; }; }, []);
  return s;
}

/**
 * 회원 얼굴 (모든 회원 표시는 이것 하나로): 대표 스킨 타일 → 주 챔피언 → 이니셜.
 * skins 를 넘기지 않으면 알아서 불러온다.
 */
/** 회원 얼굴 그림 주소 (대표 스킨 → 주 챔프, 없으면 '') */
export const faceSrc = (skin: number | null | undefined, champion: number | null | undefined, sk: Record<number, Skin> | null | undefined) =>
  skin && sk?.[skin]?.tile ? sk[skin].tile : champion ? cdragon(CHAMPIONS[champion]?.tile) : '';

export function MemberFace({ nick, skin, champion, size = 40, skins }: { nick: string; skin?: number | null; champion?: number | null; size?: number; skins?: Record<number, Skin> | null }) {
  const loaded = useSkins();
  const src = faceSrc(skin, champion, skins ?? loaded);
  return src ? <img className="face fi" {...imgIn} src={src} width={size} height={size} alt="" loading="lazy" style={{ width: size, height: size }} /> : <Initial nick={nick} size={size} />;
}

/** 접속 상태 점 하나 (웹 회색 · 앱 파랑 · 게임 주황 · 앱+게임 초록). 접속 안 함이면 그리지 않는다 */
export function PresenceDot({ p, title }: { p?: Presence | null; title?: string }) {
  if (!p || p === 'off') return null;
  return <i className={`pdot ${p}`} title={title ?? PRESENCE_LABEL[p]} aria-label={title ?? PRESENCE_LABEL[p]} />;
}
/** 얼굴 오른쪽 아래에 접속 점 */
export function FacePresence({ p, title, children }: { p?: Presence | null; title?: string; children: ReactNode }) {
  return <span className="fp">{children}<PresenceDot p={p} title={title} /></span>;
}
/** 점 + 글자 (회원 페이지 머리). 롤이 켜져 있을 때만 '온라인', 앱·웹은 점 색으로만 */
export function PresenceTag({ p }: { p?: Presence | null }) {
  if (!p || p === 'off') return null;
  return <span className={`prtag ${p === 'game' || p === 'both' ? '' : 'dot'}`} title={PRESENCE_LABEL[p]}><PresenceDot p={p} />{p === 'game' || p === 'both' ? '온라인' : null}</span>;
}

/** 디스코드 역할 배지 (디스코드와 같은 색) */
/** 승인 대기 칩 (v3.107): 운영진 승인 전 회원의 이름 옆. dark = 어두운 무대·그림 위 */
export function PendingChip({ dark }: { dark?: boolean }) {
  return <span className={`wait-chip ${dark ? 'dark' : ''}`} title="운영진 승인을 기다리고 있어요">승인대기</span>;
}

export function RoleBadge({ role, small }: { role?: DiscordRole | null; small?: boolean }) {
  if (!role) return null;
  return <span className={`role-badge ${small ? 'sm' : ''}`} style={{ ['--rc' as string]: role.color }}><i />{role.name}</span>;
}

// ───────── 마우스를 올리면 뜨는 설명 (카드 밖으로 잘리지 않게 화면 맨 위 층에 띄운다) ─────────

export function Hover({ tip, children, className = '' }: { tip: ReactNode | (() => ReactNode); children: ReactNode; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const show = () => { const r = ref.current?.getBoundingClientRect(); if (r) { setPos(null); setRect(r); } };
  const hide = () => { setRect(null); setPos(null); };
  // 설명 상자를 그린 뒤 실제 크기를 재서 화면 안에 들어오게 둔다: 위에 자리가 있으면 위, 없으면 아래, 둘 다 모자라면 화면 안으로 밀어 넣는다
  useLayoutEffect(() => {
    const el = box.current;
    if (!rect || !el) return;
    const w = el.offsetWidth, h = el.offsetHeight, m = 8, gap = 8;
    const left = Math.min(Math.max(rect.left + rect.width / 2 - w / 2, m), innerWidth - w - m);
    const above = rect.top - gap - h, below = rect.bottom + gap;
    const top = above >= m ? above : below + h <= innerHeight - m ? below : Math.max(m, innerHeight - h - m);
    setPos({ left, top });
  }, [rect]);
  useEffect(() => {
    if (!rect) return;
    addEventListener('scroll', hide, true);
    return () => removeEventListener('scroll', hide, true);
  }, [rect]);
  return (
    <span ref={ref} className={`hov ${className}`} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {rect && createPortal(<div ref={box} className="tipbox" style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: 'hidden' }} role="tooltip">{typeof tip === 'function' ? tip() : tip}</div>, document.body)}
    </span>
  );
}


/** 준회원에게 잘린 목록 끝: 몇 명이 더 있는지 + 어느 등급부터 다 보이는지 */
export function LockedMore({ more, what = '전체 순위', children }: { more: number; what?: string; children?: ReactNode }) {
  if (more <= 0 && !children) return null;
  return (
    <div className="locked-more">
      {children}
      {more > 0 && <div className="lm-foot"><Icon name="lock" /><span><b>{more}명</b> 더 있어요 · <b>정회원</b>부터 {josa(what, '을/를')} 볼 수 있어요</span></div>}
    </div>
  );
}
