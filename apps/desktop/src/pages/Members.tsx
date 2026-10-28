import { useNavigate, useParams } from 'react-router-dom';
import { Empty, Icon, MemberView, MissionsView, NewsView, RankingView, ShopView, StaffMembersView, StaffView, goBack, setKept } from '@prism/ui';
import { refreshSession, type State } from '../controller';
import { josa } from '@prism/core';
import { api } from '../bridge';

function NeedLogin({ s, onLogin, what }: { s: State; onLogin: () => void; what: string }) {
  if (!s.session.configured) return <section className="card pad"><Empty>Prism 모임 기능은 곧 열립니다.</Empty></section>;
  return <section className="card pad"><Empty action={<button type="button" className="btn primary" onClick={onLogin}><Icon name="discord" />디스코드로 로그인</button>}>{josa(what, '은/는')} Prism 회원에게 열립니다.</Empty></section>;
}

export function RankingPage({ s, onLogin }: { s: State; onLogin: () => void }) {
  const nav = useNavigate();
  if (!s.me) return <NeedLogin s={s} onLogin={onLogin} what="랭킹" />;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <h1 className="h1">랭킹</h1>
      <RankingView api={api} meId={s.me.id} open={s.me.perms?.ranking !== false} gate={s.me.rankingGate} onOpen={(id) => nav(`/members/${id}`)} />
    </div>
  );
}

export function MemberPage({ s, onLogin }: { s: State; onLogin: () => void }) {
  const { id } = useParams();
  const nav = useNavigate();
  if (!s.me) return <NeedLogin s={s} onLogin={onLogin} what="회원 페이지" />;
  const target = id ?? s.me.id;
  return <MemberView key={target} api={api} id={target} self={target === s.me.id} onChampion={(c) => nav(`/champions/${c}`)} insight={insightParam()} onShop={() => nav('/shop')} />;
}

/** 상점 '리포트 보기' → 내 페이지의 그 인사이트 (?insight=aug) */
const insightParam = () => { const k = new URLSearchParams(location.search).get('insight'); return k === 'aug' || k === 'partner' || k === 'golden' ? k : null; };

export function ShopPage({ s, onLogin }: { s: State; onLogin: () => void }) {
  const nav = useNavigate();
  if (!s.me) return <NeedLogin s={s} onLogin={onLogin} what="상점" />;
  const me = s.me;
  // 대표 스킨이 없으면 가장 많이 한 챔피언으로 미리 보기
  const top = Object.entries(s.personal.champions).sort((a, b) => b[1].n - a[1].n)[0]?.[0];
  return <ShopView api={api} open={Boolean(me.perms?.shop)} me={{ nick: me.nick, skin: me.skin, champion: top ? Number(top) : null }} onGo={(to, k) => nav(to === 'me' ? `/me${k ? `?insight=${k}` : ''}` : `/${to}`)} />;
}

export function MissionsPage({ s, onLogin }: { s: State; onLogin: () => void }) {
  const nav = useNavigate();
  if (!s.me) return <NeedLogin s={s} onLogin={onLogin} what="미션" />;
  return <MissionsView api={api} onChampion={(id) => nav(`/champions/${id}`)} />;
}

/** 소식 (v3.111) — 회원에게만 */
export function NewsPage({ s, onLogin }: { s: State; onLogin: () => void }) {
  const nav = useNavigate();
  if (!s.me) return <NeedLogin s={s} onLogin={onLogin} what="소식" />;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <h1 className="h1">소식</h1>
      <NewsView api={api} onRead={() => void refreshSession()} onNewAugments={() => { setKept('aug.fresh', true); nav('/augments'); }} />
    </div>
  );
}

/** 운영 (v3.107) — 운영진만. 사이드바에도 운영진에게만 보인다 */
export function StaffPage({ s, onLogin }: { s: State; onLogin: () => void }) {
  const nav = useNavigate();
  if (!s.me) return <NeedLogin s={s} onLogin={onLogin} what="운영" />;
  if (!s.me.perms?.manage) return <section className="card pad"><Empty>운영진만 볼 수 있는 화면이에요.</Empty></section>;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <h1 className="h1">운영</h1>
      <StaffView api={api} onOpen={(id) => nav(id === s.me?.id ? '/me' : `/members/${id}`)} onMembers={() => nav('/staff/members')} />
    </div>
  );
}

/** 운영 › 멤버 관리 (v3.110) */
export function StaffMembersPage({ s, onLogin }: { s: State; onLogin: () => void }) {
  const nav = useNavigate();
  if (!s.me) return <NeedLogin s={s} onLogin={onLogin} what="운영" />;
  if (!s.me.perms?.manage) return <section className="card pad"><Empty>운영진만 볼 수 있는 화면이에요.</Empty></section>;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div><button type="button" className="crumb" onClick={() => goBack(nav, '/staff')}><Icon name="back" />운영</button><h1 className="h1">멤버 관리</h1></div>
      <StaffMembersView api={api} onOpen={(id) => nav(id === s.me?.id ? '/me' : `/members/${id}`)} />
    </div>
  );
}
