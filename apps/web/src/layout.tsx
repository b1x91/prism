import { NavLink, Outlet, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LiveDot, AttendBurst, OfflineScreen, startShopCatalog, AugmentOpen, Bone, groupNav, hubAt, hubHref, hubOf, HubTabs, useScrollKeeper, PullRefresh, WelcomeFlow, FacePresence, MatchSource, Gem, Icon, MemberFace, FramedFace, NickName, PieceIcon, Seg, usePieces, getThemeMode, setThemeMode, toggleTheme, type IconName, type ThemeMode } from '@prism/ui';
import { emitPullRefresh, type MatchDetail } from '@prism/core';
import { useSession } from './session';

/** 메뉴 (v3.142): 성장(도감·미션·랭킹) · 멤버(멤버·소식·초대)는 허브 — 메뉴 하나에 탭 여러 개. 문의는 내 메뉴로 */
const NAV: [string, string, IconName][] = [['/champions', '챔프', 'grid'], ['/augments', '증강', 'spark'], ['/dex', '성장', 'sprout'], ['/crew', '모임', 'users']];

/** 운영 메뉴는 운영진에게만 (v3.107) */
const navOf = (me: { perms?: { manage?: boolean } } | null): typeof NAV => [...NAV, ...(me?.perms?.manage ? [['/staff', '운영', 'shield'] as const] : [])] as typeof NAV;
/** 소식·초대는 회원에게만 */
const allowOf = (me: unknown) => (to: string) => Boolean(me) || (to !== '/news' && to !== '/invite');
const dotOf = (me: { newsUnread?: number; staffUnread?: number } | null, to: string) => (((to === '/news' || to === '/crew') && (me?.newsUnread ?? 0) > 0) || (to === '/staff' && (me?.staffUnread ?? 0) > 0) ? 'nav-dot' : undefined);

/** 상단 메뉴 한 칸. 허브는 마우스를 올리면 아래로 탭 목록 (그림 · 이름 · 한 줄 설명) */
function TopItem({ to, label }: { to: string; label: string }) {
  const { me } = useSession();
  const { pathname } = useLocation();
  const hub = hubAt(to);
  const nl = to === '/crew' ? me?.nowLive ?? 0 : 0;
  const live = nl > 0 ? <LiveDot n={nl} /> : null;
  if (!hub) return <NavLink to={to} className={dotOf(me, to)}>{label}{live}</NavLink>;
  const allow = allowOf(me);
  const on = hubOf(pathname) === hub;
  return (
    <span className="tab-hub">
      <NavLink to={hubHref(hub, allow)} className={() => [on ? 'active' : '', live ? '' : dotOf(me, to) ?? ''].join(' ').trim()} aria-haspopup="true">{label}{live}<Icon name="chevD" className="tab-chev" /></NavLink>
      <span className="hub-drop" role="menu" aria-label={label}>
        {hub.tabs.filter((t) => allow(t.to)).map((t) => <NavLink key={t.to} to={t.to} role="menuitem"><span className="hd-ic"><Icon name={t.icon} /></span><span className="hd-t"><b>{t.to === '/crew' && nl > 0 ? <><span className="live-text">{t.label}</span><LiveDot n={nl} /></> : t.label}{dotOf(me, t.to) && t.to === '/news' && <i className="hd-dot" aria-label="새 소식" />}</b><small>{t.hint}</small></span></NavLink>)}
      </span>
    </span>
  );
}

export function Layout() {
  const { me, login, links, api, refresh, member, attend, clearAttend } = useSession();
  // 상품 목록은 서버에서 (v3.124): 상점 업데이트를 앱 업데이트와 따로
  useEffect(() => startShopCatalog(api, '/'), [api]);
  // 최애 챔프(대표 스킨)나 '나를 소개해요'가 아직 없는 회원에게 (v3.47). '나중에'는 이번 접속에서만 닫는다
  const [welcomeOff, setWelcomeOff] = useState(() => { try { return sessionStorage.getItem('prism-welcome') === 'later'; } catch { return false; } });
  const welcome = Boolean(me && (!me.skin || !me.about) && !welcomeOff);
  const closeWelcome = (done: boolean) => { if (!done) { try { sessionStorage.setItem('prism-welcome', 'later'); } catch { /* 저장 막힘 */ } } setWelcomeOff(true); refresh(); };
  const { pathname } = useLocation();
  const matchSource = useCallback((id: number) => (me ? api.get<MatchDetail>(`/api/games/${id}`).catch(() => null) : Promise.resolve(null)), [api, me]);
  const [menu, setMenu] = useState(false);
  // 새로 들어가면 맨 위, 뒤로·앞으로 돌아오면 보던 위치 (v3.102)
  const navType = useNavigationType();
  const winScroller = useCallback(() => window, []);
  useScrollKeeper(pathname, navType === 'POP', winScroller);
  useEffect(() => { setMenu(false); }, [pathname]);
  const nav = useNavigate();
  const curHub = hubOf(pathname);
  const pieces = usePieces(me ? api : null);
  // 상단 내 얼굴·이름·피스: 지난 접속 때 것을 기억해 두었다가 로그인 확인 전에 바로 그린다
  // (로그인 단추 → 내 이름으로, 이름 옆에 피스가 늦게 붙으며 상단 아이콘이 옆으로 밀리지 않게, v3.93)
  const [top] = useState<{ nick: string; skin: number | null; frame?: string | null; pieces: number | null } | null>(() => { try { return JSON.parse(localStorage.getItem('prism-top') || 'null'); } catch { return null; } });
  useEffect(() => {
    try {
      if (me && pieces !== null) localStorage.setItem('prism-top', JSON.stringify({ nick: me.nick, skin: me.skin ?? null, frame: me.frame ?? null, pieces }));
      else if (member === false) localStorage.removeItem('prism-top');
    } catch { /* 저장 막힘 */ }
  }, [me?.nick, me?.skin, pieces, member]); // eslint-disable-line react-hooks/exhaustive-deps
  const shownPieces = pieces ?? (me && top?.nick === me.nick ? top.pieces : null);
  const openAug = useCallback((id: number) => nav(`/augments/${id}`), [nav]);
  // 당겨서 새로고침 (v3.67): 받아 둔 데이터를 지우고 내 정보와 이 화면을 새로 불러온다
  const scroller = useCallback(() => window, []);
  const pullRefresh = useCallback(() => { api.forget?.(); emitPullRefresh(); refresh(); }, [api, refresh]);
  return (
    <>
      {attend && <AttendBurst a={attend} api={api} onDone={clearAttend} />}
      {/* 인터넷·서버 연결이 끊기면 화면 전체에 안내, 돌아오면 저절로 다시 불러온다 (v3.122) */}
      <OfflineScreen api={api} onBack={refresh} />
      <header className="topbar"><div className="wrap">
        <NavLink to="/" className="brand"><Gem size={22} />PRISM</NavLink>
        <nav className="tabs">{groupNav(navOf(me)).map((g, gi) => <span key={g.key} className="tab-group" role="group" aria-label={g.label}>{gi > 0 && <i className="tab-sep" aria-hidden="true" />}{g.items.map(([to, label]) => <TopItem key={to} to={to} label={label} />)}</span>)}</nav>
        <span className="sp" />
        <span className="top-wide"><NavLink to="/shop" className="icon-btn top-shop" title="상점" aria-label="상점"><Icon name="bag" /></NavLink>
          <button className="icon-btn" type="button" title="테마 바꾸기" onClick={toggleTheme}><Icon name="moon" /></button></span>
        {me ? <MeMenu pieces={shownPieces} />
          : member === null && top ? <NavLink to="/me" className="me-btn" title="내 페이지"><FramedFace frame={top.frame} nick={top.nick} skin={top.skin} size={30} /><span className="me-txt"><b><NickName nick={top.nick} /></b>{top.pieces !== null && <small data-pieces>{top.pieces.toLocaleString()}<PieceIcon size={12} /></small>}</span></NavLink>
          : member === null ? <span className="me-btn" aria-hidden="true"><Bone w={30} h={30} r="round" /><span className="me-txt"><Bone w={72} h={12} /></span></span>
          : <button type="button" className="btn sm primary" onClick={login}><Icon name="discord" />로그인</button>}
        <button type="button" className="icon-btn menu-btn" aria-label="메뉴 열기" aria-expanded={menu} onClick={() => setMenu(true)}><Icon name="menu" /></button>
      </div></header>
      <MobileMenu open={menu} onClose={() => setMenu(false)} />
      {welcome && me && <WelcomeFlow api={api} nick={me.nick} needFace={!me.skin} onClose={closeWelcome} />}
      <main><AugmentOpen.Provider value={openAug}><MatchSource.Provider value={matchSource}><PullRefresh scroller={scroller} onRefresh={pullRefresh}>{(k) => <>{curHub && (me || curHub.key === 'grow') && <div className="wrap hub-wrap"><HubTabs key={curHub.key} hub={curHub} path={pathname} onGo={(to) => nav(to)} hide={(to) => !allowOf(me)(to)} dots={{ '/news': (me?.newsUnread ?? 0) > 0 }} live={{ '/crew': me?.nowLive ?? 0 }} /></div>}<div key={`${pathname}-${k}`} className="route"><Outlet /></div></>}</PullRefresh></MatchSource.Provider></AugmentOpen.Provider></main>
      <footer className="foot"><div className="wrap">
        <span className="row" style={{ gap: 8 }}><Gem size={18} />Prism · 칼바람 아수라장 증바람 모임</span>
        <span className="row" style={{ gap: 16 }}>
          <NavLink to="/privacy" className="foot-link">개인정보 처리방침</NavLink>
        </span>
      </div></footer>
    </>
  );
}

/** 상단 내 프로필: 누르면 아래로 작은 메뉴 (내 페이지 · 프로필 꾸미기 · 로그아웃). 바깥·Esc·이동하면 닫힌다 */
function MeMenu({ pieces }: { pieces: number | null }) {
  const { me, logout } = useSession();
  const nav = useNavigate();
  const { pathname, search } = useLocation();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => { setOpen(false); }, [pathname, search]);
  useEffect(() => {
    if (!open) return;
    const out = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    addEventListener('pointerdown', out); addEventListener('keydown', esc);
    return () => { removeEventListener('pointerdown', out); removeEventListener('keydown', esc); };
  }, [open]);
  if (!me) return null;
  const go = (to: string) => { setOpen(false); nav(to); };
  return (
    <span className="me-wrap" ref={box}>
      <button type="button" className={`me-btn ${open ? 'on' : ''}`} aria-haspopup="menu" aria-expanded={open} title="내 프로필" onClick={() => setOpen((v) => !v)}>
        <FacePresence p={me.presence}><FramedFace frame={me.frame} nick={me.nick} skin={me.skin} size={30} /></FacePresence>
        <span className="me-txt"><b><NickName nick={me.nick} /></b>{pieces !== null && <small data-pieces>{pieces.toLocaleString()}<PieceIcon size={12} /></small>}</span>
      </button>
      {open && <div className="me-pop" role="menu">
        <div className="me-pop-head"><FacePresence p={me.presence}><FramedFace frame={me.frame} round nick={me.nick} skin={me.skin} size={40} /></FacePresence>
          <span><b><NickName nick={me.nick} /></b>{pieces !== null && <small>{pieces.toLocaleString()}<PieceIcon size={12} /></small>}</span></div>
        <button type="button" role="menuitem" onClick={() => go('/me')}><Icon name="home" />내 페이지</button>
        <button type="button" role="menuitem" onClick={() => go('/me?studio=1')}><Icon name="spark" />프로필 꾸미기</button>
        <button type="button" role="menuitem" onClick={() => go('/inquiry')}><Icon name="mail" />문의</button>
        <span className="me-pop-sep" />
        <button type="button" role="menuitem" className="danger" onClick={() => { setOpen(false); logout().then(() => nav('/')); }}><Icon name="logout" />로그아웃</button>
      </div>}
    </span>
  );
}

/** 휴대폰: 햄버거를 누르면 옆에서 밀려 나오는 메뉴. 아래쪽에 디스코드·카카오톡·테마 */
function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me, login, logout } = useSession();
  const { pathname } = useLocation();
  const nav = useNavigate();
  const [theme, setTheme] = useState<ThemeMode>(getThemeMode);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    return () => { removeEventListener('keydown', esc); document.body.style.overflow = ''; };
  }, [open, onClose]);
  return (
    <div className={`mmenu ${open ? 'open' : ''}`} aria-hidden={!open}>
      <button type="button" className="mmenu-scrim" aria-label="메뉴 닫기" tabIndex={open ? 0 : -1} onClick={onClose} />
      <aside className="mmenu-panel" role="dialog" aria-label="메뉴">
        <div className="mmenu-head">
          <NavLink to="/" className="brand" tabIndex={open ? 0 : -1}><Gem size={22} />PRISM</NavLink>
          <button type="button" className="icon-btn" aria-label="메뉴 닫기" tabIndex={open ? 0 : -1} onClick={onClose}><Icon name="x" /></button>
        </div>
        {me ? <NavLink to="/me" className="mmenu-me" tabIndex={open ? 0 : -1}><FacePresence p={me.presence}><FramedFace frame={me.frame} round nick={me.nick} skin={me.skin} size={40} /></FacePresence><span><b><NickName nick={me.nick} /></b><small>내 페이지</small></span></NavLink>
          : <button type="button" className="btn primary mmenu-login" tabIndex={open ? 0 : -1} onClick={login}><Icon name="discord" />디스코드로 로그인</button>}
        {me && <div className="mmenu-acts">
          <button type="button" className="btn sm" tabIndex={open ? 0 : -1} onClick={() => { onClose(); nav('/me?studio=1'); }}><Icon name="spark" />프로필 꾸미기</button>
          <button type="button" className="btn sm" tabIndex={open ? 0 : -1} onClick={() => { onClose(); logout().then(() => nav('/')); }}><Icon name="logout" />로그아웃</button>
        </div>}
        <nav className="mmenu-nav">{groupNav(navOf(me)).map((g) => <div key={g.key} className="mmenu-group" role="group" aria-label={g.label}><span className="mmenu-glabel">{g.label}</span>{g.items.map(([to, label, icon]) => {
          const hub = hubAt(to);
          const badge = <>{to === '/crew' && (me?.nowLive ?? 0) > 0 && <LiveDot n={me!.nowLive!} />}{dotOf(me, to) && !(to === '/crew' && (me?.nowLive ?? 0) > 0) && <i className="news-dot" aria-label={to === "/staff" ? "승인할 멤버" : "새 소식"} />}</>;
          if (!hub) return <NavLink key={to} to={to} tabIndex={open ? 0 : -1}><Icon name={icon} />{label}{badge}</NavLink>;
          const allow = allowOf(me);
          const on = hubOf(pathname) === hub;
          return <div key={to} className={`mmenu-hub ${on ? 'on' : ''}`}>
            <NavLink to={hubHref(hub, allow)} className={() => (on ? 'active' : '')} tabIndex={open ? 0 : -1}><Icon name={icon} />{label}{badge}<Icon name="chevR" className="hub-chev" /></NavLink>
            <div className={`mmenu-sub ${on ? 'open' : ''}`}><div>{hub.tabs.filter((t) => allow(t.to)).map((t) => <NavLink key={t.to} to={t.to} tabIndex={open && on ? 0 : -1}>{t.to === '/crew' && (me?.nowLive ?? 0) > 0 ? <><span className="live-text">{t.label}</span><LiveDot n={me!.nowLive!} /></> : t.label}{t.to === '/news' && (me?.newsUnread ?? 0) > 0 && <i className="sub-dot" aria-label="새 소식" />}</NavLink>)}</div></div>
          </div>;
        })}</div>)}</nav>
        <span className="sp" />
        <div className="mmenu-foot">
          <div className="mmenu-pair"><NavLink to="/shop" className="mmenu-shop" tabIndex={open ? 0 : -1}><Icon name="bag" />상점</NavLink>
            {me && <NavLink to="/inquiry" className="mmenu-shop" tabIndex={open ? 0 : -1}><Icon name="mail" />문의</NavLink>}</div>
          <div className="mmenu-row"><span className="k">화면</span><Seg value={theme} options={[['system', '시스템'], ['light', '라이트'], ['dark', '다크']]} onChange={(m) => { setThemeMode(m); setTheme(m); }} /></div>
        </div>
      </aside>
    </div>
  );
}
