import { useNavigate, useParams } from 'react-router-dom';
import { Empty, Icon, MemberView, MissionsView, RankingView, ShopView } from '@prism/ui';
import type { State } from '../controller';
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
  return <MemberView key={target} api={api} id={target} self={target === s.me.id} onChampion={(c) => nav(`/champions/${c}`)} />;
}

export function ShopPage({ s, onLogin }: { s: State; onLogin: () => void }) {
  if (!s.me) return <NeedLogin s={s} onLogin={onLogin} what="상점" />;
  const me = s.me;
  // 대표 스킨이 없으면 가장 많이 한 챔피언으로 미리 보기
  const top = Object.entries(s.personal.champions).sort((a, b) => b[1].n - a[1].n)[0]?.[0];
  return <ShopView api={api} open={Boolean(me.perms?.shop)} me={{ nick: me.nick, skin: me.skin, champion: top ? Number(top) : null }} />;
}

export function MissionsPage({ s, onLogin }: { s: State; onLogin: () => void }) {
  const nav = useNavigate();
  if (!s.me) return <NeedLogin s={s} onLogin={onLogin} what="미션" />;
  return <MissionsView api={api} onChampion={(id) => nav(`/champions/${id}`)} />;
}
