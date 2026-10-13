import { useEffect, useState, type ReactNode } from 'react';
import { AUGMENT, CHAMPIONS, cdragon, champIcon, augIcon, loadSkins, withDefaults, type Links, type Skin } from '@prism/core';
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

export function Channels({ links, size }: { links?: Links | null; size?: 'lg' }) {
  const l = withDefaults(links);
  const st = size === 'lg' ? { height: 48 } : undefined;
  return (
    <div className="channels">
      {l.discord && <a className="ch discord" style={st} href={l.discord} target="_blank" rel="noopener noreferrer"><Icon name="discord" />디스코드</a>}
      {l.kakao ? <a className="ch kakao" style={st} href={l.kakao} target="_blank" rel="noopener noreferrer"><Icon name="talk" />카카오톡</a>
        : <span className="ch kakao soon" style={st} title="카카오톡 오픈채팅은 곧 열립니다"><Icon name="talk" />카카오톡<small>준비 중</small></span>}
    </div>
  );
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
