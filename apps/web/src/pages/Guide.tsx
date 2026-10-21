import { Link, useNavigate, useParams } from 'react-router-dom';
import { CHAMPIONS, DATA_VERSION, type AugmentStats } from '@prism/core';
import { Artisans, AugmentCompare, AugmentGuide, ChampBanner, ChampGrid, ChampItems, ChampionCrew, ChampSkills, Gem, GlassBtn, Icon, Seg, goBack, useKept, useLoad } from '@prism/ui';
import { useSession } from '../session';

export function GuidePicker({ to }: { to: (id: number) => string }) {
  const nav = useNavigate();
  const [q, setQ] = useKept('champ.q', '');
  return (
    <section className="section tight"><div className="wrap">
      <div className="page-head"><div><h1>챔프 고르기</h1><p>챔프를 누르면 어울리는 증강·3개 비교·모임 기록을 볼 수 있어요.</p></div></div>
      <ChampGrid query={q} onQuery={setQ} onPick={(id) => nav(to(id))} />
    </div></section>
  );
}

function MemberLock() {
  const { login } = useSession();
  return (
    <div className="card pad row wrapr" style={{ gap: 16 }}>
      <Gem size={36} />
      <div style={{ flex: 1, minWidth: 220 }}><b style={{ fontSize: 16 }}>실제로 이겼을까?</b><div className="muted">Prism 회원끼리의 실전 기록으로 이 챔프·증강의 승률이 함께 보입니다. 회원에게만 열려요.</div></div>
      <button type="button" className="btn primary" onClick={login}><Icon name="discord" />회원 로그인</button>
      <Link className="btn" to="/crew">Prism 알아보기</Link>
    </div>
  );
}

type Tab = 'guide' | 'skills' | 'items' | 'compare' | 'crew';
export function Guide() {
  const { id } = useParams();
  const championId = Number(id);
  const { api, member } = useSession();
  const nav = useNavigate();
  const [tab, setTab] = useKept<Tab>('champ.tab', 'guide');
  const sl = useLoad<AugmentStats>(api, member !== false && championId ? `/api/augments?champion=${championId}` : null);
  const stats = sl.data;
  if (!id) return <GuidePicker to={(x) => `/champions/${x}`} />;
  if (!CHAMPIONS[championId]) return <div className="wrap section">챔프를 찾을 수 없습니다.</div>;
  return (
    <section className="section tight"><div className="wrap stack" style={{ gap: 24 }}>
      <ChampBanner id={championId} eyebrow="아수라장 증강 가이드" actions={<GlassBtn icon="back" label="챔프 목록으로" onClick={() => goBack(nav, '/champions')} />} />
      {member !== false && <Artisans api={api} kind="champion" id={championId} onMember={(m) => nav(`/members/${m}`)} />}
      <div className="row wrapr">
        <Seg value={tab} options={[['guide', '어울리는 증강'], ['skills', '스킬'], ['items', '아이템'], ['compare', '3개 비교'], ['crew', '모임 기록']]} onChange={setTab} />
        <span className="sp" /><span className="meta">게임 데이터 {DATA_VERSION} 기준</span>
      </div>
      {tab === 'guide' && <><AugmentGuide championId={championId} stats={stats} loading={member !== false && !stats && !sl.error} />{member === false && <MemberLock />}
        <p className="meta">"잘 맞음"은 챔프 역할·피해 유형·스킬과 증강 효과를 맞춰 본 어울림입니다. 증강 자체의 세기와는 다를 수 있어요.</p></>}
      {tab === 'skills' && <ChampSkills championId={championId} />}
      {tab === 'items' && <ChampItems api={member !== false ? api : null} championId={championId} />}
      {tab === 'compare' && <AugmentCompare championId={championId} stats={stats} />}
      {tab === 'crew' && (member !== false ? <ChampionCrew api={api} championId={championId} /> : <MemberLock />)}
    </div></section>
  );
}

export function Compare() {
  const { id } = useParams();
  const championId = Number(id);
  const { api, member } = useSession();
  const nav = useNavigate();
  const stats = useLoad<AugmentStats>(api, member !== false && championId ? `/api/augments?champion=${championId}` : null).data;
  if (!id) return <GuidePicker to={(x) => `/compare/${x}`} />;
  if (!CHAMPIONS[championId]) return <div className="wrap section">챔프를 찾을 수 없습니다.</div>;
  return (
    <section className="section tight"><div className="wrap stack" style={{ gap: 24 }}>
      <ChampBanner id={championId} eyebrow="증강 3개 비교" actions={<GlassBtn icon="back" label="챔프 목록으로" onClick={() => goBack(nav, '/compare')} />}>
        <p style={{ margin: '12px 0 0', color: 'rgba(255,255,255,.75)' }}>지금 뜬 증강 세 개를 고르면, 이 챔프에게 맞는 순서대로 보여드려요.</p>
      </ChampBanner>
      <AugmentCompare championId={championId} stats={stats} />
    </div></section>
  );
}
