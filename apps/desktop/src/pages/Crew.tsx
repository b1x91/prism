import { AppMembers, NowCard, InviteCard, BoardView, ChannelButtons, CrewPulse, Empty, Icon, DiscordNowCard, ProspectBoard, useLoad } from '@prism/ui';
import { useNavigate } from 'react-router-dom';
import { withDefaults, type Links } from '@prism/core';
import type { State } from '../controller';
import { api, bridge } from '../bridge';
import { refreshSession } from '../controller';

export function CrewPage({ s, onLogin }: { s: State; onLogin: () => void }) {
  const links = withDefaults(useLoad<Links>(api, '/links').data);
  const nav = useNavigate();
  if (!s.session.configured) return <section className="card pad"><Empty>Prism 모임 기능은 곧 열립니다.</Empty></section>;
  if (!s.me) return <section className="card pad"><Empty action={<button type="button" className="btn primary" onClick={onLogin}><Icon name="discord" />디스코드로 로그인</button>}>모임 기록, 미션, 실전 증강 승률은 Prism 회원에게 열립니다.</Empty></section>;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="crew-head"><h1 className="h1">Prism</h1><ChannelButtons links={links} onOpen={(u) => bridge.openUrl(u)} /></div>
      <DiscordNowCard api={api} onOpen={(u) => bridge.openUrl(u)} admin={s.me.tier === 'admin'} />
      <NowCard api={api} meId={s.me.id} onMember={(id) => nav(id === s.me?.id ? '/me' : `/members/${id}`)} onAutoChange={() => void refreshSession()} />
      <CrewPulse api={api} onMember={(id) => nav(id === s.me?.id ? '/me' : `/members/${id}`)} />
      <AppMembers api={api} onMember={(id) => nav(id === s.me?.id ? '/me' : `/members/${id}`)} />
      {<ProspectBoard api={api} invite={links.discord} admin={Boolean(s.me.perms?.moderate)} />}
      <InviteCard api={api} />
      <BoardView api={api} />
    </div>
  );
}
