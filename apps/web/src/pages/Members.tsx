import { useNavigate, useParams } from 'react-router-dom';
import { Empty, Icon, MemberView, RankingView } from '@prism/ui';
import { useSession } from '../session';

function NeedLogin({ what }: { what: string }) {
  const { login } = useSession();
  return <section className="section"><div className="wrap"><Empty action={<button type="button" className="btn primary" onClick={login}><Icon name="discord" />디스코드로 로그인</button>}>{what}은 Prism 회원에게 열립니다.</Empty></div></section>;
}

export function RankingPage() {
  const { me, ready, api } = useSession();
  const nav = useNavigate();
  if (!ready) return null;
  if (!me) return <NeedLogin what="랭킹" />;
  return (
    <section className="section tight"><div className="wrap stack" style={{ gap: 24 }}>
      <div className="page-head"><div><h1>랭킹</h1><p>Prism에 기록된 아수라장 판수와 승률. 이름을 누르면 그 회원의 페이지로 갑니다.</p></div></div>
      <RankingView api={api} meId={me.id} onOpen={(id) => nav(`/members/${id}`)} />
    </div></section>
  );
}

export function MemberPage() {
  const { id } = useParams();
  const { me, ready, api, logout } = useSession();
  const nav = useNavigate();
  if (!ready) return null;
  if (!me) return <NeedLogin what={id ? '회원 페이지' : '내 페이지'} />;
  const target = id ?? me.id;
  return (
    <section className="section tight"><div className="wrap">
      <MemberView key={target} api={api} id={target} onChampion={(c) => nav(`/champions/${c}`)}
        actions={target === me.id ? <button type="button" className="btn sm" onClick={logout}>로그아웃</button> : undefined} />
    </div></section>
  );
}
