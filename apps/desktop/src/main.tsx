import { StrictMode, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, NavLink, Route, Routes, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import '@prism/ui/styles.css';
import './app.css';
import { Icon, MemberFace, useLoad, useSkins, type IconName } from '@prism/ui';
import { withDefaults, type Links } from '@prism/core';
import { getState, refreshSession, start, subscribe, type State } from './controller';
import { Onboarding } from './pages/Onboarding';
import { Splash } from './Splash';
import { api, bridge } from './bridge';
import { installUpdate, startUpdates, useUpdate } from './update';
import { VERSION } from './version';
import { GamePage } from './pages/Game';
import { AugmentsPage } from './pages/Augments';
import { ChampionsPage } from './pages/Champions';
import { MemberPage, RankingPage } from './pages/Members';
import { CrewPage } from './pages/Crew';
import { SettingsPage } from './pages/Settings';

const NAV: [string, string, IconName][] = [['/', '게임', 'game'], ['/champions', '챔피언', 'grid'], ['/augments', '증강', 'spark'], ['/ranking', '랭킹', 'trophy'], ['/crew', '모임', 'users']];

/** 롤 클라이언트 연결 상태 (사이드바 내 프로필 아래 한 줄) */
const STATUS: Record<State['status'], [string, string]> = {
  starting: ['준비 중', ''],
  'no-client': ['롤 꺼짐', ''],
  idle: ['롤 연결됨', 'ok'],
  'champ-select': ['챔프 선택 중', 'live'],
  'in-game': ['게임 중', 'live'],
  error: ['롤 연결 오류', 'bad'],
};

/** 뒤로·앞으로 (마우스 뒤로가기 버튼과 같은 기록을 쓴다) */
const hidx = () => (window.history.state as { idx?: number } | null)?.idx ?? 0;
function NavArrows() {
  const nav = useNavigate();
  useLocation();
  const type = useNavigationType();
  const max = useRef(hidx());
  const idx = hidx();
  max.current = type === 'PUSH' ? idx : Math.max(max.current, idx);
  return (
    <span className="side-arrows">
      <button type="button" disabled={idx <= 0} onClick={() => nav(-1)} title="뒤로" aria-label="뒤로"><Icon name="chevL" /></button>
      <button type="button" disabled={idx >= max.current} onClick={() => nav(1)} title="앞으로" aria-label="앞으로"><Icon name="chevR" /></button>
    </span>
  );
}

/** 화면이 바뀔 때 전환 (앞으로 가면 오른쪽에서, 뒤로 가면 왼쪽에서) */
function Page({ children, main }: { children: ReactNode; main: React.RefObject<HTMLElement | null> }) {
  const loc = useLocation();
  const idx = hidx();
  const prev = useRef(idx);
  const back = idx < prev.current;
  useEffect(() => { prev.current = idx; main.current?.scrollTo({ top: 0 }); }, [loc.pathname, idx, main]);
  return <div key={loc.pathname} className={`page ${back ? 'back' : ''}`}>{children}</div>;
}

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
  const skins = useSkins();
  const main = useRef<HTMLElement>(null);
  const riotName = s.summoner?.riotId.split('#')[0];
  const ch = (url: string | null, cls: string, icon: IconName, name: string) => url
    ? <button type="button" className={`side-ch ${cls}`} onClick={() => bridge.openUrl(url)} title={name}><Icon name={icon} /><span>{name}</span></button>
    : <span className={`side-ch ${cls} soon`} title={`${name}은 곧 열립니다`}><Icon name={icon} /><span>{name}</span><small>준비 중</small></span>;
  if (!ready) return <Onboarding s={s} onLogin={login} />;
  return (
    <div className="shell">
      <aside className="side">
        <div className="side-brand">
          <span className="brand-mark"><img src="/brand/prism-64.png" alt="" /></span>
          <span className="brand-word" data-text="Prism">Prism</span>
          <NavArrows />
        </div>
        <span className="brand-line" aria-hidden="true" />
        {up.info?.available && <button type="button" className="side-update" disabled={up.installing} onClick={installUpdate} title={up.error ?? `지금 v${VERSION}`}><span className="dot" />{up.installing ? '새 버전 받는 중…' : `새 버전 ${up.info.latest} · 업데이트`}</button>}
        {up.error && up.info?.available && <span className="side-err l">{up.error}</span>}
        <nav className="side-nav">{NAV.map(([to, l, i]) => <NavLink key={to} to={to} end={to === '/'}><Icon name={i} />{l}</NavLink>)}</nav>
        <span className="sp" />
        {<div className="side-chs">{ch(links.discord, 'discord', 'discord', '디스코드')}{ch(links.kakao, 'kakao', 'talk', '카카오톡')}</div>}
        {s.me && <div className="side-me-card">
          <NavLink to="/me" className="side-me" title="내 페이지">
            <MemberFace nick={s.me.nick} skin={s.me.skin} size={36} skins={skins} />
            <span className="who"><b>{s.me.nick}</b><span className={`st ${tone}`}><i className="dot" />{label}{riotName && riotName !== s.me.nick ? ` · ${riotName}` : ''}</span></span>
          </NavLink>
          <NavLink to="/settings" className="icon-btn gear" title="설정" aria-label="설정"><Icon name="gear" /></NavLink>
        </div>}
      </aside>
      <main className="main" ref={main}>
        <Page main={main}><Routes>
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
        </Routes></Page>
      </main>
    </div>
  );
}

/** 첫 실행 화면: 세션 확인이 끝나고 최소 시간(애니메이션 한 바퀴)이 지나면 걷힌다 */
const T0 = Date.now();
const MIN = matchMedia('(prefers-reduced-motion: reduce)').matches ? 300 : 2200;
function Root() {
  const s = useSyncExternalStore(subscribe, getState);
  const [phase, setPhase] = useState<'show' | 'leave' | 'gone'>('show');
  useEffect(() => {
    if (!s.sessionChecked) return;
    const wait = Math.max(0, MIN - (Date.now() - T0));
    const a = setTimeout(() => setPhase('leave'), wait), b = setTimeout(() => setPhase('gone'), wait + 520);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [s.sessionChecked]);
  return <>
    <App />
    {phase !== 'gone' && <Splash leaving={phase === 'leave'} note={s.sessionChecked ? '준비됐어요' : 'Prism에 연결하는 중'} />}
  </>;
}

start();
startUpdates();
createRoot(document.getElementById('root')!).render(<StrictMode><HashRouter><Root /></HashRouter></StrictMode>);
