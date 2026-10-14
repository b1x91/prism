import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useCallback, useEffect } from 'react';
import { AugmentOpen, ChannelIcons, Gem, Icon, MemberFace, toggleTheme, type IconName } from '@prism/ui';
import { useSession } from './session';

const NAV: [string, string, IconName][] = [['/champions', '챔피언', 'grid'], ['/augments', '증강', 'spark'], ['/dex', '도감', 'book'], ['/ranking', '랭킹', 'trophy'], ['/crew', '모임', 'users']];

export function Layout() {
  const { me, login, links } = useSession();
  const { pathname } = useLocation();
  useEffect(() => { scrollTo(0, 0); }, [pathname]);
  const nav = useNavigate();
  const openAug = useCallback((id: number) => nav(`/augments/${id}`), [nav]);
  return (
    <>
      <header className="top"><div className="wrap">
        <NavLink to="/" className="brand"><Gem size={28} />Prism</NavLink>
        <nav className="tabs">{NAV.map(([to, label]) => <NavLink key={to} to={to}>{label}</NavLink>)}</nav>
        <span className="sp" />
        <ChannelIcons links={links} size={32} />
        <button className="icon-btn" type="button" title="테마 바꾸기" onClick={toggleTheme}><Icon name="moon" /></button>
        {me ? <NavLink to="/me" className="me-btn" title="내 페이지"><MemberFace nick={me.nick} skin={me.skin} size={30} /><span>{me.nick}</span></NavLink>
          : <button type="button" className="btn sm primary" onClick={login}><Icon name="discord" />로그인</button>}
      </div></header>
      <main><AugmentOpen.Provider value={openAug}><Outlet /></AugmentOpen.Provider></main>
      <nav className="tabbar">{NAV.map(([to, label, icon]) => <NavLink key={to} to={to}><Icon name={icon} />{label}</NavLink>)}</nav>
      <footer className="foot"><div className="wrap">
        <span className="row" style={{ gap: 8 }}><Gem size={18} />Prism · 칼바람 아수라장 증바람 모임</span>
        <span>Prism은 Riot Games의 공식 서비스가 아니며 Riot Games와 무관합니다. League of Legends 및 관련 이미지는 Riot Games의 자산입니다.</span>
      </div></footer>
    </>
  );
}
