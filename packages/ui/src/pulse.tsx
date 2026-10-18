/**
 * 멤버 근황 (v3.74): 모임 화면 '지금 디스코드' 아래.
 *  - 지금: 접속한 멤버 — 게임 중(챔프·몇 분째) · 챔프 고르는 중 · 롤 켜 둠 · 앱 · 웹
 *  - 최근 근황(3일): 하루 판 묶음 · 펜타/쿼드라킬 · 연승 · 셋 이상 함께한 판 · 첫 기록 · 새 회원
 * 30초마다 새로 본다(화면이 보일 때만). 서버 /api/crew/pulse (담아 두지 않는 주소).
 */
import { useEffect, useState } from 'react';
import { CHAMPIONS, PRESENCE_LABEL, ago, josa, shortDate, shortNick, type Api, type Pulse, type PulseItem, type PulseNow } from '@prism/core';
import { ChampImg, FacePresence, MemberFace } from './basics';
import { useLoad } from './crew';
import { Bone, Swap, fadeCls, useReveal } from './skeleton';

const champName = (id: number) => CHAMPIONS[id]?.name ?? '';
const mins = (t: number) => Math.max(1, Math.round((Date.now() - t) / 60000));

function nowText(x: PulseNow) {
  const c = champName(x.champ);
  if (x.phase === 'game') return <>{c ? <>{josa(c, '으로/로')} </> : ''}게임 중 <small>{mins(x.since)}분째</small></>;
  if (x.phase === 'select') return <>{c ? `${c} · ` : ''}챔프 고르는 중</>;
  if (x.phase === 'lobby') return <>롤 켜 둠</>;
  return <>{PRESENCE_LABEL[x.presence]}</>;
}

function itemText(it: PulseItem) {
  switch (it.kind) {
    case 'session': return <><b>{shortNick(it.nick)}</b> {it.day === 'today' ? '오늘' : it.day === 'yesterday' ? '어제' : shortDate(it.at)} {it.n}판 {it.w}승<span className="pl-sub">주로 {champName(it.champ)}</span></>;
    case 'multi': return <><b>{shortNick(it.nick)}</b> {josa(champName(it.champ), '으로/로')} {it.multi >= 5 ? '펜타킬' : '쿼드라킬'}!<span className="pl-sub">{it.win ? '승리한 판' : '아쉽게 진 판'}</span></>;
    case 'streak': return <><b>{shortNick(it.nick)}</b> {it.streak}연승 중</>;
    case 'together': return <><b>{it.members.slice(0, 3).map((m) => shortNick(m.nick)).join('·')}</b>{it.members.length > 3 ? ` 외 ${it.members.length - 3}명` : ''} 함께 {it.n}판 {it.w}승</>;
    case 'first': return <><b>{shortNick(it.nick)}</b> 님의 첫 판이 기록됐어요<span className="pl-sub">{champName(it.champ)}</span></>;
    case 'firsts': return <><b>{it.members.slice(0, 3).map((m) => shortNick(m.nick)).join('·')}</b>{it.members.length > 3 ? ` 외 ${it.members.length - 3}명` : ''} 님의 첫 판이 기록됐어요</>;
    case 'joined': return <><b>{shortNick(it.nick)}</b> 님이 새로 들어왔어요</>;
  }
}

const TAG: Record<PulseItem['kind'], string> = { session: '', multi: 'hot', streak: 'hot', together: 'crew', first: 'new', firsts: 'new', joined: 'new' };
const SHOW = 8; // 처음 보여 줄 근황 수 (더 보기로 펼침)

function PulseSkeleton() {
  return (
    <section className="card pad crew-pulse">
      <div className="card-head"><h2>멤버 근황</h2></div>
      <div className="pl-now">{[0, 1, 2].map((i) => <span key={i} className="pl-chip"><Bone w={36} h={36} r="pill" /><span className="pl-chip-t"><Bone w={64} h={13} /><Bone w={96} h={12} /></span></span>)}</div>
      <div className="pl-feed">{[0, 1, 2, 3].map((i) => <div key={i} className="pl-item"><Bone w={32} h={32} r="pill" /><span className="pl-t"><Bone w="60%" h={14} /></span><Bone w={40} h={12} /></div>)}</div>
    </section>
  );
}

export function CrewPulse({ api, onMember }: { api: Api; onMember?: (id: string) => void }) {
  const { data, reload } = useLoad<Pulse>(api, '/api/crew/pulse');
  const [more, setMore] = useState(false);
  // 30초마다 (화면이 보일 때만)
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') reload(); }, 30_000);
    return () => clearInterval(t);
  }, [reload]);
  const rv = useReveal(Boolean(data));
  if (!data) return <PulseSkeleton />;
  const playing = data.now.filter((x) => x.phase === 'game' || x.phase === 'select').length;
  return (
    <Swap on={rv} skeleton={<PulseSkeleton />}>
      <section className={`card pad crew-pulse ${fadeCls(rv)}`}>
        <div className="card-head">
          <h2>멤버 근황</h2><span className="sp" />
          <span className="meta">{data.now.length ? <>지금 {data.now.length}명 접속{playing ? <> · <b className="pl-live">{playing}명 게임 중</b></> : ''}</> : '지금 접속한 멤버가 없어요'}</span>
        </div>
        {data.now.length > 0 && <div className="pl-now">{data.now.map((x) => (
          <button key={x.id} type="button" className={`pl-chip ${x.phase}`} onClick={() => onMember?.(x.id)}>
            <FacePresence p={x.presence}><MemberFace nick={x.nick} skin={x.skin} champion={x.main} size={36} /></FacePresence>
            <span className="pl-chip-t"><b>{shortNick(x.nick)}</b><span>{nowText(x)}</span></span>
            {x.champ > 0 && <ChampImg id={x.champ} size={28} />}
          </button>
        ))}</div>}
        {data.feed.length ? <div className="pl-feed">{(more ? data.feed : data.feed.slice(0, SHOW)).map((it, i) => (
          <div key={`${it.kind}-${it.at}-${i}`} className={`pl-item ${TAG[it.kind]}`}>
            {it.kind === 'together' || it.kind === 'firsts'
              ? <button type="button" className="pl-face pl-group" onClick={() => onMember?.(it.members[0].id)}><MemberFace nick={it.members[0].nick} skin={it.members[0].skin} champion={it.members[0].main} size={32} />{it.members.length > 1 && <span className="pl-plus">+{it.members.length - 1}</span>}</button>
              : <button type="button" className="pl-face" onClick={() => onMember?.(it.id)}><MemberFace nick={it.nick} skin={it.skin} champion={it.main} size={32} /></button>}
            <span className="pl-t">{itemText(it)}</span>
            <span className="pl-c">{'champ' in it && it.champ > 0 && <ChampImg id={it.champ} size={28} />}</span>
            <span className="pl-at">{ago(it.at)}</span>
          </div>
        ))}{data.feed.length > SHOW && <button type="button" className="pl-more" onClick={() => setMore(!more)}>{more ? '접기' : `근황 ${data.feed.length - SHOW}개 더 보기`}</button>}</div> : <p className="meta pl-empty">최근 3일 동안 기록된 판이 없어요. 오늘 밤 첫 판을 열어 주세요!</p>}
      </section>
    </Swap>
  );
}
