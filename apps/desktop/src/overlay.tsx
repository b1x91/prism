/**
 * 게임 위 작은 창 (v3.5). 증강 선택 카드가 보이면 Rust 가 띄우고, 고르고 나면 닫는다.
 * 클릭이 통과하므로 버튼은 없다. 내 챔피언과의 어울림 순서·티어만 보여준다 (승률 없음).
 * 1위가 비슷하면 같은 순위로 묶고 고르는 건 사용자에게 맡긴다.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@prism/ui/styles.css';
import './overlay.css';
import { AUGMENT, CHAMPIONS, matchupSummary, rankByPriority, topTie } from '@prism/core';
import { AugRing, ChampImg, Explain, Gem, GradeUp, TierBadge } from '@prism/ui';
import { lastChampion, readMatchup, useSeenAugments } from './vision';
import { lockdown } from './lockdown';

function Overlay() {
  const { ids } = useSeenAugments();
  if (!ids.length) return null;
  const champ = lastChampion();
  const c = champ ? CHAMPIONS[champ] : undefined;
  // 티어 = 챔피언과의 어울림, 순위 = 어울림 + 이번 판 조합 (승률 없음)
  const matchup = readMatchup();
  const fits = rankByPriority(c, ids.map((id) => AUGMENT[id]).filter(Boolean), matchup);
  const sits = matchupSummary(c, matchup).slice(0, 2);
  const tie = topTie(fits);
  return (
    <div className="ov">
      <div className="ov-head"><Gem size={16} src="/brand/prism-32.png" /><b>Prism</b>{champ && <><ChampImg id={champ} size={18} /><span>{c?.name}</span></>}</div>
      {sits.length > 0 && <div className="ov-sits">{sits.map((x) => <span key={x.key}>{x.label}</span>)}</div>}
      {fits.length ? fits.map((f) => (
        <div key={f.id} className={`ov-row ${f.rank === 1 ? 'top' : ''} t-${f.tier}`}>
          <span className="ov-rk">{f.tied && f.rank === 1 && <small>공동</small>}<b>{f.rank}</b><small>위</small></span>
          <AugRing id={f.id} size={44} />
          <span className="ov-tx">
            <span className="ov-nm"><b>{AUGMENT[f.id]?.name}</b><GradeUp rarity={AUGMENT[f.id].rarity} tier={f.tier} /></span>
            {f.reasons[0] ? <span className={`ov-situ ${f.bonus < 0 ? 'neg' : ''}`}>{f.lifted && f.rank === 1 ? '이번 판 1순위 · ' : ''}{f.reasons[0]}</span> : <Explain c={c!} id={f.id} tier={f.tier} />}
          </span>
          <TierBadge tier={f.tier} />
        </div>
      )) : ids.map((id) => (
        <div key={id} className="ov-row">
          <span className="ov-rk">·</span>
          <AugRing id={id} size={44} />
          <span className="ov-tx"><span className="ov-nm"><b>{AUGMENT[id]?.name}</b></span></span>
        </div>
      ))}
      {tie && <div className="ov-tie">{tie.length === 2 ? '두' : '세'} 증강 모두 {tie[0].tier}티어, 차이가 작아요 · 취향대로 고르세요</div>}
      {!c && <div className="ov-note">챔프 선택을 거치면 내 챔피언 기준으로 순서와 티어를 매겨요</div>}
    </div>
  );
}

lockdown();
createRoot(document.getElementById('root')!).render(<StrictMode><Overlay /></StrictMode>);
