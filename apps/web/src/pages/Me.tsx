import { AUGMENT, CHAMPIONS, personalStats, pct, streakOf, type Game } from '@prism/core';
import { AugImg, ChampImg, Empty, Icon, Initial, Recent10, useLoad } from '@prism/ui';
import { Link } from 'react-router-dom';
import { useSession } from '../session';

export function MePage() {
  const { me, ready, api, login, logout } = useSession();
  const games = useLoad<{ games: Game[] }>(api, me ? '/api/me/games' : null).data?.games ?? null;
  if (!ready) return null;
  if (!me) return <section className="section"><div className="wrap"><Empty action={<button type="button" className="btn primary" onClick={login}><Icon name="discord" />디스코드로 로그인</button>}>내 기록은 Prism 회원에게 열립니다.</Empty></div></section>;
  const P = games ? personalStats(games) : null;
  const st = games ? streakOf(games) : null;
  const champs = P ? Object.entries(P.champions).sort((a, b) => b[1].n - a[1].n).slice(0, 8) : [];
  return (
    <section className="section tight"><div className="wrap stack" style={{ gap: 24 }}>
      <div className="page-head"><div className="row" style={{ gap: 16 }}><Initial nick={me.nick} size={56} /><div><h1>{me.nick}</h1><p>{me.riotId ?? '롤 계정 미연결'} · {me.tier === 'admin' ? '관리자' : me.tier === 'member' ? '회원' : '새 회원'}</p></div></div>
        <span className="sp" /><button type="button" className="btn sm" onClick={logout}>로그아웃</button></div>
      {!me.linked && <div className="card pad"><b>롤 계정이 아직 연결되지 않았어요.</b><div className="muted">Prism 앱을 한 번 켜면 로그인된 롤 계정이 자동으로 연결되고, 그 뒤로는 앱 없이도 다른 회원의 앱이 내 판을 대신 기록합니다.</div></div>}
      {P && st && <div className="grid4">
        <section className="card stat"><span className="k">기록된 판</span><span className="v">{P.total.n}<small>판</small></span></section>
        <section className="card stat"><span className="k">승률</span><span className="v">{pct(P.total.w, P.total.n)}</span></section>
        <section className="card stat"><span className="k">지금</span><span className={`v ${st.win ? 'w' : 'l'}`}>{st.n}<small>{st.win ? '연승' : '연패'}</small></span></section>
        <section className="card stat"><span className="k">만난 챔피언</span><span className="v">{Object.keys(P.champions).length}<small>/ {Object.keys(CHAMPIONS).length}</small></span></section>
      </div>}
      <section className="card pad"><div className="card-head"><h2>최근 10판</h2></div>{games ? <Recent10 games={games} href={(c) => `/guide/${c}`} /> : <p className="meta">불러오는 중…</p>}</section>
      {P && P.total.n > 0 && <div className="grid2">
        <section className="card pad"><div className="card-head"><h2>자주 만난 챔피언</h2></div><div className="list">{champs.map(([id, r]) => <Link key={id} to={`/guide/${id}`} className="item"><ChampImg id={Number(id)} size={32} /><span className="title">{CHAMPIONS[Number(id)]?.name}</span><span><b>{pct(r.w, r.n)}</b> <span className="meta">{r.n}판</span></span></Link>)}</div></section>
        <section className="card pad"><div className="card-head"><h2>자주 고른 증강</h2></div>{P.augments.length ? <div className="list">{P.augments.slice(0, 8).map((a) => <div key={a.id} className="item"><AugImg id={a.id} size={28} /><span className="title"><AugLabel id={a.id} /></span><span><b>{pct(a.w, a.n)}</b> <span className="meta">{a.n}회</span></span></div>)}</div> : <Empty>증강 기록이 아직 없습니다.</Empty>}</section>
      </div>}
    </div></section>
  );
}
function AugLabel({ id }: { id: number }) { return <>{AUGMENT[id]?.name ?? `#${id}`}</>; }
