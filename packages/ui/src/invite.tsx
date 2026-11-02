/**
 * 친구 초대 (CLAUDE.md v3.107): 내 초대 링크(przm.web.app/i/번호) + 초대한 친구들.
 * 초대한 친구가 운영진 승인을 받으면 한 명마다 보너스 피스 (서버 invite_rewards, 배율 밖 고정값).
 */
import { useState } from 'react';
import { shortNick, type Api, type MyInvite } from '@prism/core';
import { MemberFace, PendingChip, useSkins } from './basics';
import { Icon } from './icons';
import { useLoad } from './crew';
import { PieceIcon } from './shop';
import { Bone, SkeletonFrame } from './skeleton';

/** 웹 주소 (앱에서도 친구는 웹으로 들어온다) */
export const WEB_ORIGIN = 'https://przm.web.app';

export function InviteCard({ api, origin = WEB_ORIGIN }: { api: Api; origin?: string }) {
  const { data, error } = useLoad<MyInvite>(api, '/api/me/invite');
  const skins = useSkins();
  const [copied, setCopied] = useState(false);
  if (error) return null;
  const link = data ? `${origin}/i/${data.code}` : '';
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* 복사 막힘 */ }
  };
  return (
    <section className="card pad inv-card">
      <div className="card-head"><h2>친구 초대</h2>
        <span className="inv-bonus">친구 한 명마다 <b>+{data?.bonus ?? 300}</b><PieceIcon size={12} /></span></div>
      <p className="meta inv-desc">링크로 들어온 친구가 Prism 멤버로 승인되면 피스를 드려요.</p>
      {data ? <div className="inv-link">
        <span className="inv-url" title={link}>{link.replace(/^https?:\/\//, '')}</span>
        <button type="button" className={`btn sm ${copied ? 'equip' : 'primary'}`} onClick={copy}><Icon name={copied ? 'check' : 'link'} />{copied ? '복사했어요' : '링크 복사'}</button>
      </div> : <SkeletonFrame className="inv-link"><Bone w="60%" h={14} /><Bone w={96} h={32} r="m" /></SkeletonFrame>}
      {data && data.friends.length > 0 && <div className="inv-friends">
        {data.friends.map((f) => <span key={f.id} className="inv-f">
          <MemberFace nick={f.nick} skin={f.skin} champion={f.main} size={28} skins={skins} />
          <b>{shortNick(f.nick)}</b>
          {f.rewardedAt ? <span className="inv-got">+{data.bonus}<PieceIcon size={12} /></span> : f.pending ? <PendingChip /> : null}
        </span>)}
      </div>}
    </section>
  );
}

/** 초대 탭 아래: 피스를 받기까지 세 걸음 */
export function InviteHow() {
  const steps: [string, string][] = [
    ['링크 보내기', '위 링크를 친구에게 보내요. 디스코드·카카오톡 어디든 괜찮아요.'],
    ['친구가 가입', '친구가 링크로 들어와 디스코드 서버에 들어오고 Prism에 로그인해요. 추천인 칸에 내 이름이 미리 채워져요.'],
    ['승인되면 피스', '운영진이 친구를 멤버로 승인하는 순간 피스가 들어와요. 한 번 들어온 피스는 줄지 않아요.'],
  ];
  return (
    <section className="card pad">
      <div className="card-head"><h2>피스를 받기까지</h2></div>
      <ol className="inv-how">{steps.map(([t, d], i) => <li key={t}><span className="inv-n">{i + 1}</span><span><b>{t}</b><span className="meta">{d}</span></span></li>)}</ol>
    </section>
  );
}
