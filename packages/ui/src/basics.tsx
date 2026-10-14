import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AUGMENT, CHAMPIONS, cdragon, champIcon, augIcon, loadSkins, withDefaults, type DiscordRole, type Links, type Skin } from '@prism/core';
import { Icon } from './icons';

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
  return <img className={`champ ${className}`} src={champIcon(id)} width={size} height={size} alt={CHAMPIONS[id]?.name ?? ''} loading="lazy" />;
}
export function AugImg({ id, size = 36 }: { id: number; size?: number }) {
  return <img className="aug" src={augIcon(id)} width={size} height={size} alt={AUGMENT[id]?.name ?? ''} loading="lazy" />;
}

export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return <div className="empty"><Gem /><div>{children}</div>{action}</div>;
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return <div className="seg">{options.map(([k, l]) => <button key={k} type="button" className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{l}</button>)}</div>;
}

/** 디스코드·카카오톡 앱 아이콘 (글자 없이 아이콘만). 앱에서는 onOpen 으로 브라우저를 연다 */
const DISCORD_PATH = 'M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z';
function DiscordGlyph() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d={DISCORD_PATH} /></svg>; }
function KakaoGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M12 3.6c-5.3 0-9.6 3.4-9.6 7.6 0 2.7 1.8 5.1 4.5 6.4l-1 3.6c-.1.3.3.6.6.4l4.3-2.8c.4 0 .8.1 1.2.1 5.3 0 9.6-3.4 9.6-7.7S17.3 3.6 12 3.6z" />
      <text x="12" y="13.1" textAnchor="middle" fontSize="4.6" fontWeight="900" fontFamily="Arial, sans-serif" fill="#fee500" letterSpacing=".1">TALK</text>
    </svg>
  );
}

export function ChannelIcons({ links, size = 36, onOpen }: { links?: Links | null; size?: number; onOpen?: (url: string) => void }) {
  const l = withDefaults(links);
  const st = { width: size, height: size };
  const item = (url: string | null, cls: string, name: string, glyph: ReactNode) => {
    if (!url) return <span className={`chi ${cls} soon`} style={st} title={`${name} · 곧 열립니다`} aria-label={`${name} (곧 열림)`}>{glyph}</span>;
    return onOpen
      ? <button type="button" className={`chi ${cls}`} style={st} title={name} aria-label={name} onClick={() => onOpen(url)}>{glyph}</button>
      : <a className={`chi ${cls}`} style={st} href={url} target="_blank" rel="noopener noreferrer" title={name} aria-label={name}>{glyph}</a>;
  };
  return <div className="chis">{item(l.discord, 'discord', '디스코드', <DiscordGlyph />)}{item(l.kakao, 'kakao', '카카오톡', <KakaoGlyph />)}</div>;
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
export function MemberFace({ nick, skin, champion, size = 40, skins }: { nick: string; skin?: number | null; champion?: number | null; size?: number; skins?: Record<number, Skin> | null }) {
  const loaded = useSkins();
  const sk = skins ?? loaded;
  const src = skin && sk?.[skin]?.tile ? sk[skin].tile : champion ? cdragon(CHAMPIONS[champion]?.tile) : '';
  return src ? <img className="face" src={src} width={size} height={size} alt="" loading="lazy" style={{ width: size, height: size }} /> : <Initial nick={nick} size={size} />;
}

/** 디스코드 역할 배지 (디스코드와 같은 색) */
export function RoleBadge({ role, small }: { role?: DiscordRole | null; small?: boolean }) {
  if (!role) return null;
  return <span className={`role-badge ${small ? 'sm' : ''}`} style={{ ['--rc' as string]: role.color }}><i />{role.name}</span>;
}

// ───────── 마우스를 올리면 뜨는 설명 (카드 밖으로 잘리지 않게 화면 맨 위 층에 띄운다) ─────────

export function Hover({ tip, children, className = '' }: { tip: ReactNode | (() => ReactNode); children: ReactNode; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [at, setAt] = useState<{ x: number; y: number; below: boolean } | null>(null);
  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setAt({ x: Math.min(Math.max(r.left + r.width / 2, 160), innerWidth - 160), y: r.top < 220 ? r.bottom + 8 : r.top - 8, below: r.top < 220 });
  };
  useEffect(() => {
    if (!at) return;
    const hide = () => setAt(null);
    addEventListener('scroll', hide, true);
    return () => removeEventListener('scroll', hide, true);
  }, [at]);
  return (
    <span ref={ref} className={`hov ${className}`} onMouseEnter={show} onMouseLeave={() => setAt(null)} onFocus={show} onBlur={() => setAt(null)}>
      {children}
      {at && createPortal(<div className={`tipbox ${at.below ? 'below' : ''}`} style={{ left: at.x, top: at.y }} role="tooltip">{typeof tip === 'function' ? tip() : tip}</div>, document.body)}
    </span>
  );
}

