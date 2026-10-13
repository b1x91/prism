/**
 * 게임 위 작은 창 (v3.5). 증강 선택 카드가 보이면 Rust 가 띄우고, 고르고 나면 닫는다.
 * 클릭이 통과하므로 버튼은 없다. 내 챔피언과의 어울림 순서·티어만 보여준다 (승률 없음).
 * 1위가 비슷하면 같은 순위로 묶고 고르는 건 사용자에게 맡긴다.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@prism/ui/styles.css';
import './overlay.css';
import { AUGMENT, CHAMPIONS, rankFits, topTie } from '@prism/core';
import { AugImg, ChampImg, Gem } from '@prism/ui';
import { lastChampion, useSeenAugments } from './vision';

function Overlay() {
  const { ids } = useSeenAugments();
  if (!ids.length) return null;
  const champ = lastChampion();
  const c = champ ? CHAMPIONS[champ] : undefined;
  const fits = rankFits(c, ids.map((id) => AUGMENT[id]).filter(Boolean));
  const tie = topTie(fits);
  return (
    <div className="ov">
      <div className="ov-head"><Gem size={16} src="/brand/prism-32.png" /><b>Prism</b>{champ && <><ChampImg id={champ} size={18} /><span>{c?.name}</span></>}</div>
      {fits.length ? fits.map((f) => (
        <div key={f.id} className={`ov-row ${f.rank === 1 ? 'top' : ''}`}>
          <span className="ov-rk">{f.rank}</span>
          <span className={`ov-ic ${AUGMENT[f.id]?.rarity ?? ''}`}><AugImg id={f.id} size={32} /></span>
          <span className="ov-tx">
            <b>{AUGMENT[f.id]?.name}</b>
            {(f.missing || f.reasons.length > 0) && <small>{f.missing ?? f.reasons.slice(0, 2).join(' · ')}</small>}
          </span>
          <span className={`tier t-${f.tier}`}>{f.tier}</span>
        </div>
      )) : ids.map((id) => (
        <div key={id} className="ov-row">
          <span className="ov-rk">·</span>
          <span className={`ov-ic ${AUGMENT[id]?.rarity ?? ''}`}><AugImg id={id} size={32} /></span>
          <span className="ov-tx"><b>{AUGMENT[id]?.name}</b></span>
        </div>
      ))}
      {tie && <div className="ov-tie">{tie.length === 2 ? '두' : '세'} 증강 모두 {tie[0].tier}티어, 차이가 작아요 · 취향대로 고르세요</div>}
      {!c && <div className="ov-note">챔프 선택을 거치면 내 챔피언 기준으로 순서와 티어를 매겨요</div>}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Overlay /></StrictMode>);
