/**
 * 이번 판 조합 막대: 우리 팀(나 제외 4명) · 상대 팀(5명)과 지금 판의 상황.
 * 앱은 챔프 선택·게임 시작 때 자동으로 채우고, 모르면 직접 넣을 수 있다. 웹 3개 비교에서도 직접 넣는다.
 */
import { useState } from 'react';
import { CHAMPIONS, matchupSummary, type Matchup } from '@prism/core';
import { ChampImg } from './basics';
import { ChampSearch } from './champ';
import { Icon } from './icons';

export function MatchupBar({ me, matchup, onChange, auto }: { me?: number | null; matchup: Matchup; onChange?: (m: Matchup) => void; auto?: boolean }) {
  const [adding, setAdding] = useState<'allies' | 'enemies' | null>(null);
  const sits = matchupSummary(me ? CHAMPIONS[me] : undefined, matchup).slice(0, 4);
  const row = (side: 'allies' | 'enemies', max: number, label: string) => {
    const ids = matchup[side];
    return (
      <div className={`mu-row ${side}`}>
        <span className="mu-k">{label}</span>
        <span className="mu-slots">
          {side === 'allies' && me && <span className="mu-c me" title={`나 · ${CHAMPIONS[me]?.name}`}><ChampImg id={me} size={32} /></span>}
          {ids.map((id, i) => (
            <button key={`${id}-${i}`} type="button" className="mu-c" disabled={!onChange} title={onChange ? `${CHAMPIONS[id]?.name} 빼기` : CHAMPIONS[id]?.name}
              onClick={() => onChange?.({ ...matchup, [side]: ids.filter((_, j) => j !== i) })}><ChampImg id={id} size={32} />{onChange && <i className="mu-x"><Icon name="x" /></i>}</button>
          ))}
          {onChange && ids.length < max && <button type="button" className={`mu-c add ${adding === side ? 'on' : ''}`} onClick={() => setAdding(adding === side ? null : side)} aria-label={`${label}에 챔프 넣기`}>+</button>}
          {!onChange && ids.length === 0 && <span className="meta">{side === 'enemies' ? '게임이 시작되면 채워져요' : '챔프 선택 때 채워져요'}</span>}
        </span>
      </div>
    );
  };
  return (
    <section className="card mu">
      <div className="mu-head">
        <b>이번 판 조합</b>
        {auto && <span className="mu-auto">자동</span>}
        <span className="sp" />
        {sits.length ? <span className="mu-sits">{sits.map((s) => <span key={s.key} className={`mu-sit ${s.key.startsWith('need') ? 'ally' : 'enemy'}`}>{s.label}</span>)}</span>
          : <span className="meta">{matchup.enemies.length >= 3 || matchup.allies.length >= 3 ? '특별히 기울어진 조합은 아니에요' : '조합을 넣으면 지금 판에 더 중요한 증강을 위로 올려요'}</span>}
      </div>
      {row('allies', 4, '우리 팀')}
      {row('enemies', 5, '상대 팀')}
      {adding && onChange && <div className="mu-add"><ChampSearch autoFocus placeholder={adding === 'enemies' ? '상대 챔프 (예: 말파이트, ㅁㅍㅇㅌ)' : '우리 팀 챔프'} onPick={(id) => {
        const list = matchup[adding];
        const next = { ...matchup, [adding]: [...list, id].slice(0, adding === 'enemies' ? 5 : 4) };
        onChange(next);
        if (next[adding].length >= (adding === 'enemies' ? 5 : 4)) setAdding(null);
      }} /></div>}
    </section>
  );
}
