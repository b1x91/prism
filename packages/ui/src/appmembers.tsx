/**
 * 앱을 쓰는 멤버들 (CLAUDE.md v3.84): 멤버 화면 '아카이브' 아래, '함께한 친구들' 위.
 * Prism 기록은 앱을 켠 멤버들의 PC 에서 모인다 — 그분들을 크게 소개하고 고마움을 보인다.
 * 멤버가 누가 있는지·어떤 사람인지 궁금할 때 여기서 회원 페이지로 간다.
 */
import { useState } from 'react';
import { CHAMPIONS, ROLE_KO, aboutWhen, cdragon, shortNick, type Api, type AppMember } from '@prism/core';
import { FacePresence, MemberFace, useSkins } from './basics';
import { useLoad } from './crew';
import { Bone, Swap, fadeCls, imgIn, useReveal } from './skeleton';

const DAY = 86_400_000;
const SHOW = 12; // 처음 보여 줄 수 (더 보기로 펼침)
const TOP = 3;   // 기록을 가장 많이 모아 준 분들은 따로 빛나게

function AppMembersSkeleton() {
  return (
    <section className="card pad appm">
      <div className="card-head"><h2>앱을 쓰는 멤버들</h2></div>
      <div className="am-grid">{[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="am-card"><Bone w={52} h={52} r="round" /><span className="am-t" style={{ gap: 8 }}><Bone w={88} h={14} /><Bone w={120} h={10} /><Bone w={140} h={10} /></span></div>
      ))}</div>
    </section>
  );
}

export function AppMembers({ api, onMember }: { api: Api; onMember?: (id: string) => void }) {
  const { data, error } = useLoad<{ members: AppMember[] }>(api, '/api/crew/app-members');
  const skins = useSkins();
  const [all, setAll] = useState(false);
  const rv = useReveal(Boolean(data));
  if (error) return null;
  if (!data) return <AppMembersSkeleton />;
  const ms = data.members;
  if (!ms.length) return null;
  const art = (m: AppMember) => (m.skin && skins?.[m.skin]?.splash) || (m.main ? cdragon(CHAMPIONS[m.main]?.splash) : '');
  const shown = all ? ms : ms.slice(0, SHOW);
  return (
    <Swap on={rv} skeleton={<AppMembersSkeleton />}>
      <section className={`card pad appm ${fadeCls(rv)}`}>
        <div className="card-head"><h2>앱을 쓰는 멤버들</h2><span className="sp" /><span className="meta">{ms.length}명 · Prism 기록은 이분들의 앱에서 모여요</span></div>
        <div className="am-grid">{shown.map((m, i) => {
          const top = i < TOP && m.collected > 0;
          const days = Math.max(1, Math.round((Date.now() - m.joined) / DAY));
          const bg = art(m);
          return (
            <button key={m.id} type="button" className={`am-card ${top ? 'top' : ''}`} onClick={() => onMember?.(m.id)}>
              {bg && <img className="am-bg fi" {...imgIn} src={bg} alt="" loading="lazy" />}
              <FacePresence p={m.presence}><MemberFace nick={m.nick} skin={m.skin} champion={m.main} size={52} skins={skins} /></FacePresence>
              <span className="am-t">
                <span className="am-name"><b>{shortNick(m.nick)}</b>{top && <em className="am-badge">기록 지킴이</em>}</span>
                <span className="am-chips">{m.about?.mbti && <i>{m.about.mbti}</i>}{(m.about?.roles ?? []).slice(0, 2).map((r) => <i key={r}>{ROLE_KO[r as keyof typeof ROLE_KO] ?? r}</i>)}</span>
                <span className="am-praise">{m.collected > 0 ? <>기록 <b>{m.collected.toLocaleString()}판</b>을 모아 줬어요</> : m.crew > 0 ? <>멤버들과 <b>{m.crew.toLocaleString()}판</b> 함께했어요</> : <>함께한 지 <b>{days}일</b></>}</span>
                <span className="am-meta">{m.collected > 0 || m.crew > 0 ? `함께한 지 ${days}일` : ''}{m.about ? `${m.collected > 0 || m.crew > 0 ? ' · ' : ''}${aboutWhen(m.about)}` : ''}</span>
              </span>
            </button>
          );
        })}</div>
        {ms.length > SHOW && <button type="button" className="pl-more" onClick={() => setAll(!all)}>{all ? '접기' : `${ms.length - SHOW}명 더 보기`}</button>}
      </section>
    </Swap>
  );
}
