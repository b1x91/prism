import { useNavigate } from 'react-router-dom';
import { Empty, Icon, NewsView, PageSkeleton, setKept } from '@prism/ui';
import { useSession } from '../session';

/** 소식 (v3.111) — 공지·이벤트·앱 업데이트·증강 패치를 한 줄로. 회원에게만 */
export function NewsPage() {
  const { me, ready, api, login, refresh } = useSession();
  const nav = useNavigate();
  if (!ready) return <section className="section tight"><div className="wrap"><PageSkeleton kind="crew" /></div></section>;
  if (!me) return <section className="section"><div className="wrap"><Empty action={<button type="button" className="btn primary" onClick={login}><Icon name="discord" />디스코드로 로그인</button>}>소식은 Prism 회원에게 열립니다.</Empty></div></section>;
  return (
    <section className="section tight"><div className="wrap stack" style={{ gap: 24 }}>
      <div className="page-head"><div><h1>소식</h1><p>공지 · 이벤트 · 앱 업데이트 · 증강 패치를 한 줄로 모았어요.</p></div></div>
      <NewsView api={api} onRead={refresh} onNewAugments={() => { setKept('aug.fresh', true); nav('/augments'); }} />
    </div></section>
  );
}
