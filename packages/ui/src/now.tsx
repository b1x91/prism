/**
 * NOW (CLAUDE.md v3.126): 멤버 화면 '디스코드'와 '아카이브' 사이. 지금 모이는 팟 (세 개까지).
 * - 팟은 롤 아수라장 로비에서만 생긴다: 회원 앱이 로비를 읽어 저절로 채우고, 큐 → 출발, 게임 → 게임 중, 끝나면 내려간다.
 * - 빈자리 + = 방장에게 알림 ('방장에게 알림을 전달했어요' 토스트). 초대는 방장이 롤에서 한다 (Prism 은 클라이언트를 조작하지 않는다).
 * - 기다리는 사람은 빈자리에 금빛 테두리의 흐린 얼굴로. 방장 화면에는 'OO님이 기다려요' 줄도.
 * - '로비를 NOW에 자동으로 올리기' 스위치 (회원마다, 기본 켜짐).
 */
import { useEffect, useRef, useState } from 'react';
import type { Api, NowList, NowLobby } from '@prism/core';
import { useLoad } from './crew';
import { MemberFace, Toggle } from './basics';
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
  const open = lobbies.filter((l) => l.phase === 'lobby').length;
  const flash = (text: string, ok: boolean) => {
    setToast({ text, ok, k: Date.now() });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 2600);
  };
  const ask = async (l: NowLobby) => {
    setAsked((s) => new Set(s).add(l.id));
    try { await api.post(`/api/now/${encodeURIComponent(l.id)}/request`, {}); flash('방장에게 알림을 전달했어요', true); void reload(); }
    catch (e) { setAsked((s) => { const n = new Set(s); n.delete(l.id); return n; }); flash(msgOf(e), false); }
  };
  const toggle = async (v: boolean) => {
    setAuto(v);
    try { await api.post('/api/me/now-auto', { on: v }); onAutoChange?.(v); void reload(); } catch { setAuto(!v); }
  };
  return (
    <Swap on={rv} skeleton={<NowSkeleton />}>
      <section className={`card now-card ${fadeCls(rv)}`} aria-label="NOW 지금 모이는 팟"><div className="now-in">
        <div className="now-side">
          <div className="now-head"><span className="now-k">NOW</span>{open > 0 && <span className="now-live"><i />팟 {open}개 모집 중</span>}</div>
          <h2 className="now-title">롤에서 로비만 만들면<br />여기에 저절로 떠요</h2>
          <p className="now-desc">아수라장 로비를 만들거나 들어가면 Prism 앱이 로비 인원을 읽어 팟을 채워요. 큐를 돌리면 '게임 중', 끝나면 내려가요.</p>
          <div className="now-auto">
            <span><b>로비를 NOW에 자동으로 올리기</b><small>혼자 연습할 땐 끄세요</small></span>
            <Toggle on={on} onChange={(v) => void toggle(v)} label="로비를 NOW에 자동으로 올리기" />
          </div>
          <div className="now-hint"><b>빈자리의 + 를 누르면</b><span>방장에게 알림이 가요. 초대는 방장이 롤에서 해요.</span></div>
        </div>
        <div className="now-list">
          {lobbies.map((l, i) => <LobbyRow key={l.id} n={i + 1} l={l} meId={meId} asked={asked.has(l.id)} onAsk={() => void ask(l)} onMember={onMember} />)}
          {lobbies.length < MAX && <div className="now-row empty"><b>{lobbies.length + 1}팟</b><span>{lobbies.length ? '비어 있어요' : '아직 열린 로비가 없어요'} · 롤에서 아수라장 로비를 만들면 여기에 떠요</span></div>}
          <div className="now-toast-slot" aria-live="polite">
            {toast && <div key={toast.k} className={`now-toast ${toast.ok ? '' : 'err'}`} role="status">{toast.ok && <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8.5 6.5 12 13 4.5" /></svg>}{toast.text}</div>}
          </div>
        </div>
      </div></section>
    </Swap>
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

/** 실제와 같은 틀의 자리표시 (v3.62) */
function NowSkeleton() {
  return (
    <section className="card now-card" aria-busy="true"><div className="now-in">
      <div className="now-side">
        <div className="now-head"><span className="now-k">NOW</span></div>
        <h2 className="now-title">롤에서 로비만 만들면<br />여기에 저절로 떠요</h2>
        <p className="now-desc">아수라장 로비를 만들거나 들어가면 Prism 앱이 로비 인원을 읽어 팟을 채워요. 큐를 돌리면 '게임 중', 끝나면 내려가요.</p>
        <div className="now-auto"><span><b>로비를 NOW에 자동으로 올리기</b><small>혼자 연습할 땐 끄세요</small></span><Bone w={44} h={24} r="pill" dark /></div>
        <div className="now-hint"><b>빈자리의 + 를 누르면</b><span>방장에게 알림이 가요. 초대는 방장이 롤에서 해요.</span></div>
      </div>
      <div className="now-list">
        {[0, 1, 2].map((i) => (
          <div key={i} className="now-row empty sk-row"><Bone w={48} h={36} dark /><span className="now-slots">{[0, 1, 2, 3, 4].map((j) => <Bone key={j} w={48} h={48} r="round" dark />)}</span><Bone w={140} h={14} dark /></div>
        ))}
      </div>
    </div></section>
  );
}
