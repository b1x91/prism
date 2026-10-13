import { StrictMode, useEffect, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import '@prism/ui/styles.css';
import './app.css';
import { Gem, Icon, Initial, toggleTheme, useLoad, type IconName } from '@prism/ui';
import { withDefaults, type Links } from '@prism/core';
import { getState, refreshSession, start, subscribe, type State } from './controller';
import { Onboarding } from './pages/Onboarding';
import { api, bridge } from './bridge';
import { installUpdate, startUpdates, useUpdate } from './update';
import { VERSION } from './version';
import { GamePage } from './pages/Game';
import { AugmentsPage } from './pages/Augments';
import { ChampionsPage } from './pages/Champions';
import { MemberPage, RankingPage } from './pages/Members';
import { CrewPage } from './pages/Crew';
import { SettingsPage } from './pages/Settings';

const NAV: [string, string, IconName][] = [['/', '게임', 'game'], ['/champions', '챔피언', 'grid'], ['/augments', '증강', 'spark'], ['/ranking', '랭킹', 'trophy'], ['/crew', '모임', 'users'], ['/settings', '설정', 'gear']];

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
  const up = useUpdate();
  const nav = useNavigate();
  const links = withDefaults(useLoad<Links>(api, s.session.configured ? '/links' : null).data);
  const login = async () => { try { await bridge.login(); } finally { await refreshSession(); } };
  // 챔프 선택·게임이 시작되면 게임 화면으로 (Alt+Tab 했을 때 바로 보이게)
  useEffect(() => { if (s.status === 'champ-select' || s.status === 'in-game') nav('/'); }, [s.status, nav]);
  const ready = Boolean(s.me?.consent);
  // 게임 위 작은 창(자동 인식)도 동의한 뒤에만 켠다
  useEffect(() => { void bridge.visionAllow(ready); }, [ready]);
  const [label, tone] = STATUS[s.status];
  const ch = (url: string | null, cls: string, icon: IconName, name: string) => url
    ? <button type="button" className={`side-ch ${cls}`} onClick={() => bridge.openUrl(url)} title={name}><Icon name={icon} /><span>{name}</span></button>
    : <span className={`side-ch ${cls} soon`} title={`${name}은 곧 열립니다`}><Icon name={icon} /><span>{name}</span><small>준비 중</small></span>;
  if (!ready) return <Onboarding s={s} onLogin={login} />;
  return (
    <div className="shell">
      <aside className="side">
        <div className="side-brand"><Gem size={28} float /><b>Prism</b></div>
        <div className="side-ver">
          <span>v{VERSION}</span>
          {up.info?.available && <button type="button" className="btn sm primary" disabled={up.installing} onClick={installUpdate} title={up.error ?? `새 버전 ${up.info.latest}`}>{up.installing ? '받는 중…' : `${up.info.latest} 업데이트`}</button>}
        </div>
        {up.error && up.info?.available && <span className="side-err l">{up.error}</span>}
        <nav className="side-nav">{NAV.map(([to, l, i]) => <NavLink key={to} to={to} end={to === '/'}><Icon name={i} />{l}</NavLink>)}</nav>
        <span className="sp" />
        {<div className="side-chs">{ch(links.discord, 'discord', 'discord', '디스코드')}{ch(links.kakao, 'kakao', 'talk', '카카오톡')}</div>}
        <div className={`side-status ${tone}`}><span className="dot" />{label}{s.summoner && <span className="meta">{s.summoner.riotId.split('#')[0]}</span>}</div>
        <div className="side-foot">
          {s.me ? <NavLink to="/me" className="side-me" title="내 페이지"><Initial nick={s.me.nick} size={28} /><span>{s.me.nick}</span></NavLink>
            : s.session.configured ? <button type="button" className="btn sm primary" onClick={login}><Icon name="discord" />로그인</button> : <span />}
          <button type="button" className="icon-btn" title="테마 바꾸기" onClick={toggleTheme}><Icon name="moon" /></button>
        </div>
      </aside>
      <main className="main">
        <Routes>
          <Route index element={<GamePage s={s} />} />
          <Route path="champions" element={<ChampionsPage member={!!s.me} />} />
          <Route path="champions/:id" element={<ChampionsPage member={!!s.me} />} />
          <Route path="augments" element={<AugmentsPage />} />
          <Route path="augments/:id" element={<AugmentsPage />} />
          <Route path="ranking" element={<RankingPage s={s} onLogin={login} />} />
          <Route path="me" element={<MemberPage s={s} onLogin={login} />} />
          <Route path="members/:id" element={<MemberPage s={s} onLogin={login} />} />
          <Route path="crew" element={<CrewPage s={s} onLogin={login} />} />
          <Route path="settings" element={<SettingsPage s={s} onLogin={login} />} />
          <Route path="*" element={<GamePage s={s} />} />
        </Routes>
      </main>
    </div>
  );
}

start();
startUpdates();
createRoot(document.getElementById('root')!).render(<StrictMode><HashRouter><App /></HashRouter></StrictMode>);
