/**
 * 첫 화면 (v3.7, v3.41, v3.47): 디스코드 로그인 → 롤 클라이언트 → 최애 챔프(프로필 사진) → 나를 소개해요 → 수집 동의를 마쳐야 앱을 쓸 수 있다.
 * 동의 전에는 서버로 아무것도 보내지 않고, 게임 위 작은 창도 켜지지 않는다.
 */
import { useState } from 'react';
import { DEFAULT_LINKS, shortNick } from '@prism/core';
import { AboutPick, FavChampPick, Gem, Icon } from '@prism/ui';
import { CHAMPIONS } from '@prism/core';
import { api, bridge } from '../bridge';
import { refreshSession, setConsent, type State } from '../controller';
import { VERSION } from '../version';

const CONSENT = 'Riot 계정을 연결하면 아수라장 전적이 Prism에 자동으로 수집됩니다. 회원에게만 보이며, 연결을 해제하면 수집이 중단됩니다.';

export function Onboarding({ s, onLogin }: { s: State; onLogin: () => Promise<void> }) {
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [picked, setPicked] = useState<number | null>(null);
  const [aboutDone, setAboutDone] = useState(false);
  const run = async (f: () => Promise<unknown>) => { setBusy(true); setErr(''); try { await f(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } };

  if (!s.sessionChecked) return <div className="onb"><div className="onb-card center"><Gem size={56} float src="/brand/prism-256.png" /></div></div>;

  const logged = Boolean(s.me), client = Boolean(s.summoner);
  // 대표 스킨이 이미 있으면(예전 회원) 최애 챔프 단계는 지나간 것으로
  const hasFace = Boolean(s.me?.skin) || picked !== null;
  const hasAbout = Boolean(s.me?.about) || aboutDone;
  const step = !logged ? 1 : !client ? 2 : !hasFace ? 3 : !hasAbout ? 4 : 5;
  const face = picked ?? (s.me?.skin ? Math.floor(s.me.skin / 1000) : null);
  return (
    <div className="onb">
      <div className="onb-card">
        <div className="onb-head"><Gem size={44} float src="/brand/prism-256.png" /><div><h1>Prism 시작하기</h1><p className="muted">다섯 단계만 마치면 바로 쓸 수 있어요.</p></div></div>

        {!s.session.configured ? <p className="l">Prism 서버 주소가 없는 설치 파일입니다. 최신 설치 파일을 받아주세요.</p> : <>
          <Step n={1} done={logged} active={step === 1} title="디스코드로 로그인" sub={logged ? `${shortNick(s.me!.nick)} 님` : 'Prism 디스코드 서버 회원만 들어올 수 있어요'}>
            {!logged && <div className="row wrapr" style={{ gap: 8 }}>
              <button type="button" className="btn primary" disabled={busy} onClick={() => run(onLogin)}><Icon name="discord" />디스코드로 로그인</button>
              <button type="button" className="btn ghost" onClick={() => bridge.openUrl(DEFAULT_LINKS.discord!)}>아직 서버에 없다면</button>
            </div>}
          </Step>
          <Step n={2} done={client} active={step === 2} title="롤 클라이언트 켜기" sub={client ? s.summoner!.riotId : '켜 두면 자동으로 알아봐요'}>
            {!client && logged && <div className="row" style={{ gap: 8 }}><span className="pulse" /><span className="muted">롤 클라이언트를 기다리는 중…</span></div>}
          </Step>
          <Step n={3} done={hasFace} active={step === 3} title="최애 챔프 고르기" sub={hasFace && face ? `${CHAMPIONS[face]?.name ?? ''} — 프로필 사진이 됐어요` : '가장 좋아하는 챔프가 내 프로필 사진이 돼요'}>
            {step === 3 && <FavChampPick api={api} verb="계속" onDone={(id) => { setPicked(id); void refreshSession(); }} />}
          </Step>
          <Step n={4} done={hasAbout} active={step === 4} title="나를 소개해요" sub={hasAbout ? '멤버 환영 채널에 소개 카드가 올라갔어요' : '좋아하는 역할·자주 하는 요일과 시간대·MBTI'}>
            {step === 4 && <AboutPick api={api} verb="계속" onDone={() => { setAboutDone(true); void refreshSession(); }} />}
          </Step>
          <Step n={5} done={false} active={step === 5} title="기록 수집 동의" sub="동의해야 Prism 앱을 쓸 수 있어요">
            {step === 5 && <div className="stack" style={{ gap: 12 }}>
              <p className="consent-text">{CONSENT}</p>
              <label className="check"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />위 내용을 읽었고 동의합니다</label>
              <button type="button" className="btn primary lg" disabled={!agree || busy} onClick={() => run(() => setConsent(true))}>동의하고 시작</button>
            </div>}
          </Step>
        </>}

        {s.sessionError && <p className="l">{s.sessionError} <button type="button" className="btn ghost sm" onClick={() => run(refreshSession)}>다시 시도</button></p>}
        {err && <p className="l">{err}</p>}
        <div className="onb-foot meta">v{VERSION}{logged && <> · <button type="button" className="onb-link" onClick={() => run(async () => { await bridge.logout(); await refreshSession(); })}>다른 계정으로</button></>}</div>
      </div>
    </div>
  );
}

function Step({ n, done, active, title, sub, children }: { n: number; done: boolean; active: boolean; title: string; sub: string; children?: React.ReactNode }) {
  return (
    <section className={`onb-step ${done ? 'done' : ''} ${active ? 'active' : ''}`}>
      <span className="num">{done ? <Icon name="check" /> : n}</span>
      <div className="stack" style={{ gap: 8 }}>
        <div><b>{title}</b><div className="muted">{sub}</div></div>
        {children}
      </div>
    </section>
  );
}
