import { useEffect, useState } from 'react';
import { ago } from '@prism/core';
import { Icon, Initial } from '@prism/ui';
import { bridge } from '../bridge';
import { refreshSession, setConsent, type State } from '../controller';

const CONSENT = 'Riot 계정을 연결하면 아수라장 전적이 Prism에 자동으로 수집됩니다. 회원에게만 보이며, 연결을 해제하면 수집이 중단됩니다.';

export function SettingsPage({ s, onLogin }: { s: State; onLogin: () => void }) {
  const [auto, setAuto] = useState<boolean | null>(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { bridge.autostart().then(setAuto).catch(() => setAuto(null)); }, []);
  const run = async (f: () => Promise<unknown>) => { setMsg(''); try { await f(); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } };
  return (
    <div className="stack" style={{ gap: 16, maxWidth: 760 }}>
      <h1 className="h1">설정</h1>
      <section className="card pad">
        <div className="card-head"><h2>Prism 계정</h2></div>
        {!s.session.configured ? <p className="muted">Prism 모임 기능은 곧 열립니다.</p> : !s.me ? (
          <button type="button" className="btn primary" onClick={onLogin}><Icon name="discord" />디스코드로 로그인</button>
        ) : (
          <div className="kv">
            <div><span className="k">계정</span><span className="row" style={{ gap: 8 }}><Initial nick={s.me.nick} size={24} />{s.me.nick}<button type="button" className="btn ghost sm" onClick={() => run(async () => { await bridge.logout(); await refreshSession(); })}>로그아웃</button></span></div>
            <div><span className="k">롤 계정</span><span>{s.me.riotId ?? '연결 안 됨'}{s.summoner && s.summoner.riotId !== s.me.riotId && <span className="meta"> (지금 클라이언트: {s.summoner.riotId})</span>}</span></div>
            <div><span className="k">기록 수집</span><span>{s.me.consent
              ? <span className="row" style={{ gap: 8 }}><span className="pill ok">동의함</span><button type="button" className="btn ghost sm" onClick={() => confirm('수집 동의를 철회할까요? 이후 판은 올라가지 않습니다.') && run(() => setConsent(false))}>철회</button></span>
              : <span className="stack" style={{ gap: 8 }}><span className="muted">{CONSENT}</span><button type="button" className="btn primary" style={{ justifySelf: 'start' }} disabled={!s.summoner} onClick={() => run(() => setConsent(true))}>동의하고 {s.summoner?.riotId ?? '롤 계정'} 연결</button></span>}</span></div>
            <div><span className="k">내 판 저장</span><span className="muted">{s.upload.lastAt ? `${ago(s.upload.lastAt)} · 새로 저장 ${s.upload.stored}판` : '–'}{s.upload.error && <span className="l"> · {s.upload.error}</span>}</span></div>
            <div><span className="k">회원 대신 기록</span><span className="muted">{s.crewSync.running ? '진행 중…' : s.crewSync.lastAt ? `${ago(s.crewSync.lastAt)} · ${s.crewSync.games}판` : '–'}{s.crewSync.error && <span className="l"> · {s.crewSync.error}</span>}</span></div>
          </div>
        )}
        {msg && <p className="l" style={{ marginBottom: 0 }}>{msg}</p>}
      </section>
      <section className="card pad">
        <div className="card-head"><h2>앱</h2></div>
        <div className="kv">
          <div><span className="k">윈도우 시작 시 실행</span><span>{auto === null ? '–' : <button type="button" className={`btn sm ${auto ? '' : 'primary'}`} onClick={() => run(async () => setAuto(await bridge.autostart(!auto)))}>{auto ? '끄기' : '켜기'}</button>}</span></div>
          <div><span className="k">창 닫기</span><span className="muted">창을 닫아도 트레이에서 계속 기록합니다. 끝내려면 트레이 아이콘 → 끝내기.</span></div>
          <div><span className="k">게임 중 증강 보기</span><span className="muted">롤을 "테두리 없는 창 모드"로 두면 Alt+Tab 전환이 빠릅니다.</span></div>
        </div>
      </section>
    </div>
  );
}
