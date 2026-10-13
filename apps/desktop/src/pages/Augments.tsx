import { ACTIVE_AUGMENTS, DATA_VERSION } from '@prism/core';
import { AugmentDex } from '@prism/ui';

export function AugmentsPage() {
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div><h1 className="h1">증강</h1><p className="muted" style={{ margin: '8px 0 0' }}>아수라장 증강 {ACTIVE_AUGMENTS.length}개를 등급별로 · 게임 데이터 {DATA_VERSION}</p></div>
      <AugmentDex />
    </div>
  );
}
