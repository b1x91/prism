/**
 * 친구 초대 (CLAUDE.md v3.106): 내 초대 링크(przm.web.app/i/번호) + 초대한 친구들.
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
          {f.rewardedAt ? <span className="inv-got">+{data.bonus}<PieceIcon size={12} /></span> : f.approved ? null : <PendingChip />}
        </span>)}
      </div>}
    </section>
  );
}
