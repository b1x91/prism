/**
 * 초대 페이지 · 가입 신청 (CLAUDE.md v3.148, 시안 D: 무대 위 둘러보기).
 *  /i/:code  초대 링크 — 초대한 멤버 + 모임 숫자 → 숫자로 보는 Prism → 세 곳 → 규칙 7개(하나씩 확인) → 신청서 → 면접 안내
 *  /apply    이 기기에 남긴 내 신청 (진행 상황)
 * 위 막대 = 몇 번째 장, 아래 막대 = 그 장 안의 스크롤 위치. 숫자는 모두 모임 합계(사람 이름 없음).
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Gem, INVITE_KEY, Icon, MemberFace } from '@prism/ui';
import { JOIN_RULES, JOIN_TIMES, cleanRiotId, shortNick, type JoinLanding, type JoinStats, type MyApplication } from '@prism/core';
import { SERVER, useSession } from '../session';

const APPLY_KEY = 'prism-apply';
const savedToken = () => { try { return localStorage.getItem(APPLY_KEY); } catch { return null; } };

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${SERVER}${path}`, init);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? '잠시 뒤에 다시 시도해 주세요.');
  return j as T;
}

export function InvitePage() {
  const { code = '' } = useParams();
  useEffect(() => { if (/^[a-z0-9]{4,12}$/.test(code)) try { localStorage.setItem(INVITE_KEY, code); } catch { /* 저장 막힘 */ } }, [code]);
  return <JoinFlow code={code} />;
}

export function ApplyPage() {
  return <JoinFlow code={null} statusOnly />;
}

function JoinFlow({ code, statusOnly }: { code: string | null; statusOnly?: boolean }) {
  const { member, links } = useSession();
  const nav = useNavigate();
  const [land, setLand] = useState<JoinLanding | null>(null);
  const [mine, setMine] = useState<MyApplication | null | false>(statusOnly || savedToken() ? null : false);
  const [fresh, setFresh] = useState(false); // 방금 신청함 → 완료 장
  useEffect(() => {
    getJson<JoinLanding>(`/public/join${code ? `?code=${code}` : ''}`).then(setLand).catch(() => setLand({ inviter: null, stats: EMPTY }));
    const t = savedToken();
    if (t) getJson<MyApplication>(`/public/apply/${t}`).then(setMine).catch(() => { try { localStorage.removeItem(APPLY_KEY); } catch { /* */ } setMine(false); });
    else if (statusOnly) setMine(false);
  }, [code, statusOnly]);

  if (member) return <Shell><Already onGo={() => nav('/invite')} /></Shell>;
  if (!land || mine === null) return <Shell><div className="jn-card jn-sk" aria-busy="true"><span className="jn-line top" /><div className="jn-body"><i /><i /><i /></div></div></Shell>;
  if (mine && !fresh) return <Shell stage={<Stage land={land} />}><StatusCard me={mine} discord={links.discord} /></Shell>;
  if (statusOnly && !mine) return <Shell><div className="jn-card"><div className="jn-body"><h2>진행 중인 신청이 없어요</h2><p className="jn-lede">초대 링크로 들어와 신청할 수 있어요. 아는 멤버에게 초대 링크를 부탁해 주세요.</p></div></div></Shell>;
  return <Shell stage={<Stage land={land} />}><Tour code={code} land={land} done={mine || null} onDone={(m) => { setMine(m); setFresh(true); }} /></Shell>;
}

const EMPTY: JoinStats = { members: 0, online: 0, week: 0, month: 0, together: 0, days: 0, monthDays: 1, hours: Array(24).fill(0), voice: null, appUsers: 0, yesterday: 0 };

function Shell({ stage, children }: { stage?: ReactNode; children: ReactNode }) {
  return <section className="section jn-sec"><div className="wrap jn">{stage}{children}</div></section>;
}

/** 숫자가 작을 때 빈약해 보이지 않게: 이번 주 50판 아래면 이번 달, 지금 접속 3명 아래면 어제 모인 멤버 */
function liveTiles(s: JoinStats) {
  const now = s.online >= 3 ? { v: s.online, l: '지금 접속', live: true } : { v: s.yesterday, l: '어제 모인 멤버', live: false };
  const games = s.week >= 50 ? { v: s.week, l: '이번 주 판' } : { v: s.month, l: '이번 달 판' };
  return ([now, games, { v: s.members, l: '멤버', keep: true }] as { v: number; l: string; live?: boolean; keep?: boolean }[]).filter((t) => t.keep || t.v > 0);
}

function Live({ s }: { s: JoinStats }) {
  const t = liveTiles(s);
  return <div className="jn-live" style={{ gridTemplateColumns: `repeat(${t.length}, minmax(0, 1fr))` }}>{t.map((t) => <div key={t.l} className={t.live ? 'now' : ''}><b>{t.v.toLocaleString()}</b><span>{t.l}</span></div>)}</div>;
}

function Hero({ land, big }: { land: JoinLanding; big?: boolean }) {
  return <>
    <small className="jn-kick">INVITATION{land.inviter ? ` · ${shortNick(land.inviter.nick)} 님의 초대` : ''}</small>
    <h1 className={big ? 'jn-h brand' : 'jn-h big'}>밤마다<br />빛이 모이는 곳</h1>
    <p className="jn-lede">30대 이상이 모여 매일 밤 아수라장 칼바람을 함께하는 모임, Prism이에요.</p>
  </>;
}

/** PC 왼쪽 무대 (휴대폰에서는 첫 장이 대신한다) */
function Stage({ land }: { land: JoinLanding }) {
  const s = land.stats;
  return (
    <aside className="jn-stage" aria-label="Prism 소개">
      <span className="jn-glow" aria-hidden="true" />
      <Hero land={land} big />
      <div className="jn-kpi four">{[...liveTiles(s), ...(s.together > 0 ? [{ v: s.together, l: '같이 한 판', u: '%' }] : [])].map((t) => <div key={t.l}><b>{t.v.toLocaleString()}{'u' in t && <em>{t.u}</em>}</b><span>{t.l}</span></div>)}</div>
    </aside>
  );
}

function Inviter({ land }: { land: JoinLanding }) {
  const i = land.inviter;
  if (!i) return null;
  return <div className="jn-by"><MemberFace nick={i.nick} skin={i.skin} champion={i.main} size={40} /><div><b>{shortNick(i.nick)} 님이 초대했어요</b>{i.intro && <span>"{i.intro}"</span>}</div></div>;
}

// ───────── 투어 ─────────

const LABEL = ['', '둘러보기', '다음', '다음', '모두 확인했어요', '신청하기'];

function Tour({ code, land, done, onDone }: { code: string | null; land: JoinLanding; done: MyApplication | null; onDone: (m: MyApplication) => void }) {
  const [k, setK] = useState(done ? 6 : 1);
  const [rules, setRules] = useState<boolean[]>(() => JOIN_RULES.map(() => false));
  const [riot, setRiot] = useState('');
  const [kakao, setKakao] = useState('');
  const [times, setTimes] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [me, setMe] = useState<MyApplication | null>(done);
  const sc = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLElement>(null);
  const pos = useCallback(() => {
    const el = sc.current, b = bar.current;
    if (!el || !b) return;
    const max = el.scrollHeight - el.clientHeight;
    b.parentElement!.classList.toggle('none', max < 4);
    b.style.width = max < 4 ? '0' : `${Math.round((el.scrollTop / max) * 100)}%`;
  }, []);
  // 장을 넘길 때만 맨 위로 (규칙을 눌러도 보던 자리는 그대로)
  useLayoutEffect(() => { if (sc.current) sc.current.scrollTop = 0; pos(); }, [k, pos]);
  useEffect(() => { const el = sc.current; if (!el) return; el.addEventListener('scroll', pos, { passive: true }); window.addEventListener('resize', pos); return () => { el.removeEventListener('scroll', pos); window.removeEventListener('resize', pos); }; }, [pos]);

  const riotOk = cleanRiotId(riot);
  const allRules = rules.every(Boolean);
  const canNext = k === 4 ? allRules : k === 5 ? Boolean(riotOk && kakao.trim()) && !busy : true;
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await getJson<{ token: string; mine: MyApplication }>('/public/apply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, riotId: riotOk, kakao: kakao.trim(), times, note: note.trim() || undefined, agree: true }),
      });
      try { localStorage.setItem(APPLY_KEY, r.token); } catch { /* 저장 막힘 */ }
      setMe(r.mine); setK(6); onDone(r.mine);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };
  const next = () => { if (k === 5) void submit(); else setK(k + 1); };
  const s = land.stats;
  const peak = Math.max(1, ...s.hours);
  const order = [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1];
  const top3 = [...order].sort((a, b) => s.hours[b] - s.hours[a]).slice(0, 3);

  return (
    <div className="jn-card">
      <span className="jn-line top" aria-hidden="true"><i style={{ width: `${(Math.min(k, 5) / 5) * 100}%` }} /></span>
      <div className="jn-scroll" ref={sc}>
        <div className="jn-step" key={k}>
          {k === 1 && <>
            <span className="jn-glow" aria-hidden="true" />
            <div className="jn-only-m"><Hero land={land} /></div>
            <div className="jn-only-pc"><small className="jn-kick">반가워요</small><h2 className="jn-h">우리가 어떤 모임인지<br />천천히 둘러보세요</h2></div>
            <Inviter land={land} />
            <div className="jn-only-m"><Live s={s} /></div>
            <p className="jn-only-pc jn-lede">숫자로 본 Prism · 노는 곳 · 함께 지키는 것을 차례로 보여 드릴게요. 1분이면 충분해요.</p>
          </>}
          {k === 2 && <>
            <small className="jn-kick">숫자로 보는 PRISM</small>
            <h2 className="jn-h">매일 밤,<br />실제로 모여요</h2>
            <div className="jn-kpi">
              <div><b>{s.members.toLocaleString()}<em>명</em></b><span>함께하는 멤버</span></div>
              {s.week >= 50 ? <div><b>{s.week.toLocaleString()}<em>판</em></b><span>이번 주 기록된 판</span></div> : s.month > 0 && <div><b>{s.month.toLocaleString()}<em>판</em></b><span>이번 달 기록된 판</span></div>}
              {s.together > 0 && <div><b>{s.together}<em>%</em></b><span>멤버끼리 같이 한 판</span></div>}
              {s.days > 0 && <div><b>{s.days}<em>/ {s.monthDays}일</em></b><span>이번 달 모인 날</span></div>}
              {s.appUsers > 0 && s.month === 0 && <div><b>{s.appUsers}<em>명</em></b><span>앱을 쓰는 멤버</span></div>}
            </div>
            {s.hours.some((h) => h > 0) && <div className="jn-box"><header><b>주로 모이는 시간</b><span>최근 4주</span></header>
              <div className="jn-bars">{order.map((h) => <i key={h} className={top3.includes(h) && s.hours[h] > 0 ? 'hot' : ''} style={{ height: `${Math.max(6, (s.hours[h] / peak) * 100)}%` }} title={`${h}시`} />)}</div>
              <div className="jn-axis">{order.map((h, i) => <span key={h} style={{ visibility: i % 2 ? 'hidden' : 'visible' }}>{h}</span>)}</div>
            </div>}
          </>}
          {k === 3 && <>
            <small className="jn-kick">어디서 · 어떻게</small>
            <h2 className="jn-h">세 곳에서<br />만나요</h2>
            <div className="jn-place">
              <div><i className="d"><Icon name="discord" /></i><p><b>디스코드</b><span>음성 채널에서 같이 게임</span></p>{s.voice != null && <em>지금 {s.voice}명</em>}</div>
              <div><i className="k"><Icon name="talk" /></i><p><b>카카오톡 오픈채팅</b><span>약속 · 소식 · 수다</span></p></div>
              <div><i className="p"><Gem size={20} src="/brand/prism-256.png" /></i><p><b>Prism 앱 · 웹</b><span>도감 · 랭킹 · 증강 가이드</span></p>{s.appUsers > 0 && <em>앱 {s.appUsers}명</em>}</div>
            </div>
            <div className="jn-box"><header><b>Prism의 밤</b></header>
              <div className="jn-night"><div><b>20:40</b>음성 채널에 하나둘 모여요</div><div><b>21:00</b>봇이 오늘의 증강 셋을 올려요</div><div><b>21:10</b>5명 팟 출발</div><div><b>23:30</b>오늘의 하이라이트를 함께 봐요</div></div>
            </div>
          </>}
          {k === 4 && <>
            <small className="jn-kick">함께 지키는 것</small>
            <h2 className="jn-h">하나씩 눌러<br />확인해 주세요</h2>
            <span className="jn-count">확인 <b>{rules.filter(Boolean).length}</b> / {JOIN_RULES.length}</span>
            <div className="jn-rules">{JOIN_RULES.map((r, i) => (
              <button key={r.t} type="button" className={`jn-rule ${rules[i] ? 'on' : ''}`} aria-pressed={rules[i]} onClick={() => setRules((x) => x.map((v, j) => (j === i ? !v : v)))}>
                <span><b>{r.t}</b>{r.d && r.d}</span><span className="tick"><Icon name="check" /></span>
              </button>
            ))}</div>
          </>}
          {k === 5 && <>
            <small className="jn-kick">마지막이에요</small>
            <h2 className="jn-h">운영진이<br />알아볼 수 있게</h2>
            <form className="jn-form" onSubmit={(e) => { e.preventDefault(); if (canNext) next(); }}>
              <label className="field"><span>롤 이름</span><input id="jn-riot" value={riot} autoComplete="off" placeholder="이름#태그 (예: 은하수산책#KR1)" onChange={(e) => setRiot(e.target.value)} />
                {riot && (riotOk ? <em className="ok">이름#태그 형식이 맞아요</em> : <em className="bad">'이름#태그'로 적어 주세요</em>)}</label>
              <label className="field"><span>카카오톡 오픈프로필 이름</span><input id="jn-kakao" value={kakao} maxLength={20} onChange={(e) => setKakao(e.target.value)} /><em>면접방에서 이 이름으로 찾아요</em></label>
              <div className="field"><span>주로 접속하는 시간 <i>선택</i></span>
                <div className="chips">{JOIN_TIMES.map((t) => <button key={t.key} type="button" className={`chip ${times.includes(t.key) ? 'on' : ''}`} aria-pressed={times.includes(t.key)} onClick={() => setTimes((x) => (x.includes(t.key) ? x.filter((y) => y !== t.key) : [...x, t.key]))}>{t.label}</button>)}</div></div>
              <label className="field"><span>한마디 <i>선택</i></span><textarea id="jn-note" value={note} maxLength={100} rows={2} onChange={(e) => setNote(e.target.value)} placeholder={land.inviter ? `예: ${shortNick(land.inviter.nick)}님 회사 동료예요!` : '예: 칼바람만 300판 넘게 했어요!'} /></label>
              {err && <p className="jn-err" role="alert">{err}</p>}
            </form>
          </>}
          {k === 6 && me && <Waiting me={me} />}
        </div>
      </div>
      <div className="jn-dock">
        <span className="jn-line" aria-hidden="true"><i ref={bar} /></span>
        {k === 6 && me ? <RoomButton me={me} /> : (
          <div className={`jn-nav ${k > 1 ? 'two' : ''}`}>
            {k > 1 && <button type="button" className="btn lg jn-ghost" onClick={() => setK(k - 1)}>이전</button>}
            <button type="button" className="btn lg primary" disabled={!canNext} onClick={next}>{busy ? '신청하는 중' : LABEL[k]}</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ───────── 면접 안내 · 진행 상황 ─────────

function useCopied(): [string | null, (key: string, text: string) => void] {
  const [k, setK] = useState<string | null>(null);
  const t = useRef(0);
  const copy = (key: string, text: string) => {
    void navigator.clipboard?.writeText(text).catch(() => {});
    setK(key); window.clearTimeout(t.current); t.current = window.setTimeout(() => setK(null), 1600);
  };
  return [k, copy];
}

function Waiting({ me }: { me: MyApplication }) {
  const [copied, copy] = useCopied();
  const hello = `안녕하세요! ${me.no} ${me.riotId} 입니다.${me.inviter ? ` ${shortNick(me.inviter)}님 초대로 왔어요 🙂` : ''}`;
  return <>
    <span className="jn-glow" aria-hidden="true" />
    <small className="jn-kick ok">{me.status === 'hold' ? '조금만 기다려 주세요' : '신청 완료'}</small>
    <h2 className="jn-h">면접방에서<br />기다릴게요</h2>
    <p className="jn-lede">운영진이 이야기해 보고 톡방과 디스코드로 초대해 드려요. 보통 하루 안에 답해요.</p>
    <div className="jn-ticket"><span>내 면접 번호</span><b>{me.no}</b></div>
    {me.room ? <>
      {me.room.pw && <div className="jn-how">
        <div className="jn-how-s"><i>1</i><div><b>입장 비밀번호</b><span>면접방에 들어갈 때 물어봐요</span></div></div>
        <button type="button" className={`jn-pin ${copied === 'pw' ? 'done' : ''}`} aria-label={`비밀번호 ${me.room.pw} 복사`} onClick={() => copy('pw', me.room!.pw!)}>
          {me.room.pw.split('').map((c, i) => <span key={i}>{c}</span>)}<em>{copied === 'pw' ? '복사됨' : '복사'}</em>
        </button>
      </div>}
      <div className="jn-how">
        <div className="jn-how-s"><i>{me.room.pw ? 2 : 1}</i><div><b>들어가서 첫 인사</b><span>운영진이 번호로 바로 알아봐요</span></div></div>
        <div className="jn-bubble"><span className="who">{me.kakao} · 나</span><p>{hello}</p></div>
        <button type="button" className={`btn jn-copy ${copied === 'hi' ? 'done' : ''}`} onClick={() => copy('hi', hello)}>{copied === 'hi' ? '복사했어요' : '첫 인사 복사'}{copied === 'hi' && <Icon name="check" />}</button>
      </div>
    </> : <p className="jn-note">운영진이 면접방을 준비하고 있어요. 이 화면을 다시 열면 들어갈 곳이 보여요.</p>}
  </>;
}

function RoomButton({ me }: { me: MyApplication }) {
  if (!me.room) return <p className="jn-dock-note">이 기기에서 przm.web.app/apply 로 언제든 진행 상황을 볼 수 있어요</p>;
  return <>
    <a className="btn lg jn-kakao" href={me.room.url} target="_blank" rel="noopener noreferrer"><Icon name="talk" />면접방 들어가기</a>
    <p className="jn-dock-note">{me.room.pw ? '들어가면 1번 비밀번호 → 2번 첫 인사 순서로' : '들어가서 첫 인사를 붙여 넣어 주세요'}</p>
  </>;
}

function StatusCard({ me, discord }: { me: MyApplication; discord: string | null }) {
  const go = me.status === 'confirmed' || me.status === 'invited';
  return (
    <div className="jn-card">
      <span className="jn-line top" aria-hidden="true"><i style={{ width: '100%' }} /></span>
      <div className="jn-scroll"><div className="jn-step">
        {me.status === 'rejected' ? <>
          <h2 className="jn-h">찾아와 주셔서<br />고마워요</h2>
          <p className="jn-lede">이번에는 함께하기 어려워요. 좋은 밤 보내세요.</p>
        </> : me.status === 'joined' ? <>
          <small className="jn-kick ok">멤버가 되었어요</small>
          <h2 className="jn-h">환영해요,<br />{shortNick(me.riotId)} 님!</h2>
          <p className="jn-lede">디스코드로 로그인하면 Prism의 모든 기능이 열려요.</p>
        </> : go ? <>
          <small className="jn-kick ok">확정됐어요</small>
          <h2 className="jn-h">환영해요,<br />{shortNick(me.riotId)} 님!</h2>
          <p className="jn-lede">운영진이 톡방과 디스코드 초대를 보냈어요. 이제 하나만 남았어요.</p>
          <ol className="jn-steps">
            <li className="done"><b>신청하기</b></li>
            <li className="done"><b>면접방에서 인사</b></li>
            <li className="done"><b>톡방 · 디스코드 초대</b><span>카카오톡을 확인해 주세요</span></li>
            <li className="now"><b>Prism 디스코드 들어가기</b><span>디스코드로 로그인하고 롤 계정을 연결하면 멤버가 돼요</span></li>
          </ol>
        </> : <Waiting me={me} />}
      </div></div>
      <div className="jn-dock">
        <span className="jn-line none" aria-hidden="true"><i /></span>
        {(go || me.status === 'joined') && discord ? <a className="btn lg jn-discord" href={discord} target="_blank" rel="noopener noreferrer"><Icon name="discord" />Prism 디스코드</a>
          : me.status === 'rejected' ? null : <RoomButton me={me} />}
      </div>
    </div>
  );
}

function Already({ onGo }: { onGo: () => void }) {
  return (
    <div className="jn-card"><div className="jn-scroll"><div className="jn-step">
      <small className="jn-kick ok">반가워요</small>
      <h2 className="jn-h">이미 Prism<br />멤버예요</h2>
      <p className="jn-lede">친구를 부르고 싶다면 내 초대 링크를 보내 주세요. 친구가 멤버가 되면 피스를 드려요.</p>
    </div></div>
      <div className="jn-dock"><span className="jn-line none" aria-hidden="true"><i /></span><button type="button" className="btn lg primary" onClick={onGo}>내 초대 링크</button></div>
    </div>
  );
}

