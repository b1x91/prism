/**
 * 멤버 근황 (v3.74·v3.75): 모임 화면 '지금 디스코드' 아래.
 *  - 왼쪽 '지금 접속': 게임 중(챔프·몇 분째) · 챔프 고르는 중 · 온라인(롤 켜 둠) · 앱/웹(점 색으로만)
 *  - 오른쪽 '최근 근황'(3일, 날짜별): 하루 판 묶음 · 펜타/쿼드라킬 · 연승 · 셋 이상 함께한 판 · 첫 기록 · 새 회원
 * 30초마다 새로 본다(화면이 보일 때만). 서버 /api/crew/pulse (담아 두지 않는 주소).
 */
import { useEffect, useState, type ReactNode } from 'react';
import { CHAMPIONS, ago, josa, shortDate, shortNick, type Api, type Pulse, type PulseItem, type PulseNow } from '@prism/core';
import { ChampImg, FacePresence, MemberFace } from './basics';
import { useLoad } from './crew';
import { Bone, Swap, fadeCls, useReveal } from './skeleton';

const champName = (id: number) => CHAMPIONS[id]?.name ?? '';
const mins = (t: number) => Math.max(1, Math.round((Date.now() - t) / 60000));
const SHOW = 8; // 처음 보여 줄 근황 수 (더 보기로 펼침)

/** 상태 글자. 앱·웹 접속은 점 색으로만 보여 주므로 글자가 없다 */
function nowText(x: PulseNow): ReactNode {
  const c = champName(x.champ);
  if (x.phase === 'game') return <>{c ? `${josa(c, '으로/로')} ` : ''}게임 중 <small>· {mins(x.since)}분째</small></>;
  if (x.phase === 'select') return <>{c ? `${c} · ` : ''}챔프 고르는 중</>;
  if (x.phase === 'lobby' || x.presence === 'game' || x.presence === 'both') return '온라인';
  return null;
}

const T = (name: ReactNode, act: ReactNode) => <><b>{name}</b><span className="pl-act">{act}</span></>;
const names = (ms: { nick: string }[]) => ms.slice(0, 3).map((m) => shortNick(m.nick)).join('·') + (ms.length > 3 ? ` 외 ${ms.length - 3}명` : '');
const rate = (n: number, w: number) => (n ? Math.round((w / n) * 100) : 0);

/** 근황 한 줄: [제목, 작은 설명] */
function itemText(it: PulseItem): [ReactNode, ReactNode] {
  switch (it.kind) {
    case 'session': return [T(shortNick(it.nick), <>{it.n}판 {it.w}승</>), `승률 ${rate(it.n, it.w)}% · 주로 ${champName(it.champ)}`];
    case 'multi': return [T(shortNick(it.nick), <>{it.multi >= 5 ? '펜타킬' : '쿼드라킬'}</>), `${champName(it.champ)} · ${it.win ? '승리한 판' : '아쉽게 진 판'}`, ];
    case 'streak': return [T(shortNick(it.nick), <>{it.streak}연승 중</>), '지금 이어지는 중'];
    case 'together': return [T(names(it.members), <>함께 {it.n}판</>), `${it.w}승 ${it.n - it.w}패`];
    case 'first': return [T(shortNick(it.nick), <>첫 판 기록</>), champName(it.champ)];
    case 'firsts': return [T(names(it.members), <>첫 판 기록</>), `${it.members.length}명이 처음으로 기록됐어요`];
    case 'joined': return [T(shortNick(it.nick), <>새로 들어왔어요</>), '반갑게 맞아 주세요'];
  }
}
const TAG_CLS: Partial<Record<PulseItem['kind'], string>> = { multi: 'hot', streak: 'hot', together: 'crew', first: 'new', firsts: 'new', joined: 'new' };

/** 날짜 칸 이름 (오늘·어제·10월 16일) */
function dayKey(t: number) { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }
function dayLabel(t: number) {
  const k = dayKey(t);
  if (k === dayKey(Date.now())) return '오늘';
  if (k === dayKey(Date.now() - 86_400_000)) return '어제';
  return shortDate(t);
}
const clock = (t: number) => new Date(t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });

function PulseSkeleton() {
  return (
    <section className="card pad crew-pulse">
      <div className="card-head"><h2>멤버 근황</h2></div>
      <div className="pl-body">
        <div className="pl-col"><div className="pl-label"><Bone w={56} h={12} /></div>
          <div className="pl-now">{[0, 1, 2].map((i) => <div key={i} className="pl-who"><Bone w={36} h={36} r="pill" /><span className="pl-who-t"><Bone w={72} h={13} /><Bone w={104} h={12} /></span></div>)}</div>
        </div>
        <div className="pl-col"><div className="pl-label"><Bone w={32} h={12} /></div>
          <div className="pl-feed">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="pl-item"><Bone w={32} h={32} r="pill" /><span className="pl-t"><Bone w="46%" h={14} /><Bone w="30%" h={12} /></span><span className="pl-c" /><Bone w={40} h={12} /></div>)}</div>
        </div>
      </div>
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
  const playing = data.now.filter((x) => x.phase === 'game').length;
  const feed = more ? data.feed : data.feed.slice(0, SHOW);
  // 날짜별로 묶는다 (근황은 이미 최근순)
  const days: { label: string; items: PulseItem[]; today: boolean }[] = [];
  for (const it of feed) {
    const label = dayLabel(it.at);
    const last = days[days.length - 1];
    if (last && last.label === label) last.items.push(it);
    else days.push({ label, items: [it], today: label === '오늘' });
  }
  return (
    <Swap on={rv} skeleton={<PulseSkeleton />}>
      <section className={`card pad crew-pulse ${fadeCls(rv)}`}>
        <div className="card-head">
          <h2>멤버 근황</h2><span className="sp" />
          {playing > 0 && <span className="pl-live"><i />{playing}명 게임 중</span>}
        </div>
        <div className="pl-body">
          <div className="pl-col">
            <div className="pl-label">지금 접속 <b>{data.now.length}</b></div>
            {data.now.length ? <div className="pl-now">{data.now.map((x) => {
              const st = nowText(x);
              return (
                <button key={x.id} type="button" className={`pl-who ${x.phase}`} onClick={() => onMember?.(x.id)}>
                  <FacePresence p={x.presence}><MemberFace nick={x.nick} skin={x.skin} champion={x.main} size={36} /></FacePresence>
                  <span className="pl-who-t"><b>{shortNick(x.nick)}</b>{st && <span>{st}</span>}</span>
                  {(x.phase === 'game' || x.phase === 'select') && x.champ > 0 && <ChampImg id={x.champ} size={32} />}
                </button>
              );
            })}</div> : <p className="meta pl-empty">지금 접속한 멤버가 없어요</p>}
          </div>
          <div className="pl-col">
            <div className="pl-label">최근 근황</div>
            {days.length ? <div className="pl-feed">
              {days.map((d) => (
                <div key={d.label} className="pl-day">
                  <div className="pl-dayh">{d.label}</div>
                  {d.items.map((it, i) => {
                    const [title, sub] = itemText(it);
                    const group = it.kind === 'together' || it.kind === 'firsts' ? it.members : null;
                    const lead = group ? group[0] : it.kind === 'together' || it.kind === 'firsts' ? null : it;
                    return (
                      <div key={`${it.kind}-${it.at}-${i}`} className={`pl-item ${TAG_CLS[it.kind] ?? ''}`}>
                        {lead && <button type="button" className={`pl-face ${group && group.length > 1 ? 'pl-group' : ''}`} onClick={() => onMember?.(lead.id)}>
                          <MemberFace nick={lead.nick} skin={lead.skin} champion={lead.main} size={32} />
                          {group && group.length > 1 && <span className="pl-plus">+{group.length - 1}</span>}
                        </button>}
                        <span className="pl-t"><span className="pl-t1">{title}</span><span className="pl-t2">{sub}</span></span>
                        <span className="pl-c">{'champ' in it && it.champ > 0 && <ChampImg id={it.champ} size={32} />}</span>
                        <span className="pl-at">{d.today ? ago(it.at) : clock(it.at)}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
              {data.feed.length > SHOW && <button type="button" className="pl-more" onClick={() => setMore(!more)}>{more ? '접기' : `근황 ${data.feed.length - SHOW}개 더 보기`}</button>}
            </div> : <p className="meta pl-empty">최근 3일 동안 기록된 판이 없어요. 오늘 밤 첫 판을 열어 주세요!</p>}
          </div>
        </div>
      </section>
    </Swap>
  );
}
