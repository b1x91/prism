import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ACTIVE_AUGMENTS, DATA_VERSION } from '@prism/core';
import { Artisans, AugmentDetail, AugmentDex } from '@prism/ui';
import { useSession } from '../session';

export function Augments() {
  const { id } = useParams();
  const nav = useNavigate();
  const { api, me } = useSession();
  useEffect(() => { scrollTo(0, 0); }, [id]);
  if (id) return (
    <section className="section tight"><div className="wrap stack" style={{ gap: 24 }}>
      <AugmentDetail id={Number(id)} onChampion={(c) => nav(`/champions/${c}`)} onAugment={(a) => nav(`/augments/${a}`)} onBack={() => nav('/augments')}
        after={me && <Artisans api={api} kind="augment" id={Number(id)} onMember={(m) => nav(`/members/${m}`)} />} />
    </div></section>
  );
  return (
    <section className="section tight"><div className="wrap">
      <div className="page-head"><div><h1>증강</h1><p>아수라장 증강 {ACTIVE_AUGMENTS.length}개를 등급별로. 누르면 잘 맞는 챔피언과 같은 성향의 증강을 볼 수 있어요. · 게임 데이터 {DATA_VERSION}</p></div></div>
      <AugmentDex onOpen={(a) => nav(`/augments/${a}`)} />
    </div></section>
  );
}
