import { useEffect, useState } from 'react';
import { AUGMENT, ago } from '@prism/core';
import { AugImg, Icon, MemberFace, RoleBadge, Seg, useSkins, getThemeMode, setThemeMode, type ThemeMode } from '@prism/ui';
import { bridge, type VisionState } from '../bridge';
import { diagnostics, refreshSession, setConsent, type State } from '../controller';
import { checkUpdate, installUpdate, useUpdate } from '../update';

import { VERSION } from '../version';
import { visionStatus } from '../vision';

const CONSENT = 'Riot 계정을 연결하면 아수라장 전적이 Prism에 자동으로 수집됩니다. 회원에게만 보이며, 연결을 해제하면 수집이 중단됩니다.';

export function SettingsPage({ s, onLogin }: { s: State; onLogin: () => void }) {
  const [auto, setAuto] = useState<boolean | null>(null);
  const up = useUpdate();
  const [msg, setMsg] = useState('');
  const [theme, setTheme] = useState<ThemeMode>(getThemeMode);
  const skins = useSkins();
  useEffect(() => { bridge.autostart().then(setAuto).catch(() => setAuto(null)); }, []);
  const run = async (f: () => Promise<unknown>) => { setMsg(''); try { await f(); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } };
  return (
    <div className="stack" style={{ gap: 16, maxWidth: 760 }}>
      <h1 className="h1">설정</h1>
      <VisionSettings />
      <section className="card pad">
        <div className="card-head"><h2>Prism 계정</h2></div>
        {!s.session.configured ? <p className="muted">Prism 모임 기능은 곧 열립니다.</p> : !s.me ? (
          <button type="button" className="btn primary" onClick={onLogin}><Icon name="discord" />디스코드로 로그인</button>
        ) : (
          <div className="kv">
            <div><span className="k">계정</span><span className="row" style={{ gap: 8 }}><MemberFace nick={s.me.nick} skin={s.me.skin} size={24} skins={skins} />{s.me.nick}<button type="button" className="btn ghost sm" onClick={() => run(async () => { await bridge.logout(); await refreshSession(); })}>로그아웃</button></span></div>
            <div><span className="k">디스코드 역할</span><span className="row" style={{ gap: 8 }}>{s.me.role ? <RoleBadge role={s.me.role} /> : <span className="muted">{s.me.rolesKnown ? '역할 없음' : '다시 로그인하면 불러와요'}</span>}</span></div>
            <div><span className="k">롤 계정</span><span>{s.me.riotId ?? '연결 안 됨'}{s.summoner && s.summoner.riotId !== s.me.riotId && <span className="meta"> (지금 클라이언트: {s.summoner.riotId})</span>}</span></div>
            <div><span className="k">기록 수집</span><span>{s.me.consent
              ? <span className="row" style={{ gap: 8 }}><span className="pill ok">동의함</span><button type="button" className="btn ghost sm" onClick={() => confirm('수집 동의를 철회할까요? 철회하면 판이 더 이상 올라가지 않고, 다시 동의하기 전까지 앱을 쓸 수 없습니다.') && run(() => setConsent(false))}>철회</button></span>
              : <span className="stack" style={{ gap: 8 }}><span className="muted">{CONSENT}</span><button type="button" className="btn primary" style={{ justifySelf: 'start' }} disabled={!s.summoner} onClick={() => run(() => setConsent(true))}>동의하고 {s.summoner?.riotId ?? '롤 계정'} 연결</button></span>}</span></div>
            <div><span className="k">내 판 저장</span><span className="muted">{s.upload.lastAt ? `${ago(s.upload.lastAt)} · 새로 저장 ${s.upload.stored}판` : '–'}{s.upload.error && <span className="l"> · {s.upload.error}</span>}</span></div>
            <div><span className="k">회원 대신 기록</span><span className="muted">{s.crewSync.running ? '진행 중…' : s.crewSync.lastAt ? `${ago(s.crewSync.lastAt)} · ${s.crewSync.games}판` : '–'}{s.crewSync.error && <span className="l"> · {s.crewSync.error}</span>}</span></div>
          </div>
        )}
      </section>
      {msg && <section className="card pad"><span className={msg.startsWith('복사했습니다') ? 'muted' : 'l'}>{msg}</span></section>}
      <section className="card pad">
        <div className="card-head"><h2>앱</h2></div>
        <div className="kv">
          <div><span className="k">버전</span><span className="row wrapr" style={{ gap: 8 }}>
            <span>{VERSION}</span>
            {up.info?.available
              ? <button type="button" className="btn sm primary" disabled={up.installing} onClick={installUpdate}>{up.installing ? '받는 중… 잠시 뒤 다시 켜집니다' : `${up.info.latest}으로 업데이트`}</button>
              : <><span className="meta">{up.checking ? '확인 중…' : up.info ? '최신 버전입니다' : ''}</span><button type="button" className="btn ghost sm" disabled={up.checking} onClick={checkUpdate}>업데이트 확인</button></>}
            {up.error && <span className="l">{up.error}</span>}
          </span></div>
          <div><span className="k">화면 테마</span><span><Seg value={theme} options={[['system', '시스템 설정'], ['light', '라이트'], ['dark', '다크']]} onChange={(m) => { setThemeMode(m); setTheme(m); }} /></span></div>
          <div><span className="k">윈도우 시작 시 실행</span><span>{auto === null ? '–' : <button type="button" className={`btn sm ${auto ? '' : 'primary'}`} onClick={() => run(async () => setAuto(await bridge.autostart(!auto)))}>{auto ? '끄기' : '켜기'}</button>}</span></div>
          <div><span className="k">창 닫기</span><span className="muted">창을 닫아도 트레이에서 계속 기록합니다. 끝내려면 트레이 아이콘 → 끝내기.</span></div>
          <div><span className="k">문제 알리기</span><span className="row wrapr" style={{ gap: 8 }}><button type="button" className="btn sm" onClick={() => run(async () => { await navigator.clipboard.writeText(await diagnostics(VERSION)); setMsg('복사했습니다. 디스코드에 붙여넣어 보내주세요. 다른 플레이어 이름은 지워져 있습니다.'); })}>확인용 정보 복사</button></span></div>
          <div><span className="k">게임 중 증강 보기</span><span className="muted">롤을 "테두리 없는 창 모드"로 두면 Alt+Tab 전환이 빠릅니다.</span></div>
          <div><span className="k">개인정보 처리방침</span><span className="row wrapr" style={{ gap: 8 }}><button type="button" className="btn sm" onClick={() => void bridge.openUrl('https://przm.web.app/privacy')}>보기</button></span></div>
        </div>
      </section>
    </div>
  );
}

/** 게임 중 증강 자동 인식 (v3.5) */
function VisionSettings() {
  const [v, setV] = useState<VisionState | null>(null);
  const [test, setTest] = useState<{ ids: number[]; text: string } | null>(null);
  const [err, setErr] = useState('');
  const load = () => bridge.visionGet().then(setV).catch(() => setV(null));
  useEffect(() => { void load(); const t = setInterval(load, 3000); return () => clearInterval(t); }, []);
  if (!v) return null;
  const save = async (enabled: boolean, position: 'right' | 'top') => { await bridge.visionSet(enabled, position); await load(); };
  const r = v.report;
  const st = visionStatus(v);
  return (
    <section className="card pad">
      <div className="card-head"><h2>게임 중 증강 자동 인식</h2><span className="sp" />
        <button type="button" className={`btn sm ${v.settings.enabled ? '' : 'primary'}`} onClick={() => save(!v.settings.enabled, v.settings.position)}>{v.settings.enabled ? '끄기' : '켜기'}</button></div>
      <p className="muted" style={{ marginTop: 0 }}>증강을 고르는 화면이 뜨면 앱이 알아보고, 게임 위 작은 창에 내 챔피언에게 맞는 순서를 보여줍니다. 롤을 <b>테두리 없는 창 모드</b>로 두어야 보여요.</p>
      <div className="kv">
        <div><span className="k">작은 창 위치</span><span><Seg value={v.settings.position} options={[['right', '오른쪽'], ['top', '위']]} onChange={(p) => save(v.settings.enabled, p)} /></span></div>
        <div><span className="k">상태</span><span className="stack" style={{ gap: 4 }}>
          <span className={`vs ${st.tone}`}><i />{st.text}</span>
          <span className="muted">{r.last_at ? <>마지막 인식 {ago(r.last_at)} · {r.last_ids.map((id) => AUGMENT[id]?.name ?? `#${id}`).join(', ')}</> : '아직 인식한 증강이 없습니다'}</span>
        </span></div>
        <div><span className="k">인식 시험</span><span className="stack" style={{ gap: 8 }}>
          <span className="muted">증강 고르는 화면을 <b>Win+Shift+S</b> 로 찍은 뒤 누르면, 같은 방식으로 읽어 봅니다.</span>
          <span><button type="button" className="btn sm" onClick={async () => { setErr(''); setTest(null); try { setTest(await bridge.visionTest()); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } }}>찍은 화면으로 시험</button></span>
          {err && <span className="l">{err}</span>}
          {test && <span className="stack" style={{ gap: 8 }}>
            <span className="row wrapr" style={{ gap: 8 }}>{test.ids.length ? test.ids.map((id) => <span key={id} className="pill"><AugImg id={id} size={20} />{AUGMENT[id]?.name}</span>) : <span className="l">증강을 찾지 못했습니다</span>}</span>
            <details><summary className="meta">읽은 글자 보기</summary><pre className="ocr">{test.text || '(없음)'}</pre></details>
          </span>}
        </span></div>
      </div>
    </section>
  );
}
