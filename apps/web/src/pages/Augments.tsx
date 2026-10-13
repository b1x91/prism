import { ACTIVE_AUGMENTS, DATA_VERSION } from '@prism/core';
import { AugmentDex } from '@prism/ui';

export function Augments() {
  return (
    <section className="section tight"><div className="wrap">
      <div className="page-head"><div><h1>아수라장 증강 도감</h1><p>현재 증강 {ACTIVE_AUGMENTS.length}개 · 게임 데이터 {DATA_VERSION} 기준 한국어 설명</p></div></div>
      <AugmentDex />
    </div></section>
  );
}
