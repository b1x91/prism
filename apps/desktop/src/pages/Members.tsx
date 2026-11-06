import { useNavigate, useParams } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Empty, Icon, InquiryView, MemberView, MissionsView, NewsView, RankingView, ShopView, StaffInquiryView, StaffShopView, StaffMembersView, StaffJoinView, StaffTodoView, StaffView, goBack, setKept } from '@prism/ui';
import { inquiryExtra, refreshSession, type State } from '../controller';
import { josa } from '@prism/core';
import { api } from '../bridge';
import { VERSION } from '../version';

function NeedLogin({ s, onLogin, what }: { s: State; onLogin: () => void; what: string }) {
  if (!s.session.configured) return <section className="card pad"><Empty>Prism 모임 기능은 곧 열립니다.</Empty></section>;
  return <section className="card pad"><Empty action={<button type="button" className="btn primary" onClick={onLogin}><Icon name="discord" />디스코드로 로그인</button>}>{josa(what, '은/는')} Prism 회원에게 열립니다.</Empty></section>;
}

export function RankingPage({ s, onLogin }: { s: State; onLogin: () => void }) {
  const nav = useNavigate();
  if (!s.me) return <NeedLogin s={s} onLogin={onLogin} what="랭킹" />;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <h1 className="h1 hub-h">랭킹</h1>
      <RankingView api={api} meId={s.me.id} open={s.me.perms?.ranking !== false} gate={s.me.rankingGate} onOpen={(id) => nav(`/members/${id}`)} />
    </div>
  );
}

export function MemberPage({ s, onLogin }: { s: State; onLogin: () => void }) {
  const { id } = useParams();
  const nav = useNavigate();
  if (!s.me) return <NeedLogin s={s} onLogin={onLogin} what="회원 페이지" />;
  const target = id ?? s.me.id;
  return <MemberView key={target} api={api} id={target} self={target === s.me.id} onChampion={(c) => nav(`/champions/${c}`)} insight={insightParam()} onShop={() => nav('/shop')} meId={s.me.id} onMember={(x) => nav(x === s.me?.id ? '/me' : `/members/${x}`)} />;
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
      <h1 className="h1 hub-h">소식</h1>
      <NewsView api={api} onRead={() => void refreshSession()} onNewAugments={() => { setKept('aug.fresh', true); nav('/augments'); }} />
    </div>
  );
}

/** 운영 (v3.107 → v3.160) — 운영진만. 위 탭(대시보드 · 멤버 · 할 일 · 문의)이 제목을 대신한다 */
function StaffGate({ s, onLogin, children }: { s: State; onLogin: () => void; children: (open: (id: string) => void) => ReactNode }) {
  const nav = useNavigate();
  if (!s.me) return <NeedLogin s={s} onLogin={onLogin} what="운영" />;
  if (!s.me.perms?.manage) return <section className="card pad"><Empty>운영진만 볼 수 있는 화면이에요.</Empty></section>;
  return <>{children((id) => nav(id === s.me?.id ? '/me' : `/members/${id}`))}</>;
}
export function StaffPage({ s, onLogin }: { s: State; onLogin: () => void }) {
  return <StaffGate s={s} onLogin={onLogin}>{(open) => <StaffView api={api} onOpen={open} onSeen={() => void refreshSession()} />}</StaffGate>;
}
export function StaffMembersPage({ s, onLogin }: { s: State; onLogin: () => void }) {
  return <StaffGate s={s} onLogin={onLogin}>{(open) => <StaffMembersView api={api} onOpen={open} onSeen={() => void refreshSession()} />}</StaffGate>;
}
export function StaffTodoPage({ s, onLogin }: { s: State; onLogin: () => void }) {
  const nav = useNavigate();
  return <StaffGate s={s} onLogin={onLogin}>{(open) => <StaffTodoView api={api} onOpen={open} onJoin={() => nav('/staff/join')} onSeen={() => void refreshSession()} />}</StaffGate>;
}
export function StaffInquiryPage({ s, onLogin }: { s: State; onLogin: () => void }) {
  return <StaffGate s={s} onLogin={onLogin}>{(open) => <StaffInquiryView api={api} onOpen={open} />}</StaffGate>;
}
/** 운영 › 상점관리 (v3.185) — 관리자만 */
export function StaffShopPage({ s, onLogin }: { s: State; onLogin: () => void }) {
  return <StaffGate s={s} onLogin={onLogin}>{(open) => (s.me?.tier === 'admin' ? <StaffShopView api={api} onOpen={open} /> : <Empty>관리자만 볼 수 있는 화면이에요.</Empty>)}</StaffGate>;
}
/** 운영 › 할 일 › 가입 신청 전체 보드 (v3.148) */
export function StaffJoinPage({ s, onLogin }: { s: State; onLogin: () => void }) {
  const nav = useNavigate();
  return (
    <StaffGate s={s} onLogin={onLogin}>{(open) => (
      <div className="stack" style={{ gap: 16 }}>
        <div><button type="button" className="crumb" onClick={() => goBack(nav, '/staff/todo')}><Icon name="back" />할 일</button><h2 className="h2">가입 신청 전체 보드</h2></div>
        <StaffJoinView api={api} onOpen={open} onSeen={() => void refreshSession()} />
      </div>
    )}</StaffGate>
  );
}

/** 문의 (v3.137) — 회원: 문의 쓰기(앱 상태 함께) · 내 문의 / 운영진: 작업 목록 */
export function InquiryPage({ s, onLogin }: { s: State; onLogin: () => void }) {
  if (!s.me) return <NeedLogin s={s} onLogin={onLogin} what="문의" />;
  return <InquiryView api={api} extra={() => inquiryExtra(VERSION)} />;
}
