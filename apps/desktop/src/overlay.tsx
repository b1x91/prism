/**
 * 게임 위 작은 창 (v3.5). 증강 선택 카드가 보이면 Rust 가 띄우고, 고르고 나면 닫는다.
 * 클릭이 통과한다 — 오른쪽 위 닫기 단추 자리만 마우스가 올라오면 Rust 가 클릭을 받게 바꾼다 (v3.132). 내 챔피언과의 어울림 순서·티어만 보여준다 (승률 없음).
 * 1위가 비슷하면 같은 순위로 묶고 고르는 건 사용자에게 맡긴다.
 */
import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@prism/ui/styles.css';
import './overlay.css';
import { AUGMENT, CHAMPIONS, ITEM, adviseItems, liveMatchup, loadItemDetail, matchupSummary, parseLive, rankByPriority, topTie, type ItemDetail, type LiveGame } from '@prism/core';
import { AugRing, ChampImg, Explain, Gem, GradeUp, ItemIcon, TierBadge, useFavs } from '@prism/ui';
import { lastChampion, readMatchup, useSeenAugments } from './vision';
import { lockdown } from './lockdown';
import { bridge } from './bridge';

const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** 밀려 들어오기·나가기: 오른쪽이면 오른쪽 끝에서, 위면 위에서. Rust 가 숨기기 전에 'overlay-out' 을 보낸다 */
function useSlide(at: number) {
  const [pos, setPos] = useState<'right' | 'top'>('right');
  const [out, setOut] = useState(false);
  const [k, setK] = useState(0);
  const last = useRef(at);
  useEffect(() => {
    if (!inTauri) return;
    let off: (() => void) | undefined;
    import('@tauri-apps/api/event').then(({ listen }) => listen('overlay-out', () => setOut(true)).then((f) => { off = f; }));
    return () => off?.();
  }, []);
  // 새로 인식되면(숨겼다 다시 뜨면) 다시 밀려 들어온다
  useEffect(() => {
    if (at === last.current) return;
    last.current = at;
    bridge.visionGet().then((v) => setPos(v.settings.position)).catch(() => {});
    setOut((o) => { if (o) setK((n) => n + 1); return false; });
  }, [at]);
  return { pos, out, k };
}

/** 작은 창이 떠 있는 동안만 3초마다 라이브 클라이언트 데이터를 읽는다 (현재 아이템·점수, v3.46) */
function useLive(active: boolean) {
  const [g, setG] = useState<LiveGame | null>(null);
  const [detail, setDetail] = useState<Record<number, ItemDetail> | null>(null);
  useEffect(() => { loadItemDetail().then(setDetail).catch(() => {}); }, []);
  useEffect(() => {
    if (!active) return;
    let on = true;
    const read = () => bridge.liveGame().then((r) => { if (on) setG(parseLive(r)); }).catch(() => {});
    read();
    const t = setInterval(read, 3000);
    return () => { on = false; clearInterval(t); };
  }, [active]);
  return { g, detail };
}

function Overlay() {
  const { ids, at } = useSeenAugments();
  const live = useLive(ids.length > 0);
  const slide = useSlide(at);
  const favs = useFavs(); // 내 증강 (앱 창에서 표시한 것, 같은 기기 저장소)
  if (!ids.length) return null;
  // 게임 중 데이터가 있으면 그것이 가장 정확하다 (내 챔프·양 팀 조합)
  const lm = liveMatchup(live.g);
  const champ = lm?.me ?? lastChampion();
  const c = champ ? CHAMPIONS[champ] : undefined;
  // 티어 = 챔피언과의 어울림, 순위 = 어울림 + 이번 판 조합 (승률 없음)
  const matchup = lm ?? readMatchup();
  const advice = adviseItems(live.g, live.detail);
  const fits = rankByPriority(c, ids.map((id) => AUGMENT[id]).filter(Boolean), matchup);
  const sits = matchupSummary(c, matchup).slice(0, 2);
  const tie = topTie(fits);
  return (
    <div key={slide.k} className={`ov at-${slide.pos} ${slide.out ? 'out' : ''}`}>
      <div className="ov-head"><Gem size={16} src="/brand/prism-32.png" /><b>Prism</b>{champ && <><ChampImg id={champ} size={18} /><span>{c?.name}</span></>}<button className="ov-x" type="button" title="닫기 · 이번 고르기 동안 숨겨요" aria-label="닫기" onClick={() => { bridge.overlayClose().catch(() => {}); }}><svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></button></div>
      {sits.length > 0 && <div className="ov-sits">{sits.map((x) => <span key={x.key}>{x.label}</span>)}</div>}
      {fits.length ? fits.map((f) => (
        <div key={f.id} className={`ov-row ${f.rank === 1 ? 'top' : ''} t-${f.tier}`}>
          <span className="ov-rk">{f.tied && f.rank === 1 && <small>공동</small>}<b>{f.rank}</b><small>위</small></span>
          <AugRing id={f.id} size={44} />
          <span className="ov-tx">
            <span className="ov-nm">{favs.augs.includes(f.id) && <i className="ov-fav" title="내 증강">♥</i>}<b>{AUGMENT[f.id]?.name}</b><GradeUp rarity={AUGMENT[f.id].rarity} tier={f.tier} /></span>
            {f.reasons[0] ? <span className={`ov-situ ${f.bonus < 0 ? 'neg' : ''}`}>{f.lifted && f.rank === 1 ? '이번 판 1순위 · ' : ''}{f.reasons[0]}</span> : <Explain c={c!} id={f.id} tier={f.tier} />}
          </span>
          <TierBadge tier={f.tier} />
        </div>
      )) : ids.map((id) => (
        <div key={id} className="ov-row">
          <span className="ov-rk">·</span>
          <AugRing id={id} size={44} />
          <span className="ov-tx"><span className="ov-nm">{favs.augs.includes(id) && <i className="ov-fav" title="내 증강">♥</i>}<b>{AUGMENT[id]?.name}</b></span></span>
        </div>
      ))}
      {tie && <div className="ov-tie">{tie.length === 2 ? '두' : '세'} 증강 모두 {tie[0].tier}티어, 차이가 작아요 · 취향대로 고르세요</div>}
      {advice.length > 0 && (
        <div className="ov-items">
          <span className="ov-items-h">지금 고려할 아이템</span>
          {advice.map((a) => (
            <div key={a.key} className="ov-item">
              <ItemIcon id={a.items[0]} size={28} />
              <span className="ov-tx"><b>{a.title}</b><small>{a.why} · {a.items.map((id) => ITEM[id]?.name).filter(Boolean).join(' / ')}</small></span>
            </div>
          ))}
        </div>
      )}
      {!c && <div className="ov-note">챔프 선택을 거치면 내 챔프 기준으로 순서와 티어를 매겨요</div>}
    </div>
  );
}

lockdown();
// 안전장치: 창이 기준 폭(420)보다 좁게 잡혀도 글자가 두세 자씩 꺾이지 않게 화면 전체를 창 폭에 맞춰 줄인다
const BASE_W = 420;
const fit = () => { document.documentElement.style.zoom = String(Math.min(1, innerWidth / BASE_W)); };
fit();
addEventListener('resize', fit);

createRoot(document.getElementById('root')!).render(<StrictMode><Overlay /></StrictMode>);
