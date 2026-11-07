import { useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Empty, Icon, PageSkeleton, StaffInquiryView, StaffJoinView, StaffShopView, StaffMembersView, StaffTodoView, StaffView, goBack } from '@prism/ui';
import { useSession } from '../session';

/** 운영 (v3.107 → v3.160) — 운영진만. 위 탭(대시보드 · 멤버 · 할 일 · 문의)이 제목을 대신한다 */
function StaffGate({ children }: { children: (p: { open: (id: string) => void }) => ReactNode }) {
  const { me, ready } = useSession();
  const nav = useNavigate();
  if (!ready) return <section className="section tight"><div className="wrap"><PageSkeleton kind="crew" /></div></section>;
  if (!me?.perms?.manage) return <section className="section"><div className="wrap"><Empty>운영진만 볼 수 있는 화면이에요.</Empty></div></section>;
  return <section className="section tight"><div className="wrap">{children({ open: (id) => nav(id === me.id ? '/me' : `/members/${id}`) })}</div></section>;
}

export function StaffPage() {
  const { api, refresh } = useSession();
  return <StaffGate>{({ open }) => <StaffView api={api} onOpen={open} onSeen={refresh} />}</StaffGate>;
}

export function StaffMembersPage() {
  const { api, refresh } = useSession();
  return <StaffGate>{({ open }) => <StaffMembersView api={api} onOpen={open} onSeen={refresh} />}</StaffGate>;
}

export function StaffTodoPage() {
  const { api, refresh } = useSession();
  const nav = useNavigate();
  return <StaffGate>{({ open }) => <StaffTodoView api={api} onOpen={open} onJoin={() => nav('/staff/join')} onSeen={refresh} />}</StaffGate>;
}

export function StaffInquiryPage() {
  const { api } = useSession();
  return <StaffGate>{({ open }) => <StaffInquiryView api={api} onOpen={open} />}</StaffGate>;
}

/** 운영 › 상점관리 (v3.186) — 관리자만 */
export function StaffShopPage() {
  const { api, me } = useSession();
  return <StaffGate>{({ open }) => (me?.tier === 'admin' ? <StaffShopView api={api} onOpen={open} /> : <Empty>관리자만 볼 수 있는 화면이에요.</Empty>)}</StaffGate>;
}

/** 운영 › 할 일 › 가입 신청 전체 보드 (v3.148) — 메모 · 거절 · 롤 이름 고치기 · 면접방 설정 */
export function StaffJoinPage() {
  const { api, refresh } = useSession();
  const nav = useNavigate();
  return (
    <StaffGate>{({ open }) => (
      <div className="stack" style={{ gap: 16 }}>
        <div className="page-head"><div><button type="button" className="crumb" onClick={() => goBack(nav, '/staff/todo')}><Icon name="back" />할 일</button><h2 className="h2">가입 신청 전체 보드</h2><p>메모 · 보류 · 거절 · 롤 이름 고치기 · 면접방 설정까지 여기서 해요.</p></div></div>
        <StaffJoinView api={api} onOpen={open} onSeen={refresh} />
      </div>
    )}</StaffGate>
  );
}
