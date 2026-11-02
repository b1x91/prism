/**
 * 허브 탭 (CLAUDE.md v3.142): 메뉴 하나로 묶은 화면들(성장 = 도감·미션·랭킹, 멤버 = 멤버·소식·초대)의
 * 맨 위에 늘 같은 자리·같은 모양으로 놓는 큰 탭. 그림 + 이름 + 한 줄 설명이라 무엇이 어디 있는지 바로 보인다.
 */
import type { Hub } from './navgroups';
import { Icon } from './icons';

export function HubTabs({ hub, path, onGo, dots, hide }: {
  hub: Hub; path: string; onGo: (to: string) => void;
  /** 새 소식처럼 점을 붙일 탭 */ dots?: Record<string, boolean>;
  /** 이 사람에게 보이지 않는 탭 */ hide?: (to: string) => boolean;
}) {
  const tabs = hub.tabs.filter((t) => !hide?.(t.to));
  if (tabs.length < 2) return null;
  const cur = tabs.find((t) => path === t.to || path.startsWith(`${t.to}/`))?.to;
  return (
    <nav className="hubtabs" aria-label={hub.label} style={{ ['--n' as string]: tabs.length }}>
      {tabs.map((t) => {
        const on = t.to === cur;
        return (
          <button key={t.to} type="button" className={`ht ${on ? 'on' : ''}`} aria-current={on ? 'page' : undefined} onClick={() => { if (!on || path !== t.to) onGo(t.to); }}>
            <span className="ht-ic"><Icon name={t.icon} /></span>
            <span className="ht-t"><b>{t.label}</b><small>{t.hint}</small></span>
            {dots?.[t.to] && <i className="ht-dot" aria-label="새 소식" />}
          </button>
        );
      })}
    </nav>
  );
}
