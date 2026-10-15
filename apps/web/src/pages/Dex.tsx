import { useNavigate } from 'react-router-dom';
import { DexView, Empty, Icon, useDex } from '@prism/ui';
import { useSession } from '../session';

/** 도감: Prism 에 기록된 내 판으로 만난 챔피언·고른 증강 (회원 전용) */
export function DexPage() {
  const { me, ready, api, login } = useSession();
  const nav = useNavigate();
  const { dex, loading } = useDex(me ? api : null);
  if (!ready) return null;
  if (!me) return <section className="section"><div className="wrap"><Empty action={<button type="button" className="btn primary" onClick={login}><Icon name="discord" />디스코드로 로그인</button>}>도감은 Prism 회원에게 열립니다.</Empty></div></section>;
  return <section className="section tight"><div className="wrap"><DexView dex={dex} loading={loading} xpRate={me.rates?.dexXp ?? 1} onChampion={(c) => nav(`/champions/${c}`)} onAugment={(a) => nav(`/augments/${a}`)} /></div></section>;
}
