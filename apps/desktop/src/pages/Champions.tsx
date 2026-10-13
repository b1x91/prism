import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AugmentCompare, AugmentGuide, ChampBanner, ChampGrid, ChampionCrew, Seg, useLoad } from '@prism/ui';
import type { AugmentStats } from '@prism/core';
import { api } from '../bridge';

export function ChampionsPage({ member }: { member: boolean }) {
  const { id } = useParams();
  const nav = useNavigate();
  const champ = Number(id) || null;
  const [tab, setTab] = useState<'guide' | 'compare' | 'crew'>('guide');
  const [q, setQ] = useState('');
  const stats = useLoad<AugmentStats>(api, member && champ ? `/api/augments?champion=${champ}` : null).data;
  if (!champ) return (
    <div className="stack" style={{ gap: 16 }}>
      <h1 className="h1">챔피언</h1>
      <section className="card pad"><input className="input" style={{ marginBottom: 16 }} value={q} autoFocus onChange={(e) => setQ(e.target.value)} placeholder="챔피언 검색 (ㅇㄹ → 아리)" /><ChampGrid query={q} onPick={(c) => nav(`/champions/${c}`)} /></section>
    </div>
  );
  return (
    <div className="stack" style={{ gap: 16 }}>
      <ChampBanner id={champ} eyebrow="아수라장 증강" actions={<button type="button" className="btn sm" onClick={() => nav('/champions')}>다른 챔피언</button>} />
      <div className="row"><Seg value={tab} options={member ? [['guide', '어울리는 증강'], ['compare', '증강 3개 비교'], ['crew', '모임 기록']] : [['guide', '어울리는 증강'], ['compare', '증강 3개 비교']]} onChange={setTab} /></div>
      {tab === 'guide' && <AugmentGuide championId={champ} stats={stats} />}
      {tab === 'compare' && <AugmentCompare championId={champ} stats={stats} />}
      {tab === 'crew' && member && <ChampionCrew api={api} championId={champ} />}
    </div>
  );
}
