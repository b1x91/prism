import { useNavigate } from 'react-router-dom';
import { BoardView, Empty, Icon, Notes, PartyBoard } from '@prism/ui';
import type { State } from '../controller';
import { api, bridge } from '../bridge';

export function CrewPage({ s, onLogin }: { s: State; onLogin: () => void }) {
  const nav = useNavigate();
  if (!s.session.configured) return <section className="card pad"><Empty>Prism 모임 기능은 곧 열립니다.</Empty></section>;
  if (!s.me) return <section className="card pad"><Empty action={<button type="button" className="btn primary" onClick={onLogin}><Icon name="discord" />디스코드로 로그인</button>}>모임 기록, 한 줄 생각, 실전 증강 승률은 Prism 회원에게 열립니다.</Empty></section>;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row"><h1 className="h1">Prism</h1><span className="sp" /><button type="button" className="btn sm" onClick={() => bridge.openUrl('https://przm.web.app/crew')}><Icon name="out" />웹에서 열기</button></div>
      <PartyBoard api={api} onMember={(id) => nav(`/members/${id}`)} />
      <Notes api={api} />
      <BoardView api={api} />
    </div>
  );
}
