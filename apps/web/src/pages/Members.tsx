import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Empty, Gem, Icon, MemberSkeleton, MemberView, MissionsView, PageSkeleton, PublicProfileView, RankingView, ShopView } from '@prism/ui';
import type { PublicProfile } from '@prism/core';
import { SERVER, useSession } from '../session';

function NeedLogin({ what }: { what: string }) {
  const { login } = useSession();
  return <section className="section"><div className="wrap"><Empty action={<button type="button" className="btn primary" onClick={login}><Icon name="discord" />디스코드로 로그인</button>}>{what}은 Prism 회원에게 열립니다.</Empty></div></section>;
}

export function RankingPage() {
  const { me, ready, api } = useSession();
  const nav = useNavigate();
  if (!ready) return <section className="section tight"><div className="wrap"><PageSkeleton kind="ranking" /></div></section>;
  if (!me) return <NeedLogin what="랭킹" />;
  return (
    <section className="section tight"><div className="wrap stack" style={{ gap: 24 }}>
      <div className="page-head"><div><h1>랭킹</h1><p>Prism에 기록된 아수라장 판수와 승률. 이름을 누르면 그 회원의 페이지로 갑니다.</p></div></div>
      <RankingView api={api} meId={me.id} open={me.perms?.ranking !== false} gate={me.rankingGate} onOpen={(id) => nav(`/members/${id}`)} />
    </div></section>
  );
}

export function MemberPage() {
  const { id } = useParams();
  const { me, ready, api, logout } = useSession();
  const nav = useNavigate();
  if (!ready) return <section className="section tight"><div className="wrap"><PageSkeleton kind="member" /></div></section>;
  if (!me) return <NeedLogin what={id ? '회원 페이지' : '내 페이지'} />;
  const target = id ?? me.id;
  return (
    <section className="section tight"><div className="wrap">
      <MemberView key={target} api={api} id={target} onChampion={(c) => nav(`/champions/${c}`)}
        actions={target === me.id ? <button type="button" className="btn sm" onClick={logout}>로그아웃</button> : undefined} />
    </div></section>
  );
}

export function ShopPage() {
  const { me, ready, api } = useSession();
  if (!ready) return <section className="section tight"><div className="wrap"><PageSkeleton kind="shop" /></div></section>;
  if (!me) return <NeedLogin what="상점" />;
  return (
    <section className="section tight"><div className="wrap">
      <ShopView api={api} open={Boolean(me.perms?.shop)} me={{ nick: me.nick, skin: me.skin }} />
    </div></section>
  );
}

/** 공유 링크 (로그인 없이): 그 사람의 강점만. 모임 정보는 없다 */
export function PublicPage() {
  const { id } = useParams();
  const [data, setData] = useState<PublicProfile | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!id) return;
    fetch(`${SERVER}/public/${encodeURIComponent(id)}`).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error ?? '불러오지 못했어요'); setData(j); }).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [id]);
  useEffect(() => { if (data) document.title = `${data.nick} · Prism`; }, [data]);
  if (err) return <section className="section"><div className="wrap"><Empty action={<Link className="btn primary" to="/">Prism 둘러보기</Link>}>{err}</Empty></div></section>;
  if (!data) return <section className="section tight"><div className="wrap"><MemberSkeleton public /></div></section>;
  return (
    <section className="section tight"><div className="wrap">
      <PublicProfileView data={data} join={<Link className="btn sm primary" to="/"><Gem size={14} src="/brand/prism-32.png" />Prism 알아보기</Link>} />
    </div></section>
  );
}

export function MissionsPage() {
  const { me, ready, api } = useSession();
  const nav = useNavigate();
  if (!ready) return <section className="section tight"><div className="wrap"><PageSkeleton kind="missions" /></div></section>;
  if (!me) return <NeedLogin what="미션" />;
  return (
    <section className="section tight"><div className="wrap">
      <MissionsView api={api} onChampion={(id) => nav(`/champions/${id}`)} />
    </div></section>
  );
}
