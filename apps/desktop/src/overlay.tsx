/**
 * 게임 위 작은 창 (v3.5). 증강 선택 카드가 보이면 Rust 가 띄우고, 고르고 나면 닫는다.
 * 클릭이 통과하므로 버튼은 없다. 내 챔피언에게 맞는 순서만 보여준다.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@prism/ui/styles.css';
import './overlay.css';
import { AUGMENT, CHAMPIONS, LEVEL_KO, rankFits } from '@prism/core';
import { AugImg, ChampImg, Gem } from '@prism/ui';
import { lastChampion, useSeenAugments } from './vision';

function Overlay() {
  const { ids } = useSeenAugments();
  if (!ids.length) return null;
  const champ = lastChampion();
  const c = champ ? CHAMPIONS[champ] : undefined;
  const fits = rankFits(c, ids.map((id) => AUGMENT[id]).filter(Boolean));
  const list = fits.length ? fits.map((f) => ({ id: f.id, f })) : ids.map((id) => ({ id, f: null }));
  return (
    <div className="ov">
      <div className="ov-head"><Gem size={16} src="/brand/prism-32.png" /><b>Prism</b>{champ && <><ChampImg id={champ} size={18} /><span>{c?.name}</span></>}</div>
      {list.map(({ id, f }, i) => (
        <div key={id} className={`ov-row ${i === 0 && f ? 'top' : ''}`}>
          <span className="ov-rk">{f ? i + 1 : '·'}</span>
          <span className={`ov-ic ${AUGMENT[id]?.rarity ?? ''}`}><AugImg id={id} size={32} /></span>
          <span className="ov-tx">
            <b>{AUGMENT[id]?.name}</b>
            {f && <span className={`lv ${f.level}`}>{LEVEL_KO[f.level]}</span>}
            {f && <small>{f.missing ?? f.reasons.slice(0, 2).join(' · ')}</small>}
          </span>
        </div>
      ))}
      {!c && <div className="ov-note">챔프 선택을 거치면 내 챔피언 기준으로 순서를 매겨요</div>}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Overlay /></StrictMode>);
