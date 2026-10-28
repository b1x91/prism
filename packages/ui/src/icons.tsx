/** 선 아이콘 (24 격자). 브랜드 로고(디스코드·카카오)는 단순화한 모양 */
import type { ReactElement, SVGProps } from 'react';

const P: Record<string, ReactElement> = {
  shield: <><path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6z" /><path d="m8.8 12 2.2 2.2 4.2-4.4" /></>,
  swords: <><path d="M14.5 17.5 3 6V3h3l11.5 11.5" /><path d="m13 19 6-6M16 16l4 4M19 21l2-2" /><path d="M9.5 6.5 14 2h3v3l-4.5 4.5" /><path d="m5 14 4 4M7 17l-3 3M3 19l2 2" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  spark: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />,
  grid: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>,
  book: <><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 19V5" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7" /><path d="M18 14.5a6.5 6.5 0 0 1 3.5 5.5" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  logout: <><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 17l-5-5 5-5M5 12h11" /></>,
  out: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
  check: <path d="M5 12.5 10 17 19 7" />,
  refresh: <><path d="M20 11a8 8 0 0 0-14.5-4.6L4 8" /><path d="M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14.5 4.6L20 16" /><path d="M20 20v-4h-4" /></>,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  compare: <><path d="M4 7h11M4 7l3-3M4 7l3 3" /><path d="M20 17H9M20 17l-3-3M20 17l-3 3" /></>,
  lock: <><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.6v.4" /></>,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  back: <path d="M19 12H5M11 6l-6 6 6 6" />,
  arrowDown: <path d="M12 5v14M6 13l6 6 6-6" />,
  arrowUp: <path d="M12 19V5M6 11l6-6 6 6" />,
  pin: <><path d="M9 4h6l-1 5 3 3v2H7v-2l3-3z" /><path d="M12 14v6" /></>,
  megaphone: <><path d="M4 10v4h3l7 4V6L7 10z" /><path d="M17.5 9.5a3.5 3.5 0 0 1 0 5" /><path d="M7 14l1.5 5h2.5L10 15" /></>,
  bell: <><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>,
  shuffle: <><path d="M16 4h4v4M4 20 20 4" /><path d="M20 16v4h-4M14 14l6 6" /><path d="M4 4l5 5" /></>,
  game: <><rect x="2.5" y="7" width="19" height="11" rx="4" /><path d="M7 11v3M5.5 12.5h3M15.5 12h.01M18 13.5h.01" /></>,
  trophy: <><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M16 6h3a3 3 0 0 1-3 4M8 6H5a3 3 0 0 0 3 4" /><path d="M12 13v4M8.5 20h7M10 17h4" /></>,
  download: <><path d="M12 4v11M7 10l5 5 5-5" /><path d="M5 19h14" /></>,
  chevL: <path d="M15 5l-7 7 7 7" />,
  chevR: <path d="M9 5l7 7-7 7" />,
  bag: <><path d="M5 8h14l-1 12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>,
  link: <><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" /><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" /></>,
  edit: <><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z" /><path d="M13.5 6.5l4 4" /></>,
  trash: <><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></>,
  chevD: <path d="M6 9l6 6 6-6" />,
  star: <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />,
  target: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r=".8" fill="currentColor" /></>,
  gift: <><rect x="3.5" y="8.5" width="17" height="4" rx="1" /><path d="M5 12.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7.5M12 8.5V21" /><path d="M12 8.5C10.5 5 7 4.5 7 6.6c0 1.6 2.4 1.9 5 1.9M12 8.5c1.5-3.5 5-4 5-1.9 0 1.6-2.4 1.9-5 1.9" /></>,
  mail: <><rect x="3" y="5.5" width="18" height="13" rx="2" /><path d="M3.5 7l8.5 6 8.5-6" /></>,
  send: <path d="M20.5 3.5L10 14M20.5 3.5l-6.5 17-4-6.5-6.5-4 17-6.5z" />,
  box: <><path d="M3.5 8 12 4l8.5 4v8L12 20l-8.5-4z" /><path d="M3.5 8 12 12l8.5-4M12 12v8" /></>,
  frame: <><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><rect x="7" y="8" width="10" height="8" rx="1" /></>,
  chart: <><path d="M4 20V4M4 20h16" /><path d="M8 16v-4M12 16V8M16 16v-6" /></>,
  login: <><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 17l5-5-5-5M15 12H4" /></>,
};
const FILLED: Record<string, ReactElement> = {
  discord: <path d="M19.6 5.6A16.5 16.5 0 0 0 15.5 4.3l-.5 1a15 15 0 0 0-6 0l-.5-1a16.5 16.5 0 0 0-4.1 1.3C1.8 9.4 1.1 13.1 1.4 16.8a16.6 16.6 0 0 0 5 2.5l1.1-1.7a10.6 10.6 0 0 1-1.7-.8l.4-.3a11.8 11.8 0 0 0 11.6 0l.4.3c-.5.3-1.1.6-1.7.8l1.1 1.7a16.5 16.5 0 0 0 5-2.5c.4-4.3-.6-8-3-11.2zM8.7 14.6c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2zm6.6 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2z" />,
  windows: <path d="M3 5.5 10.5 4.4v7.1H3zM11.5 4.3 21 3v8.5h-9.5zM3 12.5h7.5v7.1L3 18.5zM11.5 12.5H21V21l-9.5-1.3z" />,
  talk: <path d="M12 3.5C6.8 3.5 2.5 6.8 2.5 11c0 2.7 1.8 5 4.5 6.4l-.9 3.4c-.1.4.3.7.6.5l4-2.7c.4 0 .9.1 1.3.1 5.2 0 9.5-3.3 9.5-7.6S17.2 3.5 12 3.5z" />,
};

export type IconName = keyof typeof P | keyof typeof FILLED;
export function Icon({ name, ...rest }: { name: IconName } & SVGProps<SVGSVGElement>) {
  const filled = name in FILLED;
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" {...(filled ? { fill: 'currentColor' } : { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' })} {...rest}>
      {filled ? FILLED[name] : P[name]}
    </svg>
  );
}
