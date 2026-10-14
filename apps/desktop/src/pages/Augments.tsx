import { useNavigate, useParams } from 'react-router-dom';
import { ACTIVE_AUGMENTS, DATA_VERSION } from '@prism/core';
import { Artisans, AugmentDetail, AugmentDex } from '@prism/ui';
import { api } from '../bridge';

export function AugmentsPage({ member }: { member?: boolean }) {
  const { id } = useParams();
  const nav = useNavigate();
  if (id) return (
    <div className="stack" style={{ gap: 16 }}>
      <AugmentDetail id={Number(id)} onChampion={(c) => nav(`/champions/${c}`)} onAugment={(a) => nav(`/augments/${a}`)} onBack={() => nav('/augments')}
        after={member && <Artisans api={api} kind="augment" id={Number(id)} onMember={(m) => nav(`/members/${m}`)} />} />
    </div>
  );
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div><h1 className="h1">증강</h1><p className="muted" style={{ margin: '8px 0 0' }}>아수라장 증강 {ACTIVE_AUGMENTS.length}개를 등급별로. 누르면 잘 맞는 챔피언과 같은 성향의 증강 · 게임 데이터 {DATA_VERSION}</p></div>
      <AugmentDex onOpen={(a) => nav(`/augments/${a}`)} />
    </div>
  );
}
