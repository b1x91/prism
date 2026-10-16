/**
 * 나를 소개해요 (v3.47): 좋아하는 역할 · 자주 접속하는 요일·시간대 · MBTI — 모두 필수, 칩으로만 고른다.
 * 앱 첫 화면(Onboarding)의 한 단계, 그리고 아직 소개가 없는 회원에게 앱·웹에서 한 번 뜨는 창(WelcomeFlow).
 * 저장하면 서버가 처음 한 번 디스코드 '멤버 환영' 채널에 소개 카드를 올린다.
 */
import { useState } from 'react';
import { ABOUT_DAYS, ABOUT_ROLES, ABOUT_TIMES, MBTI_LIST, ROLE_KO, cleanAbout, type About, type Api, josa } from '@prism/core';
import { FavChampPick } from './favpick';
import { ROLE_DOT } from './champ';

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export function AboutPick({ api, initial, onDone, verb = '저장' }: { api: Api; initial?: About | null; onDone: (a: About) => void; verb?: string }) {
  const [roles, setRoles] = useState<string[]>(initial?.roles ?? []);
  const [days, setDays] = useState<string[]>(initial?.days ?? []);
  const [times, setTimes] = useState<string[]>(initial?.times ?? []);
  const [mbti, setMbti] = useState(initial?.mbti ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const about = cleanAbout({ roles, days, times, mbti });
  const left = [!roles.length && '역할', !days.length && '요일', !times.length && '시간대', !mbti && 'MBTI'].filter(Boolean) as string[];
  const save = async () => {
    if (!about) return;
    setBusy(true); setErr('');
    try { await api.post('/api/me/about', { about }); onDone(about); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  return (
    <div className="abt">
      <section className="abt-q">
        <b>좋아하는 역할 <small>여러 개</small></b>
        <div className="abt-chips">{ABOUT_ROLES.map((r) => <button key={r} type="button" className={`chip ${roles.includes(r) ? 'on' : ''}`} aria-pressed={roles.includes(r)} onClick={() => setRoles(toggle(roles, r))}><i className="role-dot" style={{ background: ROLE_DOT[r] }} />{ROLE_KO[r]}</button>)}</div>
      </section>
      <section className="abt-q">
        <b>자주 접속하는 요일 <small>여러 개</small></b>
        <div className="abt-chips days">{ABOUT_DAYS.map((d) => <button key={d} type="button" className={`chip ${days.includes(d) ? 'on' : ''}`} aria-pressed={days.includes(d)} onClick={() => setDays(toggle(days, d))}>{d}</button>)}</div>
      </section>
      <section className="abt-q">
        <b>주로 하는 시간대 <small>여러 개</small></b>
        <div className="abt-chips">{ABOUT_TIMES.map((t) => <button key={t.key} type="button" className={`chip ${times.includes(t.key) ? 'on' : ''}`} aria-pressed={times.includes(t.key)} onClick={() => setTimes(toggle(times, t.key))}>{t.label}<small>{t.sub}</small></button>)}</div>
      </section>
      <section className="abt-q">
        <b>MBTI</b>
        <div className="abt-mbti">{MBTI_LIST.map((m) => <button key={m} type="button" className={`chip ${mbti === m ? 'on' : ''}`} aria-pressed={mbti === m} onClick={() => setMbti(m)}>{m}</button>)}</div>
      </section>
      {err && <p className="l" style={{ margin: 0 }}>{err}</p>}
      <button type="button" className="btn primary lg abt-go" disabled={!about || busy} onClick={save}>{busy ? '저장 중…' : about ? verb : `${josa(left.join(' · '), '을/를')} 골라 주세요`}</button>
    </div>
  );
}

/** 앱·웹: 대표 스킨(최애 챔프)이나 소개가 아직 없는 회원에게 — 필요한 단계만 차례로. '나중에'는 이번 접속에서만 닫는다 */
export function WelcomeFlow({ api, nick, needFace, onClose }: { api: Api; nick: string; needFace: boolean; onClose: (done: boolean) => void }) {
  const [step, setStep] = useState<'face' | 'about'>(needFace ? 'face' : 'about');
  return (
    <div className="md-wrap" role="dialog" aria-modal="true" aria-label="나를 소개해요">
      <button type="button" className="md-scrim" aria-label="나중에" onClick={() => onClose(false)} />
      <div className="fpk-modal">
        <header className="fpk-head"><div>
          <h2>{nick.split('#')[0]} 님, 반가워요!</h2>
          <p className="meta">{step === 'face' ? '최애 챔프 하나로 시작해요. 프로필 사진이 돼요.' : '모임 사람들에게 나를 소개해요. 멤버 환영 채널에 소개 카드가 올라가요.'}</p>
        </div><button type="button" className="btn ghost sm" onClick={() => onClose(false)}>나중에</button></header>
        {step === 'face' ? <FavChampPick api={api} verb="다음" onDone={() => setStep('about')} /> : <AboutPick api={api} verb="소개하고 시작" onDone={() => onClose(true)} />}
      </div>
    </div>
  );
}
