/**
 * 최애 챔프 고르기 (v3.41). 새 회원이 처음 들어올 때 한 번: 고른 챔프의 기본 스킨이 프로필 사진이 되고 '내 챔프'에도 담긴다.
 * 앱은 첫 화면(Onboarding)의 한 단계로, 웹은 처음 로그인했을 때 한 번 뜨는 창(WelcomePick)으로 같은 화면을 쓴다.
 */
import { SplashSwap, useSplashHold } from './splash';
import { useMemo, useState } from 'react';
import { CHAMPIONS, CHAMPION_LIST, ROLE_KO, baseSkin, cdragon, matchName, type Api } from '@prism/core';
import { ChampImg } from './basics';
import { Icon } from './icons';

/** 받침에 따라 '로'/'으로' (ㄹ 받침은 '로') */
const ro = (w: string) => { const c = w.charCodeAt(w.length - 1) - 0xac00; if (c < 0 || c > 11171) return '로'; const t = c % 28; return t === 0 || t === 8 ? '로' : '으로'; };

export function FavChampPick({ api, onDone, verb = '시작' }: { api: Api; onDone: (id: number) => void; verb?: string }) {
  const [q, setQ] = useState('');
  const [pick, setPick] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const list = useMemo(() => CHAMPION_LIST.filter((c) => matchName(c.name, q)), [q]);
  // 고른 챔프의 큰 그림이 준비되면 이름·그림을 한 번에 (v3.122)
  const hold = useSplashHold(pick, pick);
  const shownPick = hold.value;
  const c = shownPick ? CHAMPIONS[shownPick] : null;
  const save = async () => {
    if (!pick) return;
    setBusy(true); setErr('');
    try {
      await api.post('/api/me/profile', { skin: baseSkin(pick) });
      await api.post('/api/me/favs', { kind: 'champ', id: pick, on: true }).catch(() => {});
      onDone(pick);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  return (
    <div className="fpk">
      <div className={`fpk-stage ${c ? 'on' : ''} ${hold.pending ? 'swapping' : ''}`}>
        {c ? <>
          <SplashSwap className="fpk-art" src={cdragon(c.splash)} />
          <span className="fpk-face" key={`f${shownPick}`}><ChampImg id={shownPick!} size={56} /></span>
          <span className="fpk-txt bn-in" key={`t${shownPick}`}><b>{c.name}</b><small>{ROLE_KO[c.roles[0]]} · 이 챔프가 내 프로필 사진이 돼요</small></span>
        </> : <span className="fpk-empty"><Icon name="star" />가장 좋아하는 챔프를 골라 주세요</span>}
      </div>
      <label className="fpk-q"><Icon name="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="챔프 이름 (예: 아리, ㅇㄹ)" /></label>
      <div className="fpk-grid" role="listbox" aria-label="챔프">
        {list.map((x) => (
          <button key={x.id} type="button" role="option" aria-selected={pick === x.id} className={`fpk-c ${pick === x.id ? 'on' : ''}`} onClick={() => setPick(x.id)} title={x.name}>
            <ChampImg id={x.id} size={48} /><span>{x.name}</span>
          </button>
        ))}
      </div>
      {err && <p className="l" style={{ margin: 0 }}>{err}</p>}
      <button type="button" className="btn primary lg fpk-go" disabled={!pick || busy} onClick={save}>{busy ? '저장 중…' : pick && CHAMPIONS[pick] ? `${CHAMPIONS[pick].name}${ro(CHAMPIONS[pick].name)} ${verb}` : `챔프를 고르면 ${verb}`}</button>
    </div>
  );
}

/** 웹: 처음 로그인한 회원(대표 스킨이 없는)에게 한 번 */
export function WelcomePick({ api, nick, onClose }: { api: Api; nick: string; onClose: (picked: boolean) => void }) {
  return (
    <div className="md-wrap" role="dialog" aria-modal="true" aria-label="최애 챔프 고르기">
      <button type="button" className="md-scrim" aria-label="나중에" onClick={() => onClose(false)} />
      <div className="fpk-modal">
        <header className="fpk-head"><div><h2>{nick.split('#')[0]} 님, 반가워요!</h2><p className="meta">최애 챔프 하나로 시작해요. 프로필은 나중에 언제든 바꿀 수 있어요.</p></div>
          <button type="button" className="btn ghost sm" onClick={() => onClose(false)}>나중에</button></header>
        <FavChampPick api={api} onDone={() => onClose(true)} />
      </div>
    </div>
  );
}
