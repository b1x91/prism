import { InviteHow, AppMembers, NowCard, InviteCard, BoardView, OmniSearch, ChannelButtons, CrewPulse, Empty, Icon, DiscordNowCard, ProspectBoard, useLoad } from '@prism/ui';
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
      <div className="crew-head"><h1 className="h1 hub-h">Prism</h1><OmniSearch scopes={['member']} hotkey api={api} onOpen={(_k, id) => nav(id === s.me?.id ? '/me' : `/members/${id}`)} /><ChannelButtons links={links} onOpen={(u) => bridge.openUrl(u)} /></div>
      <DiscordNowCard api={api} onOpen={(u) => bridge.openUrl(u)} admin={s.me.tier === 'admin'} />
      <NowCard api={api} meId={s.me.id} canDraw={Boolean(s.me.canScrim)} onMember={(id) => nav(id === s.me?.id ? '/me' : `/members/${id}`)} onAutoChange={() => void refreshSession()} />
      <CrewPulse api={api} onMember={(id) => nav(id === s.me?.id ? '/me' : `/members/${id}`)} />
      <AppMembers api={api} onMember={(id) => nav(id === s.me?.id ? '/me' : `/members/${id}`)} />
      {<ProspectBoard api={api} invite={links.discord} admin={Boolean(s.me.perms?.moderate)} />}
      <BoardView api={api} />
    </div>
  );
}

/** 친구 초대 (멤버 › 초대 탭, v3.142) */
export function InvitePage({ s, onLogin }: { s: State; onLogin: () => void }) {
  if (!s.me) return <section className="card pad"><Empty action={<button type="button" className="btn primary" onClick={onLogin}><Icon name="discord" />디스코드로 로그인</button>}>친구 초대는 Prism 회원에게 열립니다.</Empty></section>;
  return <div className="stack" style={{ gap: 16 }}><InviteCard api={api} /><InviteHow /></div>;
}
