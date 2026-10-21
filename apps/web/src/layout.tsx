import { NavLink, Outlet, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import { AugmentOpen, Bone, useScrollKeeper, InquiryDialog, PullRefresh, WelcomeFlow, FacePresence, MatchSource, Gem, Icon, MemberFace, NickName, PieceIcon, Seg, usePieces, getThemeMode, setThemeMode, toggleTheme, type IconName, type ThemeMode } from '@prism/ui';
import { emitPullRefresh, type MatchDetail } from '@prism/core';
import { useSession } from './session';

const NAV: [string, string, IconName][] = [['/champions', '챔프', 'grid'], ['/augments', '증강', 'spark'], ['/dex', '도감', 'book'], ['/missions', '미션', 'target'], ['/ranking', '랭킹', 'trophy'], ['/crew', '멤버', 'users']];

export function Layout() {
  const { me, login, links, api, refresh, member } = useSession();
  // 최애 챔프(대표 스킨)나 '나를 소개해요'가 아직 없는 회원에게 (v3.47). '나중에'는 이번 접속에서만 닫는다
  const [welcomeOff, setWelcomeOff] = useState(() => { try { return sessionStorage.getItem('prism-welcome') === 'later'; } catch { return false; } });
  const welcome = Boolean(me && (!me.skin || !me.about) && !welcomeOff);
  const closeWelcome = (done: boolean) => { if (!done) { try { sessionStorage.setItem('prism-welcome', 'later'); } catch { /* 저장 막힘 */ } } setWelcomeOff(true); refresh(); };
  const { pathname } = useLocation();
  const matchSource = useCallback((id: number) => (me ? api.get<MatchDetail>(`/api/games/${id}`).catch(() => null) : Promise.resolve(null)), [api, me]);
  const [menu, setMenu] = useState(false);
  const [asking, setAsking] = useState(false);
  // 새로 들어가면 맨 위, 뒤로·앞으로 돌아오면 보던 위치 (v3.102)
  const navType = useNavigationType();
  const winScroller = useCallback(() => window, []);
  useScrollKeeper(pathname, navType === 'POP', winScroller);
  useEffect(() => { setMenu(false); }, [pathname]);
  const nav = useNavigate();
  const pieces = usePieces(me ? api : null);
  // 상단 내 얼굴·이름·피스: 지난 접속 때 것을 기억해 두었다가 로그인 확인 전에 바로 그린다
  // (로그인 단추 → 내 이름으로, 이름 옆에 피스가 늦게 붙으며 상단 아이콘이 옆으로 밀리지 않게, v3.93)
  const [top] = useState<{ nick: string; skin: number | null; pieces: number | null } | null>(() => { try { return JSON.parse(localStorage.getItem('prism-top') || 'null'); } catch { return null; } });
  useEffect(() => {
    try {
      if (me && pieces !== null) localStorage.setItem('prism-top', JSON.stringify({ nick: me.nick, skin: me.skin ?? null, pieces }));
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
      <header className="top"><div className="wrap">
        <NavLink to="/" className="brand"><Gem size={22} />PRISM</NavLink>
        <nav className="tabs">{NAV.map(([to, label]) => <NavLink key={to} to={to}>{label}</NavLink>)}</nav>
        <span className="sp" />
        <span className="top-wide"><NavLink to="/shop" className="icon-btn top-shop" title="상점" aria-label="상점"><Icon name="bag" /></NavLink>
          <button className="icon-btn" type="button" title="테마 바꾸기" onClick={toggleTheme}><Icon name="moon" /></button></span>
        {me ? <NavLink to="/me" className="me-btn" title="내 페이지"><FacePresence p={me.presence}><MemberFace nick={me.nick} skin={me.skin} size={30} /></FacePresence><span className="me-txt"><b><NickName nick={me.nick} /></b>{shownPieces !== null && <small data-pieces>{shownPieces.toLocaleString()}<PieceIcon size={12} /></small>}</span></NavLink>
          : member === null && top ? <NavLink to="/me" className="me-btn" title="내 페이지"><MemberFace nick={top.nick} skin={top.skin} size={30} /><span className="me-txt"><b><NickName nick={top.nick} /></b>{top.pieces !== null && <small data-pieces>{top.pieces.toLocaleString()}<PieceIcon size={12} /></small>}</span></NavLink>
          : member === null ? <span className="me-btn" aria-hidden="true"><Bone w={30} h={30} r="round" /><span className="me-txt"><Bone w={72} h={12} /></span></span>
          : <button type="button" className="btn sm primary" onClick={login}><Icon name="discord" />로그인</button>}
        <button type="button" className="icon-btn menu-btn" aria-label="메뉴 열기" aria-expanded={menu} onClick={() => setMenu(true)}><Icon name="menu" /></button>
      </div></header>
      <MobileMenu open={menu} onClose={() => setMenu(false)} />
      {welcome && me && <WelcomeFlow api={api} nick={me.nick} needFace={!me.skin} onClose={closeWelcome} />}
      <main><AugmentOpen.Provider value={openAug}><MatchSource.Provider value={matchSource}><PullRefresh scroller={scroller} onRefresh={pullRefresh}>{(k) => <div key={`${pathname}-${k}`} className="route"><Outlet /></div>}</PullRefresh></MatchSource.Provider></AugmentOpen.Provider></main>
      <footer className="foot"><div className="wrap">
        <span className="row" style={{ gap: 8 }}><Gem size={18} />Prism · 칼바람 아수라장 증바람 모임</span>
        <span className="row" style={{ gap: 16 }}>
          {me && <button type="button" className="foot-link" onClick={() => setAsking(true)}>문의하기</button>}
          <NavLink to="/privacy" className="foot-link">개인정보 처리방침</NavLink>
        </span>
      </div></footer>
      {asking && me && <InquiryDialog api={api} onClose={() => setAsking(false)} />}
    </>
  );
}

/** 휴대폰: 햄버거를 누르면 옆에서 밀려 나오는 메뉴. 아래쪽에 디스코드·카카오톡·테마 */
function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me, login, links } = useSession();
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
        {me ? <NavLink to="/me" className="mmenu-me" tabIndex={open ? 0 : -1}><FacePresence p={me.presence}><MemberFace nick={me.nick} skin={me.skin} size={40} /></FacePresence><span><b><NickName nick={me.nick} /></b><small>내 페이지</small></span></NavLink>
          : <button type="button" className="btn primary mmenu-login" tabIndex={open ? 0 : -1} onClick={login}><Icon name="discord" />디스코드로 로그인</button>}
        <nav className="mmenu-nav">{NAV.map(([to, label, icon]) => <NavLink key={to} to={to} tabIndex={open ? 0 : -1}><Icon name={icon} />{label}</NavLink>)}</nav>
        <span className="sp" />
        <div className="mmenu-foot">
          <NavLink to="/shop" className="mmenu-shop" tabIndex={open ? 0 : -1}><Icon name="bag" />상점</NavLink>
          <div className="mmenu-row"><span className="k">화면</span><Seg value={theme} options={[['system', '시스템'], ['light', '라이트'], ['dark', '다크']]} onChange={(m) => { setThemeMode(m); setTheme(m); }} /></div>
        </div>
      </aside>
    </div>
  );
}
