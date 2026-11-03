import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { FullscreenNote, useFullscreen } from '../fullscreen';
import { ActBtn, Icon, MemberFace, RoleBadge, type ActState, Seg, Toggle, useSkins, getThemeMode, setThemeMode, type ThemeMode } from '@prism/ui';
import { api, bridge, type VisionState } from '../bridge';
import { refreshSession, relinkRiot, type State } from '../controller';
import { checkUpdate, useUpdate } from '../update';
import { UpdateButton } from '../UpdateButton';

import { VERSION } from '../version';

/** 롤 계정 줄: 지금 클라이언트 계정이 연결된 계정과 다르면 '이 계정으로 다시 연결' (부계정과 번갈아 할 때) */
function RiotRow({ s, onError }: { s: State; onError: (m: string) => void }) {
  const [st, setSt] = useState<ActState>(undefined);
  const cur = s.summoner;
  const differs = Boolean(cur && cur.riotId && cur.riotId !== s.me?.riotId);
  const inGame = ['ChampSelect', 'GameStart', 'InProgress', 'Reconnect'].includes(s.phase);
  const go = async () => {
    setSt('busy'); onError('');
    try { await relinkRiot(); setSt('done'); setTimeout(() => setSt(undefined), 1400); }
    catch (e) { setSt(undefined); onError(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <div>
      <span className="k">롤 계정</span>
      <span className="riot-row">
        <span className="riot-now">
          <b>{s.me?.riotId ?? '연결 안 됨'}</b>
          <small className="meta">{!cur ? '롤 클라이언트를 켜면 다른 계정으로 바꿀 수 있어요' : differs ? `지금 롤에 로그인된 계정: ${cur.riotId}` : '지금 롤에 로그인된 계정과 같아요'}</small>
        </span>
        {(differs || st) && !inGame && <ActBtn state={st} className="btn sm" label="이 계정으로 다시 연결" busy="연결 중" done="연결됨" onClick={go} />}
      </span>
    </div>
  );
}

export function SettingsPage({ s, onLogin }: { s: State; onLogin: () => void }) {
  const [auto, setAuto] = useState<boolean | null>(null);
  const up = useUpdate();
  const [msg, setMsg] = useState('');
  const [theme, setTheme] = useState<ThemeMode>(getThemeMode);
  const nav = useNavigate();
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
            <div><span className="k">등급</span><span className="row" style={{ gap: 8 }}>{s.me.role ? <RoleBadge role={s.me.role} /> : <span className="muted">{s.me.rolesKnown ? '등급 없음' : '다시 로그인하면 불러와요'}</span>}</span></div>
            <RiotRow s={s} onError={setMsg} />
          </div>
        )}
      </section>
      {msg && <section className="card pad"><span className="l">{msg}</span></section>}
      <section className="card pad">
        <div className="card-head"><h2>앱</h2></div>
        <div className="kv">
          <div><span className="k">버전</span><span className="row wrapr" style={{ gap: 8 }}>
            <span>{VERSION}</span>
            {up.info?.managed
              ? <span className="meta">Microsoft Store가 업데이트해요</span>
              : up.info?.available
                ? <UpdateButton />
                : <><span className="meta">{up.checking ? '확인 중…' : up.info ? '최신 버전입니다' : ''}</span><button type="button" className="btn ghost sm" disabled={up.checking} onClick={checkUpdate}>업데이트 확인</button></>}
            {up.error && <span className="l">{up.error}</span>}
          </span></div>
          <div><span className="k">화면 테마</span><span><Seg value={theme} options={[['system', '시스템 설정'], ['light', '라이트'], ['dark', '다크']]} onChange={(m) => { setThemeMode(m); setTheme(m); }} /></span></div>
          <div><span className="k">윈도우 시작 시 실행</span><span>{auto === null ? '–' : <Toggle on={auto} label="윈도우 시작 시 실행" onChange={(v) => run(async () => setAuto(await bridge.autostart(v)))} />}</span></div>
          <div><span className="k">문의하기</span><span className="row wrapr" style={{ gap: 8 }}>
            {s.me
              ? <button type="button" className="btn sm" onClick={() => nav('/inquiry')}><Icon name="mail" />문의하기</button>
              : <span className="meta">로그인하면 보낼 수 있어요</span>}
          </span></div>
          <div><span className="k">개인정보 처리방침</span><span className="row wrapr" style={{ gap: 8 }}><button type="button" className="btn sm" onClick={() => void bridge.openUrl('https://przm.web.app/privacy')}>보기</button></span></div>
        </div>
      </section>
    </div>
  );
}

/** 게임 중 증강 자동 인식 (v3.5) */
function VisionSettings() {
  const [v, setV] = useState<VisionState | null>(null);
  const load = () => bridge.visionGet().then(setV).catch(() => setV(null));
  // 전체 화면이면 같은 말을 두 번 하지 않게 아래 안내 상자만 (v3.32)
  const full = useFullscreen();
  useEffect(() => { void load(); }, []);
  if (!v) return null;
  const save = async (enabled: boolean, position: 'right' | 'top') => { await bridge.visionSet(enabled, position); await load(); };
  return (
    <section className="card pad">
      <div className="card-head"><h2>게임 중 증강 자동 인식</h2><span className="sp" />
        <Toggle on={v.settings.enabled} label="게임 중 증강 자동 인식" onChange={(on) => void save(on, v.settings.position)} /></div>
      <p className="muted" style={{ marginTop: 0 }}>증강을 고르는 화면이 뜨면 앱이 알아보고, 게임 위 작은 창에 내 챔프에게 맞는 순서를 보여줍니다. {!full && <>롤을 <b>테두리 없는 창 모드</b>로 두어야 보여요.</>}</p>
      <FullscreenNote />
      <div className="kv">
        <div style={v.settings.enabled ? undefined : { opacity: 0.5 }}><span className="k">작은 창 위치</span><span><Seg value={v.settings.position} options={[['right', '오른쪽'], ['top', '위']]} onChange={(p) => save(v.settings.enabled, p)} /></span></div>
      </div>
    </section>
  );
}
