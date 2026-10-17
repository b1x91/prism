/**
 * 이번 판 분석 카드 (v3.71): 조합으로 내 역할 · 주의할 상대 · 자리 잡기 · 고려할 아이템.
 * 계산은 공용 gamePlanOf (규칙). 앱은 게임 중 자동으로 채운 조합, 웹은 직접 넣은 조합으로.
 */
import { CHAMPIONS, gamePlanOf, type Matchup } from '@prism/core';
import { ChampImg } from './basics';
import { ItemIcon } from './game';

export function GamePlanCard({ me, matchup }: { me?: number | null; matchup: Matchup }) {
  const p = gamePlanOf(me, matchup);
  if (!p) return null;
  return (
    <section className="card gp">
      <div className="gp-col">
        <span className="gp-k">이번 판 내 역할</span>
        <b className="gp-role">{p.role.title}</b>
        {p.role.text && <p className="gp-t">{p.role.text}</p>}
        {p.role.note && <p className="gp-note">{p.role.note}</p>}
        {p.threats.length > 0 && (
          <div className="gp-threats">
            <span className="gp-k">주의할 상대</span>
            {p.threats.map((t) => (
              <span key={t.id} className="gp-threat"><ChampImg id={t.id} size={28} /><b>{CHAMPIONS[t.id]?.name}</b><i>{t.tag}</i></span>
            ))}
          </div>
        )}
      </div>
      <div className="gp-col">
        <span className="gp-k">자리 잡기</span>
        {p.position.length ? p.position.map((x) => (
          <div key={x.title} className="gp-tip"><b>{x.title}</b><p className="gp-t">{x.text}</p></div>
        )) : <p className="gp-t muted">특별히 조심할 자리는 없어요. 아군과 같이 움직여요</p>}
      </div>
      <div className="gp-col">
        <span className="gp-k">고려할 아이템</span>
        {p.items.length ? p.items.map((x) => (
          <div key={x.title} className="gp-item">
            <span className="gp-ics">{x.items.map((id) => <ItemIcon key={id} id={id} size={32} />)}</span>
            <span><b>{x.title}</b><p className="gp-t">{x.why}</p></span>
          </div>
        )) : <p className="gp-t muted">조합으로 보면 평소 빌드 그대로 괜찮아요</p>}
      </div>
    </section>
  );
}
