import { Empty, Icon, InquiryView, PageSkeleton } from '@prism/ui';
import { useSession } from '../session';

/** 문의 (v3.137) — 회원: 문의 쓰기 · 내 문의 / 운영진: 작업 목록 */
export function InquiryPage() {
  const { me, ready, api, login } = useSession();
  if (!ready) return <section className="section tight"><div className="wrap"><PageSkeleton kind="crew" /></div></section>;
  if (!me) return <section className="section"><div className="wrap"><Empty action={<button type="button" className="btn primary" onClick={login}><Icon name="discord" />디스코드로 로그인</button>}>문의는 Prism 회원이 보낼 수 있어요.</Empty></div></section>;
  return <section className="section tight"><div className="wrap"><InquiryView api={api} /></div></section>;
}
