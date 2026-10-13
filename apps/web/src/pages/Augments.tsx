import { ACTIVE_AUGMENTS, DATA_VERSION } from '@prism/core';
import { AugmentDex } from '@prism/ui';

export function Augments() {
  return (
    <section className="section tight"><div className="wrap">
      <div className="page-head"><div><h1>증강</h1><p>아수라장 증강 {ACTIVE_AUGMENTS.length}개를 등급별로. 내 챔피언에게 맞는 증강은 챔피언 메뉴에서 볼 수 있어요. · 게임 데이터 {DATA_VERSION}</p></div></div>
      <AugmentDex />
    </div></section>
  );
}
