/**
 * 롤이 '전체 화면'이면 게임 위 증강 창을 띄울 수 없다는 안내 (v3.65·v3.67). 일반 창은 전체 화면(독점) 게임 위에 못 올라간다.
 * 롤 설치 폴더 Config/game.cfg 의 WindowMode 를 읽기만 한다 (0 전체 화면 · 1 창 · 2 테두리 없음 [검증필요]).
 * 롤 설정을 바꾸면 10초 안에 사라지게 계속 다시 본다. 자동 인식이 꺼져 있으면 보이지 않는다.
 */
import { useEffect, useState } from 'react';
import { Icon } from '@prism/ui';
import { bridge } from './bridge';

export function useFullscreen(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    const check = () => Promise.all([bridge.windowMode().catch(() => null), bridge.visionGet().catch(() => null)])
      .then(([mode, v]) => live && setOn(mode === 0 && Boolean(v?.settings.enabled)));
    void check();
    const t = setInterval(check, 10_000);
    return () => { live = false; clearInterval(t); };
  }, []);
  return on;
}

export function FullscreenNote() {
  if (!useFullscreen()) return null;
  return (
    <div className="fs-note" role="note">
      <Icon name="info" />
      <span><b>전체 화면에서는 게임 위 증강 창이 뜨지 않아요</b><small>롤 설정 → 비디오 → 창 모드를 '테두리 없음'으로 바꾸면 증강 카드가 뜰 때 옆에 바로 보여 드려요.</small></span>
    </div>
  );
}
