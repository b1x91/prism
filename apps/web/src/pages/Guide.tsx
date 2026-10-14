import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CHAMPIONS, DATA_VERSION, type AugmentStats } from '@prism/core';
import { Artisans, AugmentCompare, AugmentGuide, ChampBanner, ChampGrid, ChampionCrew, Gem, Icon, Seg, useLoad } from '@prism/ui';
import { useSession } from '../session';

export function GuidePicker({ to }: { to: (id: number) => string }) {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  return (
    <section className="section tight"><div className="wrap">
      <div className="page-head"><div><h1>챔피언 고르기</h1><p>이름이나 초성으로 찾을 수 있어요.</p></div></div>
      <div className="card pad">
        <input className="input" style={{ marginBottom: 20 }} value={q} autoFocus onChange={(e) => setQ(e.target.value)} placeholder="챔피언 검색 (ㅇㄹ → 아리)" />
        <ChampGrid query={q} onPick={(id) => nav(to(id))} />
      </div>
    </div></section>
  );
}

function MemberLock() {
  const { login } = useSession();
  return (
    <div className="card pad row wrapr" style={{ gap: 16 }}>
      <Gem size={36} />
      <div style={{ flex: 1, minWidth: 220 }}><b style={{ fontSize: 16 }}>실제로 이겼을까?</b><div className="muted">Prism 회원끼리의 실전 기록으로 이 챔피언·증강의 승률이 함께 보입니다. 회원에게만 열려요.</div></div>
      <button type="button" className="btn primary" onClick={login}><Icon name="discord" />회원 로그인</button>
      <Link className="btn" to="/crew">Prism 알아보기</Link>
    </div>
  );
}

type Tab = 'guide' | 'compare' | 'crew';
export function Guide() {
  const { id } = useParams();
  const championId = Number(id);
  const { api, me } = useSession();
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>('guide');
  const stats = useLoad<AugmentStats>(api, me && championId ? `/api/augments?champion=${championId}` : null).data;
  if (!id) return <GuidePicker to={(x) => `/champions/${x}`} />;
  if (!CHAMPIONS[championId]) return <div className="wrap section">챔피언을 찾을 수 없습니다.</div>;
  return (
    <section className="section tight"><div className="wrap stack" style={{ gap: 24 }}>
      <ChampBanner id={championId} eyebrow="아수라장 증강 가이드" actions={<Link className="btn sm" to="/champions">다른 챔피언</Link>} />
      {me && <Artisans api={api} kind="champion" id={championId} onMember={(m) => nav(`/members/${m}`)} />}
      <div className="row wrapr">
        <Seg value={tab} options={[['guide', '어울리는 증강'], ['compare', '증강 3개 비교'], ['crew', '모임 기록']]} onChange={setTab} />
        <span className="sp" /><span className="meta">게임 데이터 {DATA_VERSION} 기준</span>
      </div>
      {tab === 'guide' && <><AugmentGuide championId={championId} stats={stats} />{!me && <MemberLock />}
        <p className="meta">"잘 맞음"은 챔피언 역할·피해 유형·스킬과 증강 효과를 맞춰 본 어울림입니다. 증강 자체의 세기와는 다를 수 있어요.</p></>}
      {tab === 'compare' && <AugmentCompare championId={championId} stats={stats} />}
      {tab === 'crew' && (me ? <ChampionCrew api={api} championId={championId} /> : <MemberLock />)}
    </div></section>
  );
}

export function Compare() {
  const { id } = useParams();
  const championId = Number(id);
  const { api, me } = useSession();
  const stats = useLoad<AugmentStats>(api, me && championId ? `/api/augments?champion=${championId}` : null).data;
  if (!id) return <GuidePicker to={(x) => `/compare/${x}`} />;
  if (!CHAMPIONS[championId]) return <div className="wrap section">챔피언을 찾을 수 없습니다.</div>;
  return (
    <section className="section tight"><div className="wrap stack" style={{ gap: 24 }}>
      <ChampBanner id={championId} eyebrow="증강 3개 비교" actions={<Link className="btn sm" to="/compare">다른 챔피언</Link>}>
        <p style={{ margin: '12px 0 0', color: 'rgba(255,255,255,.75)' }}>지금 뜬 증강 세 개를 고르면, 이 챔피언에게 맞는 순서대로 보여드려요.</p>
      </ChampBanner>
      <AugmentCompare championId={championId} stats={stats} />
    </div></section>
  );
}
