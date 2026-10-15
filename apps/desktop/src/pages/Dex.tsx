import { useNavigate } from 'react-router-dom';
import { DexView, useDex } from '@prism/ui';
import { api } from '../bridge';
import type { State } from '../controller';

/** 도감: 내가 만난 챔피언·고른 증강 (Prism 기록 + 이 PC 롤 기록) */
export function DexPage({ s }: { s: State }) {
  const nav = useNavigate();
  const { dex, loading } = useDex(s.me ? api : null, s.games);
  return <DexView dex={dex} loading={loading} xpRate={s.me?.rates?.dexXp ?? 1} onChampion={(c) => nav(`/champions/${c}`)} onAugment={(a) => nav(`/augments/${a}`)} />;
}
