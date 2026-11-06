import { StrictMode, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type MouseEvent as RMouseEvent, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, NavLink, Route, Routes, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import '@prism/ui/styles.css';
import './app.css';
import { LiveDot, AttendBurst, OfflineScreen, startShopCatalog, type Attend, AugmentOpen, Icon, groupNav, hubAt, hubHref, hubOf, HubTabs, useScrollKeeper, PullRefresh, SplashSwap, WelcomeFlow, MatchNote, MatchSource, MemberFace, NickName, PieceIcon, connectFavs, useLoad, usePieces, useSkins, type IconName } from '@prism/ui';
import { PIECE, SITE_URL, emitPullRefresh, matchFromLcu, mergeMatch, withDefaults, type Links, type MatchDetail } from '@prism/core';
import { pollWhileShown } from './poll';
import { checkNow, clearAttend, getState, refreshSession, start, subscribe, type State } from './controller';
import { Onboarding } from './pages/Onboarding';
import { Splash } from './Splash';
import { api, bridge } from './bridge';
import { storeUpdate, checkUpdate, startUpdates, useUpdateQuiet } from './update';
import { useHomeBg } from './homebg';
import { minimapLeft, onMinimapSent } from './controller';
import { UpdateButton } from './UpdateButton';
import { GamePage } from './pages/Game';
import { HomePage } from './pages/Home';
import { AugmentsPage } from './pages/Augments';
import { DexPage } from './pages/Dex';
import { ChampionsPage } from './pages/Champions';
import { MemberPage, MissionsPage, NewsPage, InquiryPage, RankingPage, ShopPage, StaffInquiryPage, StaffJoinPage, StaffMembersPage, StaffPage, StaffTodoPage } from './pages/Members';
import { CrewPage, InvitePage } from './pages/Crew';
import { SettingsPage } from './pages/Settings';
import { lockdown } from './lockdown';

/** 메뉴 (v3.142): 성장·멤버는 허브 — 메뉴 하나에 탭 여러 개, 주소는 그대로 */
const NAV: [string, string, IconName][] = [['/play', '분석', 'game'], ['/champions', '챔프', 'grid'], ['/augments', '증강', 'spark'], ['/ranking', '랭킹', 'trophy'], ['/dex', '성장', 'sprout'], ['/crew', '모임', 'users']];

/** 롤 클라이언트 연결 상태 (사이드바 내 얼굴의 점에 마우스를 올리면) */
const STATUS: Record<State['status'], [string, string]> = {
  starting: ['준비 중', ''],
  'no-client': ['롤 꺼짐', ''],
  idle: ['롤 연결됨', 'ok'],
  'champ-select': ['챔프 선택 중', 'live'],
  'in-game': ['게임 중', 'live'],
  error: ['롤 연결 오류', 'bad'],
};

const LOL_ON = new Set<State['status']>(['idle', 'champ-select', 'in-game']);

/** 디스코드가 켜져 있는지 (창을 보고 있을 때 20초마다 OS 프로세스 목록만 본다 — 게임 중에는 쉰다) */
function useDiscordRunning() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    const check = () => bridge.discordRunning().then((v) => { if (live) setOn(v); }).catch(() => {});
    const stop = pollWhileShown(check, 20_000);
    return () => { live = false; stop(); };
  }, []);
  return on;
}

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
function Page({ children, main, k = 0 }: { children: ReactNode; main: React.RefObject<HTMLElement | null>; k?: number }) {
  const loc = useLocation();
  const idx = hidx();
  const prev = useRef(idx);
  const back = idx < prev.current;
  useEffect(() => { prev.current = idx; }, [loc.pathname, idx]);
  // 새로 들어가면 맨 위, 뒤로·앞으로 돌아오면 보던 위치 (v3.102)
  const type = useNavigationType();
  const sc = useCallback(() => main.current, [main]);
  useScrollKeeper(loc.pathname, type === 'POP', sc);
  return <div key={`${loc.pathname}-${k}`} className={`page ${back ? 'back' : ''}`}>{children}</div>;
}

/** 당겨서 새로고침: 받아 둔 서버 데이터를 지우고 내 정보·롤 상태도 다시 읽은 뒤 화면을 새로 그린다 (v3.67) */
async function pullRefresh() {
  api.forget?.();
  emitPullRefresh();
  await Promise.all([refreshSession().catch(() => {}), checkNow().catch(() => {})]);
}

/** 출석 연출은 창을 실제로 보고 있을 때만 (윈도우 시작 시 트레이로 켜졌으면 창을 띄울 때까지 기다린다, v3.120) */
function AttendGate({ a }: { a: Attend }) {
  const seen = () => document.visibilityState === 'visible' && document.hasFocus();
  const [on, setOn] = useState(seen);
  useEffect(() => {
    if (on) return;
    const f = () => { if (seen()) setOn(true); };
    document.addEventListener('visibilitychange', f);
    addEventListener('focus', f);
    return () => { document.removeEventListener('visibilitychange', f); removeEventListener('focus', f); };
  }, [on]);
  return on ? <AttendBurst a={a} api={api} onDone={clearAttend} /> : null;
}

function App() {
  const s = useSyncExternalStore(subscribe, getState);
  const up = useUpdateQuiet();
  const nav = useNavigate();
  const loc = useLocation();
  // 메뉴를 누르면 그 자리를 바로 밝히고 위쪽에 진행 줄을 띄운 뒤(한 번 그린 다음) 화면을 옮긴다 —
  // 무거운 화면(성장·모임)은 그리는 데 시간이 걸려, 예전엔 그동안 아무 반응이 없어 '안 눌린다'고 느꼈다
  const [pend, setPend] = useState<string | null>(null);
  useEffect(() => { setPend(null); }, [loc.pathname]);
  const go = useCallback((to: string) => {
    if (to === loc.pathname) return;
    setPend(to);
    // 한 번 그린 뒤(rAF) 옮기되, rAF 만 믿지 않는다 — 게임 중에 켠 창은 WebView 가 '안 보이는 창'으로 잡혀
    // rAF 가 멈출 수 있다 (게임 중 Prism 을 켜면 메뉴가 안 눌리던 제보, 1.0.50). 늦어도 0.1초 뒤에는 옮긴다
    let moved = false;
    const move = () => { if (!moved) { moved = true; nav(to); } };
    if (document.visibilityState === 'hidden') { move(); return; }
    requestAnimationFrame(() => setTimeout(move, 0));
    setTimeout(move, 100);
  }, [loc.pathname, nav]);
  const path = pend ?? loc.pathname;
  const isAt = (to: string, end = false) => path === to || (!end && to !== '/' && path.startsWith(`${to}/`));
  // 새 탭·새 창(가운데 단추·Ctrl)은 그대로 둔다
  const onNav = (to: string) => (e: RMouseEvent) => { if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); go(to); };
  const hubAllow = (to: string) => Boolean(s.me) || (to !== '/news' && to !== '/invite');
  const curHub = hubOf(loc.pathname);
  const login = async () => { try { await bridge.login(); } finally { await refreshSession(); } };
  // 챔프 선택·게임이 시작되면 게임 화면으로 (Alt+Tab 했을 때 바로 보이게)
  // 상태가 '바뀌는 순간'에만 한 번 이동한다. 그 뒤로는 다른 메뉴를 자유롭게 연다
  // (예전에는 메뉴를 옮길 때마다 다시 게임 화면으로 끌려와 게임 중 모든 메뉴가 먹통이었다)
  // 트레이 '업데이트 확인': 설정 화면을 열고 바로 확인 (결과가 버전 줄에 보인다)
  useEffect(() => {
    let off: (() => void) | undefined;
    import('@tauri-apps/api/event').then(({ listen }) => listen('check-update', () => { nav('/settings'); void checkUpdate(); }).then((f) => { off = f; })).catch(() => {});
    return () => off?.();
  }, [nav]);
  const prevStatus = useRef(s.status);
  // 저절로 분석(/play)으로 옮겨 간 뒤 사용자가 다른 화면으로 가면 '돌아가기'는 하지 않는다
  const autoPlay = useRef(false);
  useEffect(() => { if (loc.pathname !== '/play') autoPlay.current = false; }, [loc.pathname]);
  useEffect(() => {
    const before = prevStatus.current;
    prevStatus.current = s.status;
    const playing = (x: State['status']) => x === 'champ-select' || x === 'in-game';
    if (before !== s.status && playing(s.status)) { if (loc.pathname !== '/play') { nav('/play'); autoPlay.current = true; } }
    // 아무것도 누르지 않은 채 저절로 분석으로 넘어왔으면, 게임(챔프 선택)이 끝나면 홈으로 돌아간다 (v3.164)
    else if (playing(before) && !playing(s.status) && autoPlay.current) { autoPlay.current = false; nav('/'); }
    // 챔프 선택에 들어가는 순간 창을 맨 앞으로 올리는 것은 Rust(watch_phase)가 한다 — 트레이에 있을 때도 늦지 않게
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.status, nav]);
  const ready = Boolean(s.me?.consent);
  // 이미 동의한 회원 중 최애 챔프·'나를 소개해요'가 없는 사람에게 (v3.47). '나중에'는 이번 실행에서만
  const [welcomeLater, setWelcomeLater] = useState(false);
  // 게임 위 작은 창(자동 인식)도 동의한 뒤에만 켠다
  // (한 번 놓쳐도 되도록 15초마다 다시 알린다)
  useEffect(() => {
    void bridge.visionAllow(ready);
    const t = setInterval(() => void bridge.visionAllow(ready), 15_000);
    return () => clearInterval(t);
  }, [ready]);
  // 힐팩 타이머 준비: 관리자 계정의 게임에서만 미니맵 자료를 모아 운영 진단으로 보낸다 (2026-11-05 사용자 결정)
  // 여러 회원 화면에서 모은다 (v3.177, 사용자 결정): 동의한 회원의 이 기기에서 3판까지, 관리자는 늘
  const [mapLeft, setMapLeft] = useState(minimapLeft);
  useEffect(() => onMinimapSent(() => setMapLeft(minimapLeft())), []);
  useEffect(() => { void bridge.visionCalib(s.me?.tier === 'admin' || (ready && mapLeft > 0)); }, [s.me?.tier, ready, mapLeft]);
  // 프리즘 픽: Prism 사람들이 많이 고른 증강을 이 기기에 둔다 → 증강 카드가 뜨면 게임 위 작은 창이 표시를 단다 (6시간마다 새로)
  useEffect(() => {
    if (!s.me) return;
    const pull = () => api.get<{ ids: number[]; champ: Record<number, number[]> }>('/api/crew/augpicks').then((r) => { try { localStorage.setItem('prism-crew-picks', JSON.stringify({ ...r, at: Date.now() })); } catch { /* 저장소 없음 */ } }).catch(() => {});
    void pull();
    const t = setInterval(pull, 6 * 3600_000);
    return () => clearInterval(t);
  }, [s.me?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [label] = STATUS[s.status];
  const pieces = usePieces(s.me ? api : null);
  // 내 챔프·내 증강: 로그인되면 서버 목록으로 맞춘다
  useEffect(() => { connectFavs(s.me ? api : null); }, [s.me?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // 이 창을 보고 있으니 앱은 떠 있다. 롤이 켜져 있으면 앱+게임
  // 내 카드 점: 롤 클라이언트 · 디스코드 두 가지만 (회색 둘 다 꺼짐 / 파랑 디스코드 / 빨강 롤 / 프리즘 둘 다)
  const discord = useDiscordRunning();
  const lol = LOL_ON.has(s.status);
  const dot = lol && discord ? 'both' : lol ? 'lol' : discord ? 'discord' : 'off';
  const dotLabel = { both: '롤 클라이언트 · 디스코드 켜짐', lol: '롤 클라이언트 켜짐', discord: '디스코드 켜짐', off: '롤 클라이언트 · 디스코드 꺼짐' }[dot];
  // 운영진은 글자 대신 카드가 프리즘처럼 빛난다
  // 게임·챔프 선택 중에는 '분석' 메뉴가 반짝인다 (다른 화면에 있다가도 바로 돌아오게)
  const playing = s.status === 'in-game' || s.status === 'champ-select';
  const staff = s.me?.tier === 'admin' || (s.me?.role?.level ?? 0) >= 5;
  const skins = useSkins();
  const main = useRef<HTMLElement>(null);
  const mainEl = useCallback(() => main.current, []);
  // 홈은 메뉴와 본문을 나누지 않는다 (v3.174): 사이드바가 창에 고정된 오늘의 챔프 그림 위에 겹치고, 내용만 그 위로 내려간다
  const atHome = loc.pathname === '/';
  const homeBg = useHomeBg();
  // 홈에서 나가는 0.5초 동안은 투명한 몰입 배치를 그대로 두고 배경 그림만 서서히 걷는다 (v3.177) —
  // 바로 바꾸면 새 화면의 바탕이 그림을 한 번에 덮어 '냅다' 바뀌었다
  const [leaving, setLeaving] = useState(false);
  const wasHome = useRef(atHome);
  // 그리기 전에 정한다(useLayoutEffect) — useEffect 면 무거운 새 화면이 한 번 그려진 뒤에야 바뀌어 그 사이 배경이 뚝 끊겼다
  useLayoutEffect(() => {
    const was = wasHome.current;
    wasHome.current = atHome;
    if (was && !atHome) { setLeaving(true); const t = setTimeout(() => setLeaving(false), 520); return () => clearTimeout(t); }
    setLeaving(false);
  }, [atHome]);
  const riotName = s.summoner?.riotId.split('#')[0];
  const openAug = useCallback((id: number) => nav(`/augments/${id}`), [nav]);
  // 판 상세: 서버(함께한 회원 얼굴) + 롤 클라이언트(10명 전체, 게임 중·롤 꺼짐이면 읽지 않는다)
  const matchSource = useCallback(async (id: number) => {
    const live = getState().status === 'idle' || getState().status === 'champ-select';
    const [server, lcu] = await Promise.all([
      getState().me ? api.get<MatchDetail>(`/api/games/${id}`).catch(() => null) : Promise.resolve(null),
      live ? bridge.lcuGet(`/lol-match-history/v1/games/${id}`).then(matchFromLcu).catch(() => null) : Promise.resolve(null),
    ]);
    return mergeMatch(server, lcu);
  }, []);
  if (!ready) return <Onboarding s={s} onLogin={login} />;
  return (
    <div className={`shell${atHome || leaving ? ' immersive' : ''}${leaving ? ' leaving' : ''}`}>
      {/* 홈 배경: 늘 그려 두고 홈일 때만 서서히 나타난다 (v3.177) */}
      {homeBg && <div className={`home-bg${atHome ? ' on' : ''}`} aria-hidden="true"><SplashSwap className="home-splash" src={homeBg} /></div>}
      {s.me && (!s.me.skin || !s.me.about) && !welcomeLater && <WelcomeFlow api={api} nick={s.me.nick} needFace={!s.me.skin} onClose={(done) => { if (!done) setWelcomeLater(true); void refreshSession(); }} />}
      <aside className="side">
        <div className="side-brand">
          {/* 로고 = 홈 (메뉴를 늘리지 않는다, v3.164) */}
          <NavLink to="/" end onClick={onNav('/')} className="brand-home" title="홈" aria-label="홈"><span className="brand-mark"><img src="/brand/prism-256.png" alt="" /></span>
          <span className="brand-word" data-text="PRISM">PRISM</span></NavLink>
          <NavArrows />
        </div>
        <span className="brand-line" aria-hidden="true" />
        {/* 새 버전: 받는 동안 진행 막대 → 다 받으면 '재시작' (v3.140). 게임·챔프 선택 중에는 숨긴다 (끝나면 다시) */}
        <UpdateButton className="upd-side" />
        {up.error && up.info?.available && !up.info.managed && !playing && <span className="side-err l">{up.error}</span>}
        <nav className="side-nav">{groupNav([...NAV, ...(s.me?.perms?.manage ? [['/staff', '운영', 'shield'] as [string, string, IconName]] : [])]).map((g) => (
          <div key={g.key} className="side-group" role="group" aria-label={g.label}>
            <span className="side-glabel">{g.label}</span>
            {g.items.map(([to, l, i]) => {
              const hub = hubAt(to);
              const badge = <>{to === '/play' && playing && <i className="live-dot" aria-hidden="true" />}{to === '/crew' && (s.me?.nowLive ?? 0) > 0 && <LiveDot n={s.me!.nowLive!} />}{to === '/crew' && !(s.me?.nowLive) && (s.me?.newsUnread ?? 0) > 0 && <i className="news-dot" aria-label="새 소식" />}{to === '/staff' && (s.me?.staffUnread ?? 0) > 0 && <i className="news-dot" aria-label="승인할 멤버" />}</>;
              if (!hub) return <NavLink key={to} to={to} end={to === '/'} onClick={onNav(to)} className={() => [isAt(to, to === '/') ? 'active' : '', to === '/play' && playing ? 'live' : ''].filter(Boolean).join(' ')} title={to === '/play' && playing ? (s.status === 'in-game' ? '게임 중 · 증강 가이드' : '챔프 선택 중') : undefined}><Icon name={i} />{l}{badge}</NavLink>;
              // 허브: 누르면 늘 첫 탭으로 (v3.147), 펼친 줄에서 탭으로 바로 (도감 · 미션 · 랭킹)
              const on = hubOf(path) === hub;
              const tabs = hub.tabs.filter((t) => hubAllow(t.to));
              return (
                <div key={to} className={`side-hub ${on ? 'on' : ''}`}>
                  <NavLink to={hubHref(hub, hubAllow)} onClick={onNav(hubHref(hub, hubAllow))} className={() => (on ? 'active' : '')} aria-expanded={on}><Icon name={i} />{l}{badge}<Icon name="chevR" className="hub-chev" /></NavLink>
                  {/* 지금 허브만 아래로 펼친다: 세로선 + 고른 줄에 파란 막대 (시안 B) */}
                  <div className={`side-sub ${on ? 'open' : ''}`} aria-hidden={!on}><div>{tabs.map((t) => <NavLink key={t.to} to={t.to} onClick={onNav(t.to)} className={() => (isAt(t.to, tabs.some((x) => x.to.startsWith(`${t.to}/`))) ? 'active' : '')} tabIndex={on ? 0 : -1}>{t.to === '/crew' && (s.me?.nowLive ?? 0) > 0 ? <><span className="live-text">{t.label}</span><LiveDot n={s.me!.nowLive!} /></> : t.label}{t.to === '/news' && (s.me?.newsUnread ?? 0) > 0 && <i className="sub-dot" aria-label="새 소식" />}</NavLink>)}</div></div>
                </div>
              );
            })}
          </div>))}</nav>
        <span className="sp" />
        {/* 아래쪽 한 줄: 상점 · 설정 (디스코드·카카오톡은 모임 화면 오른쪽 위) */}
        <nav className="side-dock" aria-label="상점과 설정">
          <NavLink to="/shop" onClick={onNav('/shop')} className={() => `dock-shop${isAt('/shop') ? ' active' : ''}`} title="상점"><Icon name="bag" /><span>상점</span></NavLink>
          <NavLink to="/settings" onClick={onNav('/settings')} className={() => `dock-set${isAt('/settings') ? ' active' : ''}`} title="설정"><Icon name="gear" /><span>설정</span></NavLink>
        </nav>
        {s.me && <div className={`side-me-card ${staff ? 'prism' : ''}`}>
          <NavLink to="/me" onClick={onNav('/me')} className={() => `side-me${isAt('/me') ? ' active' : ''}`} title="내 페이지">
            {/* 얼굴은 카드 한쪽을 꽉 채우는 그림 + 장착한 프로필 테두리, 접속 점은 카드 오른쪽 끝 (v3.164) */}
            <span className={`side-thumb${s.me.frame ? ` phero face-ring ${s.me.frame}` : ''}`}><span className="phero-face"><MemberFace nick={s.me.nick} skin={s.me.skin} size={56} skins={skins} /></span></span>
            <span className="who"><b><NickName nick={s.me.nick} /></b><span className="st pc" data-pieces title={`보유 ${PIECE}`}>{pieces === null ? '–' : <><b>{pieces.toLocaleString()}</b><PieceIcon size={12} /></>}</span></span>
            <i className={`sdot ${dot}`} role="img" aria-label={dotLabel} title={`${dotLabel} · ${label}${riotName && riotName !== s.me.nick ? ` · ${riotName}` : ''}`} />
          </NavLink>
        </div>}
      </aside>
      <main className={`main${pend ? ' pending' : ''}`} ref={main}>
        {pend && <i className="nav-pend" aria-hidden="true" />}
        {/* 스토어 판: 새 버전이 있으면 늘 위쪽에 (닫기 없음). 게임·챔프 선택 중에는 단추 대신 안내 (v3.103) */}
        {up.info?.managed && up.info.available && <div className="store-up" role="status">
          <span className="dot" aria-hidden="true" />
          <span className="t"><b>새 버전이 나왔어요 (v{up.info.latest})</b> · 업데이트해야 새 기능과 고친 점이 들어와요.</span>
          {playing
            ? <span className="meta">게임이 끝나면 업데이트해 주세요</span>
            : <button type="button" className="btn sm primary" disabled={up.applying} onClick={() => void storeUpdate()}>{up.applying ? 'Microsoft Store 여는 중…' : '업데이트'}</button>}
        </div>}
        {s.me && !s.me.rolesKnown && <div className="relogin"><span>디스코드 역할(정회원·운영진 등)에 맞는 기능을 열려면 <b>한 번만 다시 로그인</b>해 주세요.</span><button type="button" className="btn sm primary" onClick={login}><Icon name="discord" />다시 로그인</button></div>}
        {curHub && <HubTabs key={curHub.key} hub={curHub} path={path} onGo={go} hide={(to) => !hubAllow(to)} dots={{ '/news': (s.me?.newsUnread ?? 0) > 0 }} counts={{ '/staff/todo': s.me?.staffTodo ?? 0, '/staff/inquiries': s.me?.staffInq ?? 0 }} alert={{ '/staff/inquiries': true }} live={{ '/crew': s.me?.nowLive ?? 0 }} />}
        <AugmentOpen.Provider value={openAug}><MatchSource.Provider value={matchSource}><MatchNote.Provider value="롤을 켜 두면 열 명 모두 볼 수 있어요."><PullRefresh scroller={mainEl} onRefresh={pullRefresh}>{(k) => <Page main={main} k={k}><Routes>
          <Route index element={<HomePage s={s} />} />
          <Route path="play" element={<GamePage s={s} />} />
          <Route path="champions" element={<ChampionsPage member={!!s.me} record={s.personal.champions} />} />
          <Route path="champions/:id" element={<ChampionsPage member={!!s.me} record={s.personal.champions} />} />
          <Route path="augments" element={<AugmentsPage />} />
          <Route path="augments/:id" element={<AugmentsPage member={!!s.me} />} />
          <Route path="dex" element={<DexPage s={s} />} />
          <Route path="ranking" element={<RankingPage s={s} onLogin={login} />} />
          <Route path="me" element={<MemberPage s={s} onLogin={login} />} />
          <Route path="members/:id" element={<MemberPage s={s} onLogin={login} />} />
          <Route path="crew" element={<CrewPage s={s} onLogin={login} />} />
          <Route path="invite" element={<InvitePage s={s} onLogin={login} />} />
          <Route path="shop" element={<ShopPage s={s} onLogin={login} />} />
          <Route path="missions" element={<MissionsPage s={s} onLogin={login} />} />
          <Route path="settings" element={<SettingsPage s={s} onLogin={login} />} />
          <Route path="news" element={<NewsPage s={s} onLogin={login} />} />
          <Route path="inquiry" element={<InquiryPage s={s} onLogin={login} />} />
          <Route path="staff" element={<StaffPage s={s} onLogin={login} />} />
          <Route path="staff/members" element={<StaffMembersPage s={s} onLogin={login} />} />
          <Route path="staff/join" element={<StaffJoinPage s={s} onLogin={login} />} />
          <Route path="staff/todo" element={<StaffTodoPage s={s} onLogin={login} />} />
          <Route path="staff/inquiries" element={<StaffInquiryPage s={s} onLogin={login} />} />
          <Route path="*" element={<HomePage s={s} />} />
        </Routes></Page>}</PullRefresh></MatchNote.Provider></MatchSource.Provider></AugmentOpen.Provider>
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
    {/* 출석 연출: 첫 화면이 걷히고 첫 화면 단계·소개 창을 다 마친 뒤에 */}
    {phase === 'gone' && s.attend && s.me?.consent && s.me.skin && s.me.about && <AttendGate a={s.attend} />}
    {/* 인터넷·서버 연결이 끊기면 안내, 돌아오면 저절로 다시 불러온다 (v3.122) */}
    {phase === 'gone' && <OfflineScreen api={api} onBack={() => void refreshSession()} hold={s.status === 'champ-select' || s.status === 'in-game'} />}
  </>;
}

start();
startUpdates();
lockdown();
// 창이 포커스를 잃으면(게임을 하는 동안 등) 끝없이 도는 움직임을 멈춘다 — 뒤에 깔린 창도 매 프레임 다시 그리면
// 창 모드 게임과 화면 합성을 다퉈 끊김이 생긴다 (v3.61). 돌아오면 이어서 움직인다
const idle = () => document.documentElement.classList.toggle('idle', !document.hasFocus() || document.visibilityState !== 'visible');
window.addEventListener('blur', idle);
window.addEventListener('focus', idle);
document.addEventListener('visibilitychange', idle);
idle();
// 상품 목록은 서버에서, 새 상품 그림·모양(looks.css)은 웹에서 받는다 (v3.124) — 상점 업데이트에 앱 업데이트가 필요 없게
startShopCatalog(api, SITE_URL);

createRoot(document.getElementById('root')!).render(<StrictMode><HashRouter useTransitions={false}><Root /></HashRouter></StrictMode>);
