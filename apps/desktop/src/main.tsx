import { StrictMode, useEffect, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import '@prism/ui/styles.css';
import './app.css';
import { Gem, Icon, Initial, toggleTheme, useLoad, type IconName } from '@prism/ui';
import { withDefaults, type Links } from '@prism/core';
import { getState, refreshSession, start, subscribe, type State } from './controller';
import { api, bridge } from './bridge';
import { GamePage } from './pages/Game';
import { AugmentsPage } from './pages/Augments';
import { CrewPage } from './pages/Crew';
import { SettingsPage } from './pages/Settings';

const NAV: [string, string, IconName][] = [['/', '게임', 'game'], ['/augments', '증강', 'spark'], ['/crew', '모임', 'users'], ['/settings', '설정', 'gear']];

const STATUS: Record<State['status'], [string, string]> = {
  starting: ['준비 중', ''],
  'no-client': ['클라이언트 꺼짐', ''],
  idle: ['대기 중', 'ok'],
  'champ-select': ['챔프 선택', 'live'],
  'in-game': ['게임 중', 'live'],
  error: ['연결 오류', 'bad'],
};

function App() {
  const s = useSyncExternalStore(subscribe, getState);
  const nav = useNavigate();
  const links = withDefaults(useLoad<Links>(api, s.session.configured ? '/links' : null).data);
  const login = async () => { try { await bridge.login(); } finally { await refreshSession(); } };
  // 챔프 선택·게임이 시작되면 게임 화면으로 (Alt+Tab 했을 때 바로 보이게)
  useEffect(() => { if (s.status === 'champ-select' || s.status === 'in-game') nav('/'); }, [s.status, nav]);
  const [label, tone] = STATUS[s.status];
  const ch = (url: string | null, cls: string, icon: IconName, name: string) => url
    ? <button type="button" className={`side-ch ${cls}`} onClick={() => bridge.openUrl(url)} title={name}><Icon name={icon} /><span>{name}</span></button>
    : <span className={`side-ch ${cls} soon`} title={`${name}은 곧 열립니다`}><Icon name={icon} /><span>{name}</span><small>준비 중</small></span>;
  return (
    <div className="shell">
      <aside className="side">
        <div className="side-brand"><Gem size={28} float /><b>Prism</b></div>
        <nav className="side-nav">{NAV.map(([to, l, i]) => <NavLink key={to} to={to} end={to === '/'}><Icon name={i} />{l}</NavLink>)}</nav>
        <span className="sp" />
        {<div className="side-chs">{ch(links.discord, 'discord', 'discord', '디스코드')}{ch(links.kakao, 'kakao', 'talk', '카카오톡')}</div>}
        <div className={`side-status ${tone}`}><span className="dot" />{label}{s.summoner && <span className="meta">{s.summoner.riotId.split('#')[0]}</span>}</div>
        <div className="side-foot">
          {s.me ? <NavLink to="/settings" className="side-me"><Initial nick={s.me.nick} size={28} /><span>{s.me.nick}</span></NavLink>
            : s.session.configured ? <button type="button" className="btn sm primary" onClick={login}><Icon name="discord" />로그인</button> : <span />}
          <button type="button" className="icon-btn" title="테마 바꾸기" onClick={toggleTheme}><Icon name="moon" /></button>
        </div>
      </aside>
      <main className="main">
        <Routes>
          <Route index element={<GamePage s={s} />} />
          <Route path="augments" element={<AugmentsPage lastChampion={s.lastChampion} member={!!s.me} />} />
          <Route path="crew" element={<CrewPage s={s} onLogin={login} />} />
          <Route path="settings" element={<SettingsPage s={s} onLogin={login} />} />
          <Route path="*" element={<GamePage s={s} />} />
        </Routes>
      </main>
    </div>
  );
}

start();
createRoot(document.getElementById('root')!).render(<StrictMode><HashRouter><App /></HashRouter></StrictMode>);
