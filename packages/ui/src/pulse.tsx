/**
 * 멤버 근황 (v3.74·v3.75·v3.76): 멤버 화면 '지금 디스코드' 아래. 매일 들어와 보고 싶은 칸.
 *  - 맨 위 '오늘' 띠: 오늘 플레이한 멤버 · 오늘 판 수와 멤버 승률 · 오늘의 하이라이트
 *  - 왼쪽 '지금 접속' 칸: 대표 스킨 그림이 은은히 깔린 줄. 게임 중(챔프·몇 분째) · 챔프 고르는 중 · 온라인 · 앱/웹(점 색만)
 *  - 오른쪽 '최근 근황' 타임라인(3일, 날짜별): 하루 판 묶음(승패 칸) · 펜타/쿼드라킬·연승(그림 카드) · 함께한 판 · 첫 기록 · 새 회원
 * 30초마다 새로 본다(화면이 보일 때만). 서버 /api/crew/pulse (담아 두지 않는 주소).
 */
import { useEffect, useState, type ReactNode } from 'react';
import { CHAMPIONS, ago, cdragon, josa, shortDate, shortNick, type Api, type Pulse, type PulseFace, type PulseItem, type PulseNow } from '@prism/core';
import { ChampImg, FacePresence, MemberFace, useSkins } from './basics';
import { Icon } from './icons';
import { PieceIcon } from './shop';
import { useLoad } from './crew';
import { Bone, Swap, fadeCls, imgIn, useReveal } from './skeleton';

const champName = (id: number) => CHAMPIONS[id]?.name ?? '';
const mins = (t: number) => Math.max(1, Math.round((Date.now() - t) / 60000));
const SHOW = 8; // 처음 보여 줄 근황 수 (더 보기로 펼침)
const rate = (n: number, w: number) => (n ? Math.round((w / n) * 100) : 0);
const names = (ms: { nick: string }[]) => ms.slice(0, 3).map((m) => shortNick(m.nick)).join('·') + (ms.length > 3 ? ` 외 ${ms.length - 3}명` : '');

/** 상태 글자. 앱·웹 접속은 점 색으로만 보여 주므로 글자가 없다 */
function nowText(x: PulseNow): ReactNode {
  const c = champName(x.champ);
  if (x.phase === 'game') return <>{c ? `${josa(c, '으로/로')} ` : ''}게임 중 <small>· {mins(x.since)}분째</small></>;
  if (x.phase === 'select') return <>{c ? `${c} · ` : ''}챔프 고르는 중</>;
  if (x.phase === 'lobby' || x.presence === 'game' || x.presence === 'both') return '온라인';
  return null;
}

/** 날짜 칸 이름 (오늘·어제·10월 16일) */
const dayKey = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
function dayLabel(t: number) {
  const k = dayKey(t);
  if (k === dayKey(Date.now())) return '오늘';
  if (k === dayKey(Date.now() - 86_400_000)) return '어제';
  return shortDate(t);
}
const clock = (t: number) => new Date(t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });

/** 승패 칸 (판수가 많으면 비율 막대). 실제 순서가 아니라 이긴 수 → 진 수 */
function WinCells({ n, w }: { n: number; w: number }) {
  if (n > 12) return <i className="pl-wbar"><i style={{ width: `${(w / n) * 100}%` }} /></i>;
  return <span className="pl-cells" aria-label={`${n}판 ${w}승`}>{Array.from({ length: n }, (_, i) => <i key={i} className={i < w ? 'w' : 'l'} />)}</span>;
}

function Faces({ list, max = 5, onMember }: { list: PulseFace[]; max?: number; onMember?: (id: string) => void }) {
  return (
    <span className="pl-stack">
      {list.slice(0, max).map((m) => <button key={m.id} type="button" title={shortNick(m.nick)} onClick={() => onMember?.(m.id)}><MemberFace nick={m.nick} skin={m.skin} champion={m.main} size={28} /></button>)}
      {list.length > max && <span className="pl-stack-n">+{list.length - max}</span>}
    </span>
  );
}

/** 오늘의 하이라이트: 펜타 > 쿼드라 > 가장 긴 연승. 함께한 판 카드 안의 펜타·쿼드라도 후보 — 그때는 카드는 두고 그 칩만 숨긴다 */
type MultiRef = { id: string; nick: string; multi: number; champ: number; win: boolean };
function highlight(feed: PulseItem[]): { item: PulseItem | null; multi?: MultiRef; champ: number; skin: number | null; title: ReactNode; sub: string } | null {
  const today = feed.filter((x) => dayLabel(x.at) === '오늘');
  const solo = today.filter((x): x is Extract<PulseItem, { kind: 'multi' }> => x.kind === 'multi').map((x) => ({ item: x as PulseItem | null, m: x as MultiRef }));
  const inGroup = today.flatMap((x) => (x.kind === 'together' ? (x.multis ?? []).map((m) => ({ item: null as PulseItem | null, m })) : []));
  const best = [...solo, ...inGroup].sort((a, b) => b.m.multi - a.m.multi)[0];
  if (best) return { item: best.item, multi: best.item ? undefined : best.m, champ: best.m.champ, skin: null, title: <><b>{shortNick(best.m.nick)}</b> {best.m.multi >= 5 ? '펜타킬' : '쿼드라킬'}</>, sub: `${champName(best.m.champ)} · ${best.m.win ? '승리한 판' : '아쉽게 진 판'}` };
  const st = today.filter((x): x is Extract<PulseItem, { kind: 'streak' }> => x.kind === 'streak').sort((a, b) => b.streak - a.streak)[0];
  if (st) return { item: st, champ: st.main ?? 0, skin: st.skin, title: <><b>{shortNick(st.nick)}</b> {st.streak}연승 중</>, sub: '지금 이어지는 중' };
  return null;
}

function PulseSkeleton() {
  return (
    <section className="card pad crew-pulse">
      <div className="card-head"><h2>아카이브</h2></div>
      <div className="pl-today">{[0, 1, 2].map((i) => <div key={i} className="pl-tile"><Bone w={80} h={12} /><Bone w={64} h={28} /><Bone w={120} h={12} /></div>)}</div>
      <div className="pl-body">
        <div className="pl-side"><div className="pl-label"><Bone w={64} h={12} /></div>
          <div className="pl-now">{[0, 1, 2].map((i) => <div key={i} className="pl-who"><Bone w={40} h={40} r="pill" /><span className="pl-who-t" style={{ gap: 8 }}><Bone w={72} h={12} /><Bone w={104} h={10} /></span></div>)}</div>
        </div>
        <div className="pl-main"><div className="pl-label"><Bone w={48} h={12} /></div>
          <div className="pl-tl">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="pl-item"><Bone w={32} h={32} r="pill" /><span className="pl-t"><Bone w="46%" h={14} /><Bone w="30%" h={12} /></span><span className="pl-c" /><Bone w={40} h={12} /></div>)}</div>
        </div>
      </div>
    </section>
  );
}

export function CrewPulse({ api, onMember }: { api: Api; onMember?: (id: string) => void }) {
  const { data, reload } = useLoad<Pulse>(api, '/api/crew/pulse');
  const skins = useSkins();
  const [more, setMore] = useState(false);
  // 30초마다 (화면이 보일 때만)
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') reload(); }, 30_000);
    return () => clearInterval(t);
  }, [reload]);
  const rv = useReveal(Boolean(data));
  if (!data) return <PulseSkeleton />;
  const playing = data.now.filter((x) => x.phase === 'game').length;
  const today = data.today;
  const hl = highlight(data.feed);
  const art = (skin: number | null, main: number | null) => (skin && skins?.[skin]?.splash) || (main ? cdragon(CHAMPIONS[main]?.splash) : '');
  // 하이라이트 칸에 올린 근황은 타임라인에서 빼 같은 것을 두 번 보이지 않는다
  const rest = hl?.item ? data.feed.filter((x) => x !== hl.item) : data.feed;
  const feed = more ? rest : rest.slice(0, SHOW);
  // 날짜별로 묶는다 (근황은 이미 최근순)
  const days: { label: string; items: PulseItem[]; today: boolean }[] = [];
  for (const it of feed) {
    const label = dayLabel(it.at);
    const last = days[days.length - 1];
    if (last && last.label === label) last.items.push(it);
    else days.push({ label, items: [it], today: label === '오늘' });
  }

  const row = (it: PulseItem, isToday: boolean, i: number) => {
    const at = <span className="pl-at">{isToday ? ago(it.at) : clock(it.at)}</span>;
    const key = `${it.kind}-${it.at}-${i}`;
    const group = it.kind === 'together' || it.kind === 'firsts' ? it.members : null;
    const lead: PulseFace = group ? group[0] : (it as unknown as PulseFace);
    const faceBtn = (
      <button type="button" className={`pl-face ${group && group.length > 1 ? 'pl-group' : ''}`} onClick={() => onMember?.(lead.id)}>
        <MemberFace nick={lead.nick} skin={lead.skin} champion={lead.main} size={32} />
        {group && group.length > 1 && <span className="pl-plus">+{group.length - 1}</span>}
      </button>
    );
    // 함께한 판: 멤버들을 한 장에 — 함께 N판 · 연판 보너스 · 펜타/쿼드라 축하 · 함께라서 잘한 점 (v3.83)
    if (it.kind === 'together' && (it.praise || it.multis || it.run)) {
      const ms = (it.multis ?? []).filter((m) => !(hl?.multi && hl.multi.id === m.id && hl.multi.champ === m.champ && hl.multi.multi === m.multi));
      const praise = it.praise ?? [];
      return (
        <div key={key} className="pl-team">
          <div className="pl-team-h">
            <span className="pl-stack lg">{it.members.slice(0, 5).map((m) => <button key={m.id} type="button" title={shortNick(m.nick)} onClick={() => onMember?.(m.id)}><MemberFace nick={m.nick} skin={m.skin} champion={m.main} size={36} /></button>)}{it.members.length > 5 && <span className="pl-stack-n">+{it.members.length - 5}</span>}</span>
            <span className="pl-team-t"><b>{names(it.members)}</b><span><WinCells n={it.n} w={it.w} />함께 {it.n}판 {it.w}승</span></span>
            {at}
          </div>
          {(it.run ?? 0) >= 2 && <div className="pl-team-run">함께 {it.run}연판<span>·</span>한 명당 +{(it.bonus ?? 0).toLocaleString()}<PieceIcon size={12} /></div>}
          {ms.length > 0 && <div className="pl-team-multi">{ms.map((m, k) => (
            <span key={k} className={`pl-mk ${m.multi >= 5 ? 'penta' : ''}`}><ChampImg id={m.champ} size={24} /><b>{shortNick(m.nick)}</b><em>{m.multi >= 5 ? '펜타킬!' : '쿼드라킬!'}</em></span>
          ))}</div>}
          {praise.length > 0 && <div className="pl-praise"><small className="pl-praise-h">함께라서 잘한 점</small>{praise.map((p) => (
            <div key={p.key} className="pl-pr"><i aria-hidden="true"><Icon name="check" /></i><span><b>{p.title}</b><small>{p.text}</small></span></div>
          ))}</div>}
        </div>
      );
    }
    // 펜타·쿼드라킬·연승은 그림 카드
    if (it.kind === 'multi' || it.kind === 'streak') {
      const src = it.kind === 'multi' ? cdragon(CHAMPIONS[it.champ]?.splash) : art(it.skin, it.main);
      return (
        <div key={key} className={`pl-item pl-feat ${it.kind === 'multi' ? (it.multi >= 5 ? 'penta' : 'quadra') : 'streak'}`}>
          {faceBtn}
          <span className="pl-card">
            {src && <img className="pl-card-bg fi" {...imgIn} src={src} alt="" loading="lazy" />}
            <span className="pl-card-t">
              <small>{it.kind === 'multi' ? `${champName(it.champ)} · ${it.win ? '승리한 판' : '아쉽게 진 판'}` : '지금 이어지는 중'}</small>
              <b>{shortNick(it.nick)} <em>{it.kind === 'multi' ? (it.multi >= 5 ? '펜타킬!' : '쿼드라킬!') : `${it.streak}연승`}</em></b>
            </span>
          </span>
          {at}
        </div>
      );
    }
    let title: ReactNode = null; let sub: ReactNode = null; let cls = '';
    switch (it.kind) {
      case 'session': title = <><b>{shortNick(it.nick)}</b><span className="pl-act">{it.n}판 {it.w}승</span></>; sub = <><WinCells n={it.n} w={it.w} /><span>승률 {rate(it.n, it.w)}% · 주로 {champName(it.champ)}</span></>; break;
      case 'together': title = <><b>{names(it.members)}</b><span className="pl-act">함께 {it.n}판</span></>; sub = <><WinCells n={it.n} w={it.w} /><span>{it.w}승 {it.n - it.w}패</span></>; cls = 'crew'; break;
      case 'first': title = <><b>{shortNick(it.nick)}</b><span className="pl-act">첫 판 기록</span></>; sub = <span>{champName(it.champ)}</span>; cls = 'new'; break;
      case 'firsts': title = <><b>{names(it.members)}</b><span className="pl-act">첫 판 기록</span></>; sub = <span>{it.members.length}명이 처음으로 기록됐어요</span>; cls = 'new'; break;
      case 'joined': title = <><b>{shortNick(it.nick)}</b><span className="pl-act">새로 들어왔어요</span></>; sub = <span>반갑게 맞아 주세요</span>; cls = 'new'; break;
    }
    return (
      <div key={key} className={`pl-item ${cls}`}>
        {faceBtn}
        <span className="pl-t"><span className="pl-t1">{title}</span><span className="pl-t2">{sub}</span></span>
        <span className="pl-c">{'champ' in it && it.champ > 0 && <ChampImg id={it.champ} size={32} />}</span>
        {at}
      </div>
    );
  };

  return (
    <Swap on={rv} skeleton={<PulseSkeleton />}>
      <section className={`card pad crew-pulse ${fadeCls(rv)}`}>
        <div className="card-head">
          <h2>아카이브</h2><span className="sp" />
          {playing > 0 && <span className="pl-live"><i />{playing}명 게임 중</span>}
        </div>

        {/* 오늘 */}
        <div className="pl-today">
          <div className="pl-tile">
            <small>오늘 플레이한 멤버</small>
            <b>{today?.players.length ?? 0}<span>명</span></b>
            {today?.players.length ? <Faces list={today.players} onMember={onMember} /> : <span className="pl-tile-sub">아직 아무도 안 했어요</span>}
          </div>
          <div className="pl-tile">
            <small>오늘 멤버 전적</small>
            <b>{today?.games ?? 0}<span>판</span></b>
            {today?.n ? <span className="pl-tile-sub"><i className="pl-wbar"><i style={{ width: `${(today.w / today.n) * 100}%` }} /></i>승률 {rate(today.n, today.w)}%</span> : <span className="pl-tile-sub">오늘 밤 첫 판을 기다려요</span>}
          </div>
          <div className={`pl-tile pl-hl ${hl ? 'on' : ''}`}>
            {hl && (hl.skin ? art(hl.skin, hl.champ) : hl.champ ? cdragon(CHAMPIONS[hl.champ]?.splash) : '') ? <img className="pl-hl-bg fi" {...imgIn} src={hl.skin ? art(hl.skin, hl.champ) : cdragon(CHAMPIONS[hl.champ]?.splash)} alt="" loading="lazy" /> : null}
            <small>오늘의 하이라이트</small>
            {hl ? <><span className="pl-hl-t">{hl.title}</span><span className="pl-tile-sub">{hl.sub}</span></> : <><span className="pl-hl-t none">아직 없어요</span><span className="pl-tile-sub">펜타·쿼드라킬과 4연승이 여기에 올라와요</span></>}
          </div>
        </div>

        <div className="pl-body">
          {/* 지금 접속 */}
          <div className="pl-side">
            <div className="pl-label"><i className={`pl-ldot ${data.now.length ? 'on' : ''}`} />지금 접속 <b>{data.now.length}</b></div>
            {data.now.length ? <div className="pl-now">{data.now.map((x) => {
              const st = nowText(x);
              const bg = art(x.skin, x.main);
              return (
                <button key={x.id} type="button" className={`pl-who ${x.phase}`} onClick={() => onMember?.(x.id)}>
                  {bg && <img className="pl-who-bg fi" {...imgIn} src={bg} alt="" loading="lazy" />}
                  <FacePresence p={x.presence}><MemberFace nick={x.nick} skin={x.skin} champion={x.main} size={40} /></FacePresence>
                  <span className="pl-who-t"><b>{shortNick(x.nick)}</b>{st && <span>{st}</span>}</span>
                  {(x.phase === 'game' || x.phase === 'select') && x.champ > 0 && <ChampImg id={x.champ} size={32} />}
                </button>
              );
            })}</div> : <p className="meta pl-empty">지금 접속한 멤버가 없어요</p>}
          </div>

          {/* 최근 근황 */}
          <div className="pl-main">
            <div className="pl-label">최근 근황</div>
            {days.length ? <>
              {days.map((d) => (
                <div key={d.label} className="pl-day">
                  <div className="pl-dayh"><span>{d.label}</span></div>
                  <div className="pl-tl">{d.items.map((it, i) => row(it, d.today, i))}</div>
                </div>
              ))}
              {rest.length > SHOW && <button type="button" className="pl-more" onClick={() => setMore(!more)}>{more ? '접기' : `근황 ${rest.length - SHOW}개 더 보기`}</button>}
            </> : <p className="meta pl-empty">최근 3일 동안 기록된 판이 없어요. 오늘 밤 첫 판을 열어 주세요!</p>}
          </div>
        </div>
      </section>
    </Swap>
  );
}
