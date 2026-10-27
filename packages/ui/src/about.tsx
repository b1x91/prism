/**
 * 나를 소개해요 (v3.47): 좋아하는 역할 · 자주 접속하는 요일·시간대 · MBTI — 모두 필수, 칩으로만 고른다.
 * 앱 첫 화면(Onboarding)의 한 단계, 그리고 아직 소개가 없는 회원에게 앱·웹에서 한 번 뜨는 창(WelcomeFlow).
 * 저장하면 서버가 처음 한 번 디스코드 '멤버 환영' 채널에 소개 카드를 올린다.
 */
import { useEffect, useState } from 'react';
import { ABOUT_DAYS, ABOUT_ROLES, ABOUT_TIMES, MBTI_LIST, ROLE_KO, cleanAbout, cleanInsta, shortNick, type About, type Api, type LookupMember, josa } from '@prism/core';
import { MemberFace } from './basics';
import { Icon } from './icons';
import { FavChampPick } from './favpick';
import { ROLE_DOT } from './champ';

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

/** 초대 링크(/i/:code)로 들어온 사람의 초대 번호 — 온보딩 추천인 칸이 미리 채운다 (v3.106) */
export const INVITE_KEY = 'prism-invite';
const savedInvite = () => { try { return localStorage.getItem(INVITE_KEY); } catch { return null; } };

type Referrer = (LookupMember & { code?: undefined }) | { code: string; id?: undefined; nick: string; skin: number | null; main: number | null };

/**
 * 추천인 (v3.106): 실제 멤버 목록에서 이름으로 찾아 골라야만 정해진다 (아무 글자나 적어 두지 못한다).
 * 초대 링크로 들어왔으면 그 초대한 사람이 미리 골라져 있다.
 */
function ReferrerPick({ api, value, onChange }: { api: Api; value: Referrer | null; onChange: (r: Referrer | null) => void }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState<LookupMember[] | null>(null);
  useEffect(() => {
    const t = q.trim();
    if (!t) { setList(null); return; }
    let on = true;
    const h = setTimeout(() => { api.get<{ members: LookupMember[] }>(`/api/members/lookup?q=${encodeURIComponent(t)}`).then((r) => { if (on) setList(r.members); }, () => { if (on) setList([]); }); }, 200);
    return () => { on = false; clearTimeout(h); };
  }, [q, api]);
  if (value) return (
    <div className="ref-picked"><MemberFace nick={value.nick} skin={value.skin} champion={value.main} size={28} /><b>{shortNick(value.nick)}</b>
      <button type="button" className="ibtn" title="다시 고르기" aria-label="다시 고르기" onClick={() => onChange(null)}><Icon name="x" /></button></div>
  );
  return (
    <div className="ref-pick">
      <input className="input" value={q} maxLength={30} placeholder="추천해 준 멤버 이름" aria-label="추천인 찾기" onChange={(e) => setQ(e.target.value)} />
      {list && <div className="ref-list" role="listbox">
        {list.length ? list.map((m) => <button key={m.id} type="button" role="option" aria-selected={false} onClick={() => { onChange(m); setQ(''); }}><MemberFace nick={m.nick} skin={m.skin} champion={m.main} size={28} /><span>{shortNick(m.nick)}</span></button>)
          : <p className="meta">맞는 멤버가 없어요. 이름을 다시 확인해 주세요.</p>}
      </div>}
    </div>
  );
}

export function AboutPick({ api, initial, onDone, verb = '저장', onChange, askReferrer }: { api: Api; initial?: About | null; onDone?: (a: About) => void; verb?: string; onChange?: (a: About | null) => void;
  /** 온보딩에서만: 추천인 칸 (가입 전 한 번, 승인 대기 중일 때만 서버가 받는다) */
  askReferrer?: boolean }) {
  const [roles, setRoles] = useState<string[]>(initial?.roles ?? []);
  const [days, setDays] = useState<string[]>(initial?.days ?? []);
  const [times, setTimes] = useState<string[]>(initial?.times ?? []);
  const [mbti, setMbti] = useState(initial?.mbti ?? '');
  const [insta, setInsta] = useState(initial?.insta ?? '');
  const [ref, setRef] = useState<Referrer | null>(null);
  // 초대 링크로 들어왔으면 초대한 사람을 미리 고른다
  useEffect(() => {
    if (!askReferrer) return;
    const code = savedInvite();
    if (!code) return;
    api.get<{ nick: string; skin: number | null; main: number | null }>(`/public/invite/${code}`).then((m) => setRef((r) => r ?? { code, ...m }), () => {});
  }, [askReferrer, api]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const instaBad = insta.trim() !== '' && !cleanInsta(insta);
  const about = cleanAbout({ roles, days, times, mbti, insta });
  // 프로필 꾸미기 안에 넣을 때(onChange): 따로 저장 단추 없이 바뀔 때마다 알린다
  const key = JSON.stringify(about);
  useEffect(() => { onChange?.(about); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const left = [!roles.length && '역할', !days.length && '요일', !times.length && '시간대', !mbti && 'MBTI'].filter(Boolean) as string[];
  const save = async () => {
    if (!about) return;
    setBusy(true); setErr('');
    try {
      await api.post('/api/me/about', { about });
      if (askReferrer && ref) {
        await api.post('/api/me/invited', ref.code ? { code: ref.code } : { member: ref.id }).catch(() => null);
        try { localStorage.removeItem(INVITE_KEY); } catch { /* 저장소 없음 */ }
      }
      onDone?.(about);
    }
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
      <section className="abt-q">
        <b>인스타그램 <small>선택</small></b>
        <label className={`abt-insta ${instaBad ? 'bad' : ''}`}><span>@</span><input className="input" value={insta} maxLength={60} placeholder="아이디" aria-label="인스타그램 아이디" autoCapitalize="off" autoCorrect="off" spellCheck={false} onChange={(e) => setInsta(e.target.value)} /></label>
        {instaBad && <p className="meta l" style={{ margin: 0 }}>영문·숫자·마침표·밑줄만 쓸 수 있어요.</p>}
      </section>
      {askReferrer && <section className="abt-q">
        <b>추천인 <small>선택 · 멤버 목록에서 찾아 골라 주세요</small></b>
        <ReferrerPick api={api} value={ref} onChange={setRef} />
      </section>}
      {err && <p className="l" style={{ margin: 0 }}>{err}</p>}
      {!onChange && <button type="button" className="btn primary lg abt-go" disabled={!about || busy || instaBad} onClick={save}>{busy ? '저장 중…' : about ? verb : `${josa(left.join(' · '), '을/를')} 골라 주세요`}</button>}
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
        {step === 'face' ? <FavChampPick api={api} verb="다음" onDone={() => setStep('about')} /> : <AboutPick api={api} verb="소개하고 시작" askReferrer onDone={() => onClose(true)} />}
      </div>
    </div>
  );
}
