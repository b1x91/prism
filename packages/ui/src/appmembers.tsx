/**
 * Prism을 밝히는 사람들 (CLAUDE.md v3.84·v3.85): 멤버 화면 '아카이브' 아래, '함께한 친구들' 위.
 * Prism 기록은 앱을 켠 멤버들의 PC 에서 모인다 — 그분들을 크게 소개하고 고마움을 보인다.
 * 멤버가 누가 있는지·어떤 사람인지 궁금할 때 여기서 회원 페이지로 간다.
 */
import { useState } from 'react';
import { CHAMPIONS, ROLE_KO, aboutWhen, cdragon, shortNick, type Api, type AppMember } from '@prism/core';
import { CopyRiot, FacePresence, MemberFace, useSkins, PendingChip } from './basics';
import { useLoad } from './crew';
import { Bone, Swap, fadeCls, imgIn, useReveal } from './skeleton';

const DAY = 86_400_000;
const SHOW = 12; // 처음 보여 줄 수 (더 보기로 펼침)
const TOP = 3;   // 앱을 가장 꾸준히 켜 둔 세 분은 오른쪽 위에 결정 휘장 (순서는 서버가 정한다, 숫자는 보이지 않는다)

/** 결정 휘장: 1위 프리즘 · 2위 골드 · 3위 실버 — 증강 등급과 같은 이름이라 롤 하는 사람에게 바로 읽힌다 */
const CREST = [
  { key: 'prism', name: '프리즘 결정', f: ['#e0559a', '#f29a3c', '#3ec7d9', '#7a63e8', '#c94fd0', '#45b0f0'], t: ['#ffffff', '#d9f6ff'] },
  { key: 'gold', name: '골드 결정', f: ['#f6d77a', '#e0b23c', '#c9971f', '#8f6510', '#efc650', '#a87a14'], t: ['#fffbe6', '#ffe9a3'] },
  { key: 'silver', name: '실버 결정', f: ['#f1f3f7', '#cfd4dc', '#b3b9c3', '#7d828d', '#e2e6ec', '#959ba6'], t: ['#ffffff', '#eef1f6'] },
] as const;

function Crest({ rank }: { rank: number }) {
  const c = CREST[rank];
  const id = `crest-${c.key}`;
  // 세로로 긴 육각 보석: 바깥 여섯 면 + 가운데 판(table)
  const O = [[14, 1], [27, 8.5], [27, 23.5], [14, 31], [1, 23.5], [1, 8.5]];
  const I = [[14, 8], [20.5, 12], [20.5, 20], [14, 24], [7.5, 20], [7.5, 12]];
  const face = (i: number) => [O[i], O[(i + 1) % 6], I[(i + 1) % 6], I[i]].map((p) => p.join(',')).join(' ');
  return (
    <span className={`am-crest c-${c.key}`} title={c.name} aria-label={`${c.name} ${rank + 1}위`}>
      <svg viewBox="0 0 28 32" width="22" height="25" aria-hidden>
        <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={c.t[0]} /><stop offset="1" stopColor={c.t[1]} /></linearGradient></defs>
        {[0, 1, 2, 3, 4, 5].map((i) => <polygon key={i} points={face(i)} fill={c.f[i]} />)}
        <polygon points={I.map((p) => p.join(',')).join(' ')} fill={`url(#${id})`} />
        <polygon points="14,8 20.5,12 14,15.5 7.5,12" fill="#fff" opacity=".45" />
        <polygon points={face(5)} fill="#fff" opacity=".18" />
        <polygon points={O.map((p) => p.join(',')).join(' ')} fill="none" stroke="rgba(10,12,24,.45)" strokeWidth="1" strokeLinejoin="round" />
        <path className="am-crest-spark" d="M20 3.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" fill="#fff" />
      </svg>
    </span>
  );
}

function AppMembersSkeleton() {
  return (
    <section className="card pad appm">
      <div className="card-head"><h2>Prism을 밝히는 사람들</h2></div>
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
        <div className="card-head"><h2>Prism을 밝히는 사람들</h2></div>
        <div className="am-grid">{shown.map((m, i) => {
          const top = i < TOP && m.collected > 0;
          const days = Math.max(1, Math.round((Date.now() - m.joined) / DAY));
          const bg = art(m);
          return (
            <div key={m.id} className="am-wrap">
            <button type="button" className={`am-card ${top ? `am-top t${i}` : ''}`} onClick={() => onMember?.(m.id)}>
              {top && <Crest rank={i} />}
              {bg && <img className="am-bg fi" {...imgIn} src={bg} alt="" loading="lazy" />}
              <FacePresence p={m.presence}><MemberFace nick={m.nick} skin={m.skin} champion={m.main} size={52} skins={skins} /></FacePresence>
              <span className="am-t">
                <span className="am-name"><b>{shortNick(m.nick)}</b>{m.pending && <PendingChip />}</span>
                <span className="am-chips">{m.about?.mbti && <i>{m.about.mbti}</i>}{m.about?.roles.length ? <i>{m.about.roles.map((r) => ROLE_KO[r as keyof typeof ROLE_KO] ?? r).join('·')}</i> : null}</span>
                <span className="am-praise">{m.crew > 0 ? <>멤버들과 <b>{m.crew.toLocaleString()}판</b> 함께했어요</> : <>함께한 지 <b>{days}일</b></>}</span>
                <span className="am-meta">{[m.crew > 0 ? `함께한 지 ${days}일` : '', m.about ? aboutWhen(m.about) : ''].filter(Boolean).join(' · ')}</span>
              </span>
            </button>
            <CopyRiot riot={m.riot} className="am-copy" />
            </div>
          );
        })}</div>
        {ms.length > SHOW && <button type="button" className="pl-more" onClick={() => setAll(!all)}>{all ? '접기' : `${ms.length - SHOW}명 더 보기`}</button>}
      </section>
    </Swap>
  );
}
