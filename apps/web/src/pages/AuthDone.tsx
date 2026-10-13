import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Empty } from '@prism/ui';
import { useSession } from '../session';

/** 디스코드 로그인에서 돌아온 곳: code 를 토큰으로 바꾸고 원래 보던 화면으로 */
export function AuthDone() {
  const { finishLogin } = useSession();
  const nav = useNavigate();
  const [msg, setMsg] = useState('로그인하는 중…');
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    const code = new URLSearchParams(location.search).get('code');
    if (!code) { setMsg('로그인 정보가 없습니다. 다시 시도해주세요.'); return; }
    finishLogin(code)
      .then(() => { let to = '/crew'; try { to = sessionStorage.getItem('prism-after-login') || to; } catch { /* 없음 */ } nav(to === '/auth/done' ? '/crew' : to, { replace: true }); })
      .catch((e) => setMsg(e instanceof Error ? e.message : String(e)));
  }, [finishLogin, nav]);
  return <section className="section"><div className="wrap"><Empty>{msg}</Empty></div></section>;
}
