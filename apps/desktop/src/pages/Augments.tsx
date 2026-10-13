import { useState } from 'react';
import { AugmentCompare, AugmentDex, AugmentGuide, ChampBanner, ChampGrid, Seg } from '@prism/ui';
import type { AugmentStats } from '@prism/core';
import { useLoad } from '@prism/ui';
import { api } from '../bridge';

export function AugmentsPage({ lastChampion, member }: { lastChampion: number | null; member: boolean }) {
  const [tab, setTab] = useState<'guide' | 'compare' | 'dex'>('guide');
  const [champ, setChamp] = useState<number | null>(lastChampion);
  const [q, setQ] = useState('');
  const stats = useLoad<AugmentStats>(api, member && champ ? `/api/augments?champion=${champ}` : null).data;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row"><h1 className="h1">증강</h1><span className="sp" /><Seg value={tab} options={[['guide', '챔피언별 가이드'], ['compare', '3개 비교'], ['dex', '증강 도감']]} onChange={setTab} /></div>
      {tab === 'dex' ? <AugmentDex /> : champ ? (
        <>
          <ChampBanner id={champ} eyebrow={tab === 'guide' ? '증강 가이드' : '증강 3개 비교'} actions={<button type="button" className="btn sm" onClick={() => setChamp(null)}>다른 챔피언</button>} />
          {tab === 'guide' ? <AugmentGuide championId={champ} stats={stats} /> : <AugmentCompare championId={champ} stats={stats} />}
        </>
      ) : (
        <section className="card pad"><input className="input" style={{ marginBottom: 16 }} value={q} autoFocus onChange={(e) => setQ(e.target.value)} placeholder="챔피언 검색 (ㅇㄹ → 아리)" /><ChampGrid query={q} onPick={setChamp} /></section>
      )}
    </div>
  );
}
