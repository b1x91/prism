/**
 * 배포판에서 화면 속을 들여다보는 길을 닫는다: 오른쪽 클릭 메뉴(검사·소스 보기), 개발자 도구·소스 보기·새로 고침 단축키.
 * 개발자 도구 자체는 Tauri 배포 빌드에 들어가지 않는다 (devtools 기능을 켜지 않음). 이건 그 위에 한 겹 더.
 * 글 입력 칸의 오른쪽 클릭(붙여넣기 등)은 그대로 둔다.
 */
export function lockdown() {
  if (!import.meta.env.PROD) return;
  addEventListener('contextmenu', (e) => {
    const t = e.target as HTMLElement | null;
    if (t?.closest('input, textarea, [contenteditable="true"]')) return;
    e.preventDefault();
  });
  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;
    if (k === 'f12' || k === 'f5' || (ctrl && e.shiftKey && ['i', 'j', 'c'].includes(k)) || (ctrl && ['u', 'r', 'p', 's'].includes(k))) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
}
