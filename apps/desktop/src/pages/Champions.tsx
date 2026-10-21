import { useNavigate, useParams } from 'react-router-dom';
import { Artisans, AugmentCompare, AugmentGuide, ChampBanner, ChampGrid, ChampItems, ChampionCrew, ChampSkills, GlassBtn, Seg, goBack, useKept, useLoad } from '@prism/ui';
import type { AugmentStats } from '@prism/core';
import { api } from '../bridge';

export function ChampionsPage({ member, record }: { member: boolean; record?: Record<number, { n: number; w: number }> }) {
  const { id } = useParams();
  const nav = useNavigate();
  const champ = Number(id) || null;
  const [tab, setTab] = useKept<'guide' | 'skills' | 'items' | 'compare' | 'crew'>('champ.tab', 'guide');
  const [q, setQ] = useKept('champ.q', '');
  const sl = useLoad<AugmentStats>(api, member && champ ? `/api/augments?champion=${champ}` : null);
  const stats = sl.data;
  if (!champ) return (
    <div className="stack" style={{ gap: 16 }}>
      <h1 className="h1">챔프</h1>
      <ChampGrid query={q} onQuery={setQ} record={record} onPick={(c) => nav(`/champions/${c}`)} />
    </div>
  );
  return (
    <div className="stack" style={{ gap: 16 }}>
      <ChampBanner id={champ} eyebrow="아수라장 증강" actions={<GlassBtn icon="back" label="챔프 목록으로" onClick={() => goBack(nav, '/champions')} />} />
      {member && <Artisans api={api} kind="champion" id={champ} onMember={(m) => nav(`/members/${m}`)} />}
      <div className="row"><Seg value={tab} options={member ? [['guide', '어울리는 증강'], ['skills', '스킬'], ['items', '아이템'], ['compare', '3개 비교'], ['crew', '모임 기록']] : [['guide', '어울리는 증강'], ['skills', '스킬'], ['items', '아이템'], ['compare', '3개 비교']]} onChange={setTab} /></div>
      {tab === 'guide' && <AugmentGuide championId={champ} stats={stats} loading={member && !stats && !sl.error} />}
      {tab === 'skills' && <ChampSkills championId={champ} />}
      {tab === 'items' && <ChampItems api={member ? api : null} championId={champ} />}
      {tab === 'compare' && <AugmentCompare championId={champ} stats={stats} />}
      {tab === 'crew' && member && <ChampionCrew api={api} championId={champ} />}
    </div>
  );
}
