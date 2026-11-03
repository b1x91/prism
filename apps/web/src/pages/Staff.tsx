import { useNavigate } from 'react-router-dom';
import { Empty, Icon, PageSkeleton, StaffJoinView, StaffMembersView, StaffView, goBack } from '@prism/ui';
import { useSession } from '../session';

/** 운영 (v3.107) — 운영진만. 메뉴에도 운영진에게만 보인다 */
export function StaffPage() {
  const { me, ready, api, refresh } = useSession();
  const nav = useNavigate();
  if (!ready) return <section className="section tight"><div className="wrap"><PageSkeleton kind="crew" /></div></section>;
  if (!me?.perms?.manage) return <section className="section"><div className="wrap"><Empty>운영진만 볼 수 있는 화면이에요.</Empty></div></section>;
  return (
    <section className="section tight"><div className="wrap stack" style={{ gap: 24 }}>
      <div className="page-head"><div><h1>운영</h1><p>Prism 현황을 한눈에 보고, 멤버 관리로 승인·단계를 바꿔요.</p></div></div>
      <StaffView api={api} onOpen={(id) => nav(id === me.id ? '/me' : `/members/${id}`)} onMembers={() => nav('/staff/members')} onJoin={() => nav('/staff/join')} onInquiry={() => nav('/inquiry')} onSeen={refresh} />
    </div></section>
  );
}

/** 운영 › 멤버 관리 (v3.110) — 승인할 멤버 카드 + 전체 멤버 거르기·정렬 */
export function StaffMembersPage() {
  const { me, ready, api, refresh } = useSession();
  const nav = useNavigate();
  if (!ready) return <section className="section tight"><div className="wrap"><PageSkeleton kind="crew" /></div></section>;
  if (!me?.perms?.manage) return <section className="section"><div className="wrap"><Empty>운영진만 볼 수 있는 화면이에요.</Empty></div></section>;
  return (
    <section className="section tight"><div className="wrap stack" style={{ gap: 24 }}>
      <div className="page-head"><div><button type="button" className="crumb" onClick={() => goBack(nav, '/staff')}><Icon name="back" />운영</button><h1>멤버 관리</h1><p>승인할 멤버를 먼저, 그 아래에서 전체 멤버를 거르고 정렬해요.</p></div></div>
      <StaffMembersView api={api} onOpen={(id) => nav(id === me.id ? '/me' : `/members/${id}`)} onSeen={refresh} />
    </div></section>
  );
}

/** 운영 › 가입 신청 (v3.148) — 신청 → 면접 중 → 확정·초대 → 가입 완료 */
export function StaffJoinPage() {
  const { me, ready, api, refresh } = useSession();
  const nav = useNavigate();
  if (!ready) return <section className="section tight"><div className="wrap"><PageSkeleton kind="crew" /></div></section>;
  if (!me?.perms?.manage) return <section className="section"><div className="wrap"><Empty>운영진만 볼 수 있는 화면이에요.</Empty></div></section>;
  return (
    <section className="section tight"><div className="wrap stack" style={{ gap: 24 }}>
      <div className="page-head"><div><button type="button" className="crumb" onClick={() => goBack(nav, '/staff')}><Icon name="back" />운영</button><h1>가입 신청</h1><p>초대 링크로 들어온 신청을 면접하고, 두 명이 확정하면 톡방·디스코드로 초대해요.</p></div></div>
      <StaffJoinView api={api} onOpen={(id) => nav(id === me.id ? '/me' : `/members/${id}`)} onSeen={refresh} />
    </div></section>
  );
}
