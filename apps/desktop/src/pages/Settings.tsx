import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { FullscreenNote, useFullscreen } from '../fullscreen';
import { ActBtn, Icon, MemberFace, RoleBadge, guestHue, type ActState, Seg, Toggle, useSkins, getThemeMode, setThemeMode, type ThemeMode } from '@prism/ui';
import { api, bridge, type VisionState } from '../bridge';
import { addRiotAccount, refreshSession, removeRiotAccount, setMainRiotAccount, type State } from '../controller';
import { checkUpdate, useUpdateQuiet as useUpdate } from '../update';
import { UpdateButton } from '../UpdateButton';

import { VERSION } from '../version';

/**
 * 롤 계정 (v3.155, 시안 C '고르는 목록'): 한 묶음의 목록. 줄을 누르면 그 계정이 메인(동그라미),
 * 빼기(×)는 마우스를 올렸을 때만 보이고 한 번 더 확인. 지금 롤에 로그인된 새 계정은 맨 아래 파란 줄로 추가.
 * 어느 계정으로 해도 판이 내 기록으로 모이고, 이름은 메인 계정을 따른다
 */
function RiotRow({ s, onError }: { s: State; onError: (m: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [st, setSt] = useState<Record<string, ActState>>({});
  const me = s.me;
  const list = me?.accounts ?? (me?.riotId ? [{ puuid: '', riotId: me.riotId, main: true }] : []);
  const max = me?.accountMax ?? 5;
  const cur = s.summoner;
  const known = Boolean(cur && list.some((a) => a.puuid === cur.puuid));
  const locked = ['ChampSelect', 'GameStart', 'InProgress', 'Reconnect'].includes(s.phase);
  const run = async (key: string, f: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(key); onError('');
    try { await f(); } catch (e) { onError(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };
  const add = (key: 'add' | 'addMain', main: boolean) => {
    setSt((x) => ({ ...x, [key]: 'busy' })); onError('');
    addRiotAccount(main).then(() => setSt((x) => ({ ...x, [key]: undefined })))
      .catch((e) => { setSt((x) => ({ ...x, [key]: undefined })); onError(e instanceof Error ? e.message : String(e)); });
  };
  const nm = (riotId: string | null) => { const [n, t] = (riotId ?? '?').split('#'); return <span className="acc-nm"><b>{n}</b>{t && <small>#{t}</small>}</span>; };
  const av = (riotId: string | null) => { const n = (riotId ?? '?').split('#')[0]; return <span className="acc-av" aria-hidden="true" style={{ ['--gh' as string]: guestHue(n) }}>{[...n][0]}</span>; };
  return (
    <div className="acc-wrap">
      <span className="k">롤 계정<small className="meta acc-count">{list.length} / {max}</small></span>
      <div className="acc-box">
        <div className="acc-group" role="radiogroup" aria-label="메인 계정">
          {list.length === 0 && <div className="acc-row off">연결 안 됨</div>}
          {list.map((a) => {
            const here = cur?.puuid === a.puuid;
            const canMain = !a.main && Boolean(a.puuid) && !locked;
            return (
              <div key={a.puuid || a.riotId} className={`acc-row${a.main ? ' main' : ''}${canMain ? ' pick' : ''}${busy === `m:${a.puuid}` ? ' busy' : ''}`}
                role="radio" aria-checked={a.main} tabIndex={canMain ? 0 : -1}
                onClick={() => canMain && run(`m:${a.puuid}`, () => setMainRiotAccount(a.puuid))}
                onKeyDown={(e) => { if (canMain && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); void run(`m:${a.puuid}`, () => setMainRiotAccount(a.puuid)); } }}>
                <span className="acc-radio" aria-hidden="true" />
                {av(a.riotId)}
                <span className="acc-body">{nm(a.riotId)}
                  <span className="acc-meta">{a.main ? <span className="m">메인 · Prism 이름</span> : <span>부계정{a.since ? ` · ${new Date(a.since).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}부터` : ''}</span>}{here && <span className="acc-live">지금 로그인</span>}</span>
                </span>
                {list.length > 1 && a.puuid && !locked && (confirm === a.puuid
                  ? <span className="acc-confirm" onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="btn ghost sm" onClick={() => setConfirm(null)}>취소</button>
                      <button type="button" className="btn sm danger" disabled={Boolean(busy)} onClick={() => { setConfirm(null); void run(`r:${a.puuid}`, () => removeRiotAccount(a.puuid)); }}>빼기</button>
                    </span>
                  : <button type="button" className="acc-x" aria-label={`${a.riotId ?? ''} 빼기`} title="빼기" onClick={(e) => { e.stopPropagation(); setConfirm(a.puuid); }}>
                      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                    </button>)}
              </div>
            );
          })}
          {cur && !known && !locked && (list.length < max ? (
            <div className="acc-row add">
              <span className="acc-plus" aria-hidden="true"><svg width="10" height="10" viewBox="0 0 10 10"><path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg></span>
              {av(cur.riotId)}
              <span className="acc-body">{nm(cur.riotId)}<span className="acc-meta"><span className="acc-live">지금 로그인</span><span>추가한 날부터 기록돼요</span></span></span>
              <span className="acc-acts">
                <ActBtn state={st.add} className="btn sm" label="추가" busy="추가 중" done="추가됨" onClick={() => add('add', false)} />
                <ActBtn state={st.addMain} className="btn primary sm" label="메인으로 추가" busy="추가 중" done="추가됨" onClick={() => add('addMain', true)} />
              </span>
            </div>
          ) : <div className="acc-row off">{max}개까지 연결할 수 있어요. 하나를 빼면 지금 계정을 더할 수 있어요.</div>)}
        </div>
        <p className="acc-foot">{list.length > 1 ? '줄을 누르면 그 계정이 메인이 돼요. ' : ''}어느 계정으로 해도 판이 내 기록으로 모여요 (부계정은 추가한 날부터). 빼도 이미 모인 판은 남아요.{!cur ? ' 다른 계정을 더하려면 그 계정으로 롤에 로그인하세요.' : ''}</p>
      </div>
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
