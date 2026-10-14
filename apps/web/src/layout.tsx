import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import { AugmentOpen, ChannelIcons, FacePresence, MatchSource, Gem, Icon, MemberFace, Seg, getThemeMode, setThemeMode, toggleTheme, type IconName, type ThemeMode } from '@prism/ui';
import type { MatchDetail } from '@prism/core';
import { useSession } from './session';

const NAV: [string, string, IconName][] = [['/champions', '챔피언', 'grid'], ['/augments', '증강', 'spark'], ['/dex', '도감', 'book'], ['/ranking', '랭킹', 'trophy'], ['/crew', '모임', 'users'], ['/shop', '상점', 'bag']];

export function Layout() {
  const { me, login, links, api } = useSession();
  const { pathname } = useLocation();
  const matchSource = useCallback((id: number) => (me ? api.get<MatchDetail>(`/api/games/${id}`).catch(() => null) : Promise.resolve(null)), [api, me]);
  const [menu, setMenu] = useState(false);
  useEffect(() => { scrollTo(0, 0); setMenu(false); }, [pathname]);
  const nav = useNavigate();
  const openAug = useCallback((id: number) => nav(`/augments/${id}`), [nav]);
  return (
    <>
      <header className="top"><div className="wrap">
        <NavLink to="/" className="brand"><Gem size={28} />Prism</NavLink>
        <nav className="tabs">{NAV.map(([to, label]) => <NavLink key={to} to={to}>{label}</NavLink>)}</nav>
        <span className="sp" />
        <span className="top-wide"><ChannelIcons links={links} size={32} />
          <button className="icon-btn" type="button" title="테마 바꾸기" onClick={toggleTheme}><Icon name="moon" /></button></span>
        {me ? <NavLink to="/me" className="me-btn" title="내 페이지"><FacePresence p={me.presence}><MemberFace nick={me.nick} skin={me.skin} size={30} /></FacePresence><span>{me.nick}</span></NavLink>
          : <button type="button" className="btn sm primary" onClick={login}><Icon name="discord" />로그인</button>}
        <button type="button" className="icon-btn menu-btn" aria-label="메뉴 열기" aria-expanded={menu} onClick={() => setMenu(true)}><Icon name="menu" /></button>
      </div></header>
      <MobileMenu open={menu} onClose={() => setMenu(false)} />
      <main><AugmentOpen.Provider value={openAug}><MatchSource.Provider value={matchSource}><Outlet /></MatchSource.Provider></AugmentOpen.Provider></main>
      <footer className="foot"><div className="wrap">
        <span className="row" style={{ gap: 8 }}><Gem size={18} />Prism · 칼바람 아수라장 증바람 모임</span>
        <span>Prism은 Riot Games의 공식 서비스가 아니며 Riot Games와 무관합니다. League of Legends 및 관련 이미지는 Riot Games의 자산입니다. · <NavLink to="/privacy" className="foot-link">개인정보 처리방침</NavLink></span>
      </div></footer>
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
          <NavLink to="/" className="brand" tabIndex={open ? 0 : -1}><Gem size={28} />Prism</NavLink>
          <button type="button" className="icon-btn" aria-label="메뉴 닫기" tabIndex={open ? 0 : -1} onClick={onClose}><Icon name="x" /></button>
        </div>
        {me ? <NavLink to="/me" className="mmenu-me" tabIndex={open ? 0 : -1}><FacePresence p={me.presence}><MemberFace nick={me.nick} skin={me.skin} size={40} /></FacePresence><span><b>{me.nick}</b><small>내 페이지</small></span></NavLink>
          : <button type="button" className="btn primary mmenu-login" tabIndex={open ? 0 : -1} onClick={login}><Icon name="discord" />디스코드로 로그인</button>}
        <nav className="mmenu-nav">{NAV.map(([to, label, icon]) => <NavLink key={to} to={to} tabIndex={open ? 0 : -1}><Icon name={icon} />{label}</NavLink>)}</nav>
        <span className="sp" />
        <div className="mmenu-foot">
          <div className="mmenu-row"><span className="k">모임 채널</span><ChannelIcons links={links} size={36} /></div>
          <div className="mmenu-row"><span className="k">화면</span><Seg value={theme} options={[['system', '시스템'], ['light', '라이트'], ['dark', '다크']]} onChange={(m) => { setThemeMode(m); setTheme(m); }} /></div>
        </div>
      </aside>
    </div>
  );
}
