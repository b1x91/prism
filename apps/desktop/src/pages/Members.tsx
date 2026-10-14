import { useNavigate, useParams } from 'react-router-dom';
import { Empty, Icon, MemberView, ProfileHero, RankingView, ShopView } from '@prism/ui';
import type { State } from '../controller';
import { api } from '../bridge';

function NeedLogin({ s, onLogin, what }: { s: State; onLogin: () => void; what: string }) {
  if (!s.session.configured) return <section className="card pad"><Empty>Prism 모임 기능은 곧 열립니다.</Empty></section>;
  return <section className="card pad"><Empty action={<button type="button" className="btn primary" onClick={onLogin}><Icon name="discord" />디스코드로 로그인</button>}>{what}은 Prism 회원에게 열립니다.</Empty></section>;
}

export function RankingPage({ s, onLogin }: { s: State; onLogin: () => void }) {
  const nav = useNavigate();
  if (!s.me) return <NeedLogin s={s} onLogin={onLogin} what="랭킹" />;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <h1 className="h1">랭킹</h1>
      <RankingView api={api} meId={s.me.id} onOpen={(id) => nav(`/members/${id}`)} />
    </div>
  );
}

export function MemberPage({ s, onLogin }: { s: State; onLogin: () => void }) {
  const { id } = useParams();
  const nav = useNavigate();
  if (!s.me) return <NeedLogin s={s} onLogin={onLogin} what="회원 페이지" />;
  const target = id ?? s.me.id;
  return <MemberView key={target} api={api} id={target} onChampion={(c) => nav(`/champions/${c}`)}
    actions={target === s.me.id ? <button type="button" className="btn sm primary" onClick={() => nav('/shop')}><Icon name="bag" />상점</button> : undefined} />;
}

export function ShopPage({ s, onLogin }: { s: State; onLogin: () => void }) {
  if (!s.me) return <NeedLogin s={s} onLogin={onLogin} what="상점" />;
  const me = s.me;
  return <ShopView api={api} preview={(deco) => <ProfileHero nick={me.nick} skin={me.skin} deco={deco} corner={<span className="pill dark">미리 보기</span>} />} />;
}
