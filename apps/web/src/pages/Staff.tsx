import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Empty, Gem, Icon, INVITE_KEY, MemberFace, PageSkeleton, StaffView } from '@prism/ui';
import { shortNick } from '@prism/core';
import { SERVER, useSession } from '../session';
import { useState } from 'react';

/** 운영 (v3.107) — 운영진만. 메뉴에도 운영진에게만 보인다 */
export function StaffPage() {
  const { me, ready, api } = useSession();
  const nav = useNavigate();
  if (!ready) return <section className="section tight"><div className="wrap"><PageSkeleton kind="crew" /></div></section>;
  if (!me?.perms?.manage) return <section className="section"><div className="wrap"><Empty>운영진만 볼 수 있는 화면이에요.</Empty></div></section>;
  return (
    <section className="section tight"><div className="wrap stack" style={{ gap: 24 }}>
      <div className="page-head"><div><h1>운영</h1><p>Prism 현황을 보고, 새 멤버 승인과 정회원 심사, 단계를 관리해요.</p></div></div>
      <StaffView api={api} onOpen={(id) => nav(id === me.id ? '/me' : `/members/${id}`)} />
    </div></section>
  );
}

/** 친구 초대 링크 /i/:code — 초대 번호를 이 기기에 남겨 두고(온보딩 추천인 칸이 미리 채운다) 가입 길을 보여 준다 */
export function InvitePage() {
  const { code = '' } = useParams();
  const { me, login, links } = useSession();
  const [who, setWho] = useState<{ nick: string; skin: number | null; main: number | null } | null | false>(null);
  useEffect(() => {
    if (!/^[a-z0-9]{4,12}$/.test(code)) { setWho(false); return; }
    try { localStorage.setItem(INVITE_KEY, code); } catch { /* 저장 막힘 */ }
    if (!SERVER) { setWho(false); return; }
    fetch(`${SERVER}/public/invite/${code}`).then((r) => (r.ok ? r.json() : null)).then((j) => setWho(j ?? false), () => setWho(false));
  }, [code]);
  return (
    <section className="section"><div className="wrap">
      <div className="card pad inv-land">
        {who ? <MemberFace nick={who.nick} skin={who.skin} champion={who.main} size={72} /> : <Gem size={56} float src="/brand/prism-256.png" />}
        <h1>{who ? `${shortNick(who.nick)} 님이 Prism에 초대했어요` : 'Prism에 초대받았어요'}</h1>
        <p className="meta">칼바람 아수라장을 같이 하는 모임이에요. 디스코드 서버에 들어온 뒤 로그인하면, 운영진 승인을 거쳐 멤버가 돼요.</p>
        {me ? <p className="meta">이미 로그인되어 있어요.</p> : <div className="inv-land-go">
          {links.discord && <a className="btn lg" href={links.discord} target="_blank" rel="noopener noreferrer"><Icon name="discord" />1. 디스코드 서버 들어가기</a>}
          <button type="button" className="btn primary lg" onClick={login}><Icon name="discord" />{links.discord ? '2. ' : ''}디스코드로 로그인</button>
        </div>}
      </div>
    </div></section>
  );
}
