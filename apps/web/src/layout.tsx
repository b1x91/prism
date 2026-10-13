import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { Gem, Icon, Initial, toggleTheme, type IconName } from '@prism/ui';
import { useSession } from './session';

const NAV: [string, string, IconName][] = [['/guide', '증강 가이드', 'spark'], ['/compare', '3개 비교', 'compare'], ['/augments', '증강 도감', 'book'], ['/crew', '모임', 'users']];

export function Layout() {
  const { me, login, links } = useSession();
  const { pathname } = useLocation();
  useEffect(() => { scrollTo(0, 0); }, [pathname]);
  return (
    <>
      <header className="top"><div className="wrap">
        <NavLink to="/" className="brand"><Gem size={28} />Prism</NavLink>
        <nav className="tabs">{NAV.map(([to, label]) => <NavLink key={to} to={to}>{label}</NavLink>)}</nav>
        <span className="sp" />
        <span className="top-ch">
          {links.discord && <a className="ch-ic discord" href={links.discord} target="_blank" rel="noopener noreferrer" title="디스코드"><Icon name="discord" /></a>}
          {links.kakao && <a className="ch-ic kakao" href={links.kakao} target="_blank" rel="noopener noreferrer" title="카카오톡"><Icon name="talk" /></a>}
        </span>
        <button className="icon-btn" type="button" title="테마 바꾸기" onClick={toggleTheme}><Icon name="moon" /></button>
        {me ? <NavLink to="/me" className="me-btn" title="내 기록"><Initial nick={me.nick} size={30} /><span>{me.nick}</span></NavLink>
          : <button type="button" className="btn sm primary" onClick={login}><Icon name="discord" />로그인</button>}
      </div></header>
      <main><Outlet /></main>
      <nav className="tabbar">{NAV.map(([to, label, icon]) => <NavLink key={to} to={to}><Icon name={icon} />{label}</NavLink>)}</nav>
      <footer className="foot"><div className="wrap">
        <span className="row" style={{ gap: 8 }}><Gem size={18} />Prism · 칼바람 아수라장 증바람 모임</span>
        <span>Prism은 Riot Games의 공식 서비스가 아니며 Riot Games와 무관합니다. League of Legends 및 관련 이미지는 Riot Games의 자산입니다.</span>
      </div></footer>
    </>
  );
}
