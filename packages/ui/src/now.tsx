/**
 * NOW (CLAUDE.md v3.126): 멤버 화면 '디스코드'와 '아카이브' 사이. 지금 모이는 팟 (세 개까지).
 * - 팟은 롤 아수라장 로비에서만 생긴다: 회원 앱이 로비를 읽어 저절로 채우고, 큐 → 출발, 게임 → 게임 중, 끝나면 내려간다.
 * - 빈자리 + = 방장에게 알림 ('방장에게 알림을 전달했어요' 토스트). 초대는 방장이 롤에서 한다 (Prism 은 클라이언트를 조작하지 않는다).
 * - 기다리는 사람은 빈자리에 금빛 테두리의 흐린 얼굴로. 방장 화면에는 'OO님이 기다려요' 줄도.
 * - '로비를 NOW에 자동으로 올리기' 스위치 (회원마다, 기본 켜짐).
 * - 함께 게임 중 (v3.130): 로비를 알리지 않았어도 같은 판에 회원이 2명 이상이면. 그 판의 챔프를 얼굴 옆에.
 */
import { useEffect, useRef, useState } from 'react';
import type { Api, NowFace, NowGame, NowGameSide, NowList, NowLobby, NowScrim, NowTeam } from '@prism/core';
import { useLoad } from './crew';
import { ChampImg, MemberFace, Toggle } from './basics';
import { Bone, Swap, fadeCls, useReveal } from './skeleton';

const msgOf = (e: unknown) => (e instanceof Error ? e.message : String(e));
const POLL = 15_000;
const MAX = 3;
const ago = (t: number) => { const m = Math.floor((Date.now() - t) / 60_000); return m < 1 ? '방금' : m < 60 ? `${m}분 전` : `${Math.floor(m / 60)}시간 전`; };
const BADGE: Record<NowLobby['phase'], string> = { lobby: '롤 로비', queue: '출발', game: '게임 중' };

export function NowCard({ api, meId, onMember, onAutoChange }: { api: Api; meId: string; onMember?: (id: string) => void; /** 스위치를 바꾼 뒤 (앱은 내 정보를 다시 받아 로비 알리기를 멈춘다) */ onAutoChange?: (on: boolean) => void }) {
  const { data, reload } = useLoad<NowList>(api, '/api/now');
  const rv = useReveal(Boolean(data));
  const [auto, setAuto] = useState<boolean | null>(null);
  const [toast, setToast] = useState<{ text: string; ok: boolean; k: number } | null>(null);
  const [asked, setAsked] = useState<Set<string>>(new Set());
  const timer = useRef<number | undefined>(undefined);
  // 화면을 보고 있는 동안만 15초마다
  useEffect(() => {
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void reload(); }, POLL);
    return () => window.clearInterval(t);
  }, [reload]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  if (!data) return <NowSkeleton />;
  const on = auto ?? data.auto;
  const lobbies = data.lobbies.slice(0, MAX);
  const scrims = data.scrims ?? [];
  const games = data.games ?? [];
  const open = lobbies.filter((l) => l.phase === 'lobby').length;
  const playing = games.reduce((n, g) => n + g.blue.members.length + g.red.members.length, 0);
  const idle = !lobbies.length && !scrims.length && !games.length;
  const flash = (text: string, ok: boolean) => {
    setToast({ text, ok, k: Date.now() });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 2600);
  };
  const ask = async (l: { id: string }) => {
    setAsked((s) => new Set(s).add(l.id));
    try { await api.post(`/api/now/${encodeURIComponent(l.id)}/request`, {}); flash('방장에게 알림을 전달했어요', true); void reload(); }
    catch (e) { setAsked((s) => { const n = new Set(s); n.delete(l.id); return n; }); flash(msgOf(e), false); }
  };
  const toggle = async (v: boolean) => {
    setAuto(v);
    try { await api.post('/api/me/now-auto', { on: v }); onAutoChange?.(v); void reload(); } catch { setAuto(!v); }
  };
  // 돌아가는 팟·내전이 없으면 한 줄로 작게 (v3.127)
  if (idle) return (
    <Swap on={rv} skeleton={<NowSkeleton />}>
      <section className={`card now-card mini ${fadeCls(rv)}`} aria-label="NOW 지금 모이는 팟">
        <span className="now-k">NOW</span>
        <span className="now-mini-t"><b>열린 로비가 없어요</b><small>롤에서 아수라장 로비를 만들면 여기에 떠요</small></span>
        <label className="now-mini-auto"><small>자동으로 올리기</small><Toggle on={on} onChange={(v) => void toggle(v)} label="로비를 NOW에 자동으로 올리기" /></label>
      </section>
    </Swap>
  );
  return (
    <Swap on={rv} skeleton={<NowSkeleton />}>
      <section className={`card now-card ${fadeCls(rv)}`} aria-label="NOW 지금 모이는 팟"><div className="now-in">
        <div className="now-bar">
          <span className="now-k">NOW</span>
          {scrims.length > 0 && <span className="now-live scrim"><i />내전 중</span>}
          {open > 0 && <span className="now-live"><i />팟 {open}개 모집 중</span>}
          {playing > 0 && <span className="now-live game"><i />{playing}명 함께 게임 중</span>}
          <small className="now-tip">{open > 0 || scrims.some((x) => x.phase === 'lobby') ? '빈자리의 + 를 누르면 방장에게 알림이 가요' : ''}</small>
          <label className="now-mini-auto"><small>자동으로 올리기</small><Toggle on={on} onChange={(v) => void toggle(v)} label="로비를 NOW에 자동으로 올리기" /></label>
        </div>
        <div className="now-list">
          {scrims.map((x) => <ScrimPanel key={x.id} x={x} meId={meId} asked={asked.has(x.id)} onAsk={() => void ask(x)} onMember={onMember} />)}
          {lobbies.map((l, i) => <LobbyRow key={l.id} n={i + 1} l={l} meId={meId} asked={asked.has(l.id)} onAsk={() => void ask(l)} onMember={onMember} />)}
          {games.map((g) => <GameRow key={g.id} g={g} meId={meId} onMember={onMember} />)}
          <div className="now-toast-slot" aria-live="polite">
            {toast && <div key={toast.k} className={`now-toast ${toast.ok ? '' : 'err'}`} role="status">{toast.ok && <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8.5 6.5 12 13 4.5" /></svg>}{toast.text}</div>}
          </div>
        </div>
      </div></section>
    </Swap>
  );
}

const SCRIM_PHASE: Record<NowScrim['phase'], string> = { lobby: '모이는 중', queue: '챔프 선택', game: '게임 중' };

/** 내전 중 (v3.127): 사용자 설정 로비를 앱이 읽으면. 블루 · 레드 두 팀, 오늘의 점수 */
function ScrimPanel({ x, meId, asked, onAsk, onMember }: { x: NowScrim; meId: string; asked: boolean; onAsk: () => void; onMember?: (id: string) => void }) {
  const inIt = [...x.blue.members, ...x.red.members].some((m) => m.id === meId);
  const waiting = x.requests.filter((r) => ![...x.blue.members, ...x.red.members].some((m) => m.id === r.id));
  const canAsk = x.phase === 'lobby' && !inIt && !asked && !waiting.some((r) => r.id === meId) && x.size < 10;
  const isHost = x.leader === meId;
  const team = (t: NowTeam, side: 'blue' | 'red') => (
    <div className={`now-team ${side}`}>
      <span className="now-team-h"><i />{side === 'blue' ? '블루' : '레드'}<small>{t.size} / 5</small></span>
      <div className="now-slots">
        {t.members.map((m) => (
          <button key={m.id} type="button" className={`now-face ${m.id === x.leader ? 'lead' : ''}`} title={m.nick} onClick={() => onMember?.(m.id)}>
            <MemberFace nick={m.nick} skin={m.skin} champion={m.main} size={44} />{m.id === x.leader && x.phase !== 'game' && <i className="now-star" aria-label="방장">★</i>}
          </button>
        ))}
        {Array.from({ length: Math.max(0, t.size - t.members.length) }, (_, i) => <span key={`s${i}`} className="now-face other" title="Prism 회원이 아닌 분" />)}
        {Array.from({ length: Math.max(0, 5 - t.size) }, (_, i) => x.phase === 'lobby'
          ? <button key={`f${i}`} type="button" className="now-plus" disabled={!canAsk} aria-label={canAsk ? '방장에게 들어가고 싶다고 알리기' : '빈자리'} onClick={onAsk}>+</button>
          : <span key={`f${i}`} className="now-face gone" />)}
      </div>
    </div>
  );
  return (
    <div className={`now-scrim ${x.phase}`}>
      <div className="now-scrim-h">
        <i className="now-badge scrim">내전</i>
        <b>{SCRIM_PHASE[x.phase]}</b>
        <small>{x.size} / 10</small>
        <span className="sp" />
        {x.series.games > 0 && <span className="now-series" title="지난 6시간 기록된 사용자 설정 판, 게임 진영 기준">오늘 <b className="blue">{x.series.blue}</b> : <b className="red">{x.series.red}</b></span>}
      </div>
      <div className="now-teams">{team(x.blue, 'blue')}{team(x.red, 'red')}</div>
      {waiting.length > 0 && x.phase === 'lobby' && <div className="now-wait"><i />{waiting.map((r: NowFace) => r.nick).join(', ')}님이 기다려요{isHost && <small>롤에서 초대하면 바로 채워져요</small>}</div>}
    </div>
  );
}

function LobbyRow({ n, l, meId, asked, onAsk, onMember }: { n: number; l: NowLobby; meId: string; asked: boolean; onAsk: () => void; onMember?: (id: string) => void }) {
  const mine = l.members.some((m) => m.id === meId);
  const host = l.members.find((m) => m.id === l.leader) ?? l.members[0];
  const strangers = Math.max(0, l.size - l.members.length);
  const waiting = l.requests.filter((r) => !l.members.some((m) => m.id === r.id));
  const free = Math.max(0, 5 - l.size - waiting.length);
  const canAsk = l.phase === 'lobby' && !mine && !asked && !waiting.some((r) => r.id === meId);
  const isHost = l.leader === meId || (!l.leader && host?.id === meId);
  return (
    <div className={`now-row ${l.phase} ${mine ? 'mine' : ''}`}>
      <span className="now-n"><b>{n}팟</b><i className={`now-badge ${l.phase}`}>{mine && l.phase === 'lobby' ? '내 로비' : BADGE[l.phase]}</i></span>
      <div className="now-slots">
        {l.members.map((m) => (
          <button key={m.id} type="button" className={`now-face ${m.id === l.leader ? 'lead' : ''}`} title={m.nick} onClick={() => onMember?.(m.id)}>
            <MemberFace nick={m.nick} skin={m.skin} champion={m.main} size={48} />{m.id === l.leader && l.phase !== 'game' && <i className="now-star" aria-label="방장">★</i>}
          </button>
        ))}
        {Array.from({ length: strangers }, (_, i) => <span key={`s${i}`} className="now-face other" title="Prism 회원이 아닌 분" />)}
        {waiting.map((r) => <span key={r.id} className="now-face wait" title={`${r.nick}님이 기다려요`}><MemberFace nick={r.nick} skin={r.skin} champion={r.main} size={48} /></span>)}
        {l.phase === 'lobby' && Array.from({ length: free }, (_, i) => (
          <button key={`f${i}`} type="button" className="now-plus" disabled={!canAsk} aria-label={canAsk ? '방장에게 들어가고 싶다고 알리기' : '빈자리'} onClick={onAsk}>+</button>
        ))}
      </div>
      <span className="now-meta">
        <span>{host ? `${host.nick}님 로비` : '로비'} · {l.size} / 5</span>
        <small>{l.phase === 'game' ? '끝나면 저절로 내려가요' : l.phase === 'queue' ? '큐를 돌리는 중이에요' : `${ago(l.since)} 올라왔어요`}</small>
      </span>
      {isHost && waiting.length > 0 && l.phase === 'lobby' && (
        <div className="now-wait"><i />{waiting.map((r) => r.nick).join(', ')}님이 기다려요<small>롤에서 초대하면 바로 채워져요</small></div>
      )}
    </div>
  );
}

const mins = (t: number) => Math.max(1, Math.floor((Date.now() - t) / 60_000));

/** 함께 게임 중 (v3.130): 같은 판의 회원 얼굴 + 그 판의 챔프. 양 팀에 회원이 있으면 팀을 나눠 'vs' */
function GameRow({ g, meId, onMember }: { g: NowGame; meId: string; onMember?: (id: string) => void }) {
  const mine = [...g.blue.members, ...g.red.members].some((m) => m.id === meId);
  const both = g.blue.members.length > 0 && g.red.members.length > 0;
  const group = (t: NowGameSide) => t.members.map((m) => (
    <button key={m.id} type="button" className="now-face" title={m.nick} onClick={() => onMember?.(m.id)}>
      <MemberFace nick={m.nick} skin={m.skin} champion={m.main} size={48} />
      {m.champ > 0 && <span className="now-champ"><ChampImg id={m.champ} size={22} /></span>}
    </button>
  ));
  const n = g.blue.members.length + g.red.members.length;
  return (
    <div className={`now-row game together ${mine ? 'mine' : ''}`}>
      <span className="now-n"><b>{both ? '맞대결' : '함께'}</b><i className="now-badge game">게임 중</i></span>
      <div className="now-slots">
        {both ? <>{group(g.blue)}<span className="now-vs">vs</span>{group(g.red)}</> : group(g.blue.members.length ? g.blue : g.red)}
      </div>
      <span className="now-meta">
        <span>멤버 {n}명 · {g.custom ? '사용자 설정' : '아수라장'}</span>
        <small>{mins(g.since)}분째 · 끝나면 저절로 내려가요</small>
      </span>
    </div>
  );
}

/** 자리표시: 가장 흔한 모습(돌아가는 팟이 없을 때의 한 줄)과 같은 틀 (v3.62·v3.127) */
function NowSkeleton() {
  return (
    <section className="card now-card mini" aria-busy="true">
      <span className="now-k">NOW</span>
      <span className="now-mini-t"><Bone w={120} h={14} dark /><Bone w={220} h={12} dark /></span>
      <span className="now-mini-auto"><small>자동으로 올리기</small><Bone w={44} h={24} r="pill" dark /></span>
    </section>
  );
}
