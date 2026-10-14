/**
 * 챔프 선택 도우미: 우리 팀 구성(AP/AD·앞라인·CC), 부족한 점, 대기석 추천, 큰 카드(내 챔피언 또는 미리보기).
 * 롤 클라이언트에는 읽기만 한다. 고르기·교체는 사용자가 롤에서 직접 한다.
 */
import { useState } from 'react';
import { AUGMENT, CHAMPIONS, ROLE_KO, cdragon, ccWord, comp, explainFit, fitPoints, guideOf, GAME_DATA, needsOf, pct, teamFit, tierOf, verdictOf, type ChampionProfile } from '@prism/core';
import { AugRing, AugmentLink, ChampImg, Seg, TierBadge } from '@prism/ui';
import type { ChampSelect, CrewSelect } from '../controller';
import type { Personal } from '@prism/core';

type Sort = 'mine' | 'balance' | 'crew';
const fmt = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));
const rate = (r?: { n: number; w: number }) => (r && r.n ? r.w / r.n : -1);

export function ChampSelectPanel({ cs, crew, personal }: { cs: ChampSelect; crew: CrewSelect; personal: Personal }) {
  const [sort, setSort] = useState<Sort>(() => { try { return (localStorage.getItem('prism-bench-sort') as Sort) || 'balance'; } catch { return 'balance'; } });
  const [preview, setPreview] = useState<number | null>(null);
  const base = cs.team.map((s) => CHAMPIONS[s.championId]).filter(Boolean) as ChampionProfile[];
  const c = comp(base);
  const needs = needsOf(c);
  const fit = (id: number) => teamFit(CHAMPIONS[id], needs, base);
  const mine = (id: number) => personal.champions[id];
  const crewOf = (id: number) => crew?.champions?.[id]?.crew;
  const by: Record<Sort, (a: number, b: number) => number> = {
    mine: (a, b) => (mine(b)?.n ?? 0) - (mine(a)?.n ?? 0) || rate(mine(b)) - rate(mine(a)),
    crew: (a, b) => rate(crewOf(b)) - rate(crewOf(a)),
    balance: (a, b) => fit(b).score - fit(a).score || (mine(b)?.n ?? 0) - (mine(a)?.n ?? 0),
  };
  const bench = cs.bench.slice().sort(by[sort]);
  // 나까지 넣은 5명 기준 평가. 지금 내 챔피언(또는 미리보기)으로 이미 균형이면 추천을 띄우지 않는다
  const meNow = preview ?? cs.mine;
  const team = meNow && CHAMPIONS[meNow] ? [...base, CHAMPIONS[meNow]] : base;
  const teamComp = comp(team);
  const teamNeeds = needsOf(teamComp);
  const verdict = team.length >= 5 || (meNow && base.length) ? verdictOf(teamComp, teamNeeds) : null;
  // 추천: 바꾸면 부족한 게 실제로 줄어드는 대기석 챔피언만 (가장 많이 줄어드는 것)
  const reco = teamNeeds.length
    ? bench.map((id) => ({ id, left: needsOf(comp([...base, CHAMPIONS[id]].filter(Boolean))).length, f: fit(id) }))
      .filter((x) => x.left < teamNeeds.length && !x.f.warn)
      .sort((a, b) => a.left - b.left || b.f.score - a.f.score)[0]?.id
    : undefined;
  const shown = preview && cs.bench.includes(preview) ? preview : cs.mine ?? bench[0];
  const mates = Object.fromEntries((crew?.teammates ?? []).map((m) => [m.puuid, m]));
  const setS = (s: Sort) => { setSort(s); try { localStorage.setItem('prism-bench-sort', s); } catch { /* 없음 */ } };

  return (
    <section className="card pad cs">
      <div className="card-head"><h2>챔프 선택</h2><span className="sp" /><span className="pill accent">진행 중</span></div>
      <div className="cs-team">
        <div className="cs-mates">
          {[{ championId: shown ?? 0, puuid: 'me' }, ...cs.team].map((s, i) => {
            const m = mates[s.puuid];
            return (
              <div key={i} className={`tm ${i === 0 ? 'me' : ''}`}>
                {s.championId ? <ChampImg id={s.championId} size={44} /> : <span className="champ ph" />}
                <span className={`who ${m ? 'prism' : ''}`}>{i === 0 ? (preview ? '미리보기' : '나') : m ? `${m.nick} ${pct(m.together.w, m.together.n)}` : CHAMPIONS[s.championId]?.name ?? '선택 중'}</span>
              </div>
            );
          })}
        </div>
        <div className="cs-comp">
          <div className="line"><span>팀원 {base.length}명</span><span>AP <b>{fmt(c.ap)}</b></span><span>AD <b>{fmt(c.ad)}</b></span><span>앞라인 <b>{fmt(c.front)}</b></span><span>CC <b>{ccWord(c)}</b></span></div>
          <div className="line">{verdict ? <span className={`verdict ${verdict.grade}`}>{verdict.grade === 'gold' && <i aria-hidden="true" />}{verdict.label}</span>
            : base.length ? (needs.length ? <><span className="meta">부족</span>{needs.map((n) => <span key={n} className="pill warn">{n}</span>)}</> : <span className="pill ok">밸런스 좋음</span>) : <span className="meta">팀원 챔피언이 정해지면 팀 구성이 보입니다</span>}
            {reco && <><span className="meta" style={{ marginLeft: 8 }}>바꾸면 좋아요</span><b>{CHAMPIONS[reco]?.name}</b></>}</div>
        </div>
      </div>
      <div className="cs-layout">
        {shown ? <Featured id={shown} isMine={shown === cs.mine} crew={crew} personal={personal} fitText={fit(shown)} needs={needs} isReco={reco === shown} onBack={preview ? () => setPreview(null) : undefined} /> : <div />}
        <div className="cs-bench">
          <div className="row"><span className="muted">대기석 <b>{bench.length}</b></span><span className="sp" />
            {bench.length > 1 && <Seg value={sort} options={[['balance', '팀 밸런스'], ['mine', '내가 잘하는'], ['crew', '모임 승률']]} onChange={setS} />}</div>
          <div className="seat-tray">
            {bench.map((id) => {
              const r = sort === 'crew' ? crewOf(id) : mine(id);
              const f = fit(id);
              const sub = sort === 'balance' ? (f.fills.length ? `${f.fills.join('·')} 보완` : '–') : r?.n ? `${sort === 'crew' ? '모임' : '나'} ${pct(r.w, r.n)}` : '기록 없음';
              return (
                <button key={id} type="button" className={`seat ${preview === id ? 'on' : ''}`} onClick={() => setPreview(preview === id ? null : id)} title={`${CHAMPIONS[id]?.name} · 눌러서 미리보기`}>
                  <span className="pic"><ChampImg id={id} size={60} />{reco === id && <span className="mark">추천</span>}<span className="dmg">{CHAMPIONS[id]?.damage === 'MIX' ? '혼합' : CHAMPIONS[id]?.damage}</span></span>
                  <span className="nm">{CHAMPIONS[id]?.name}</span><span className="sub">{sub}</span>
                </button>
              );
            })}
            {!bench.length && <span className="meta">대기석이 비어 있습니다</span>}
          </div>
        </div>
      </div>
    </section>
  );
}

const STYLE: [keyof ChampionProfile['style'], string][] = [['damage', '피해'], ['durability', '단단함'], ['cc', '군중 제어'], ['mobility', '기동'], ['utility', '보조']];
const RANGE_KO = { ranged: '원거리', melee: '근접' } as const;

/** 큰 카드: 내 챔피언(또는 대기석 미리보기)의 성향·내 기록·모임 기록·팀에 넣으면·어울리는 증강·내가 고른 증강 */
function Featured({ id, isMine, crew, personal, fitText, needs, isReco, onBack }: { id: number; isMine: boolean; crew: CrewSelect; personal: Personal; fitText: ReturnType<typeof teamFit>; needs: string[]; isReco: boolean; onBack?: () => void }) {
  const ch = CHAMPIONS[id];
  const g = guideOf(GAME_DATA, id);
  // 등급마다 가장 잘 맞는 증강 하나씩 (프리즘 · 골드 · 실버)
  const picks = g ? ([['prismatic', g.prismatic], ['gold', g.gold], ['silver', g.silver]] as const).map(([r, list]) => ({ r, f: list[0] })).filter((x) => x.f && x.f.level !== 'none') : [];
  const me = personal.champions[id], cc = crew?.champions?.[id];
  const myAugs = (personal.augmentsByChampion[id] ?? []).slice(0, 3);
  const top = cc?.masters?.[0];
  if (!ch) return <div />;
  return (
    <article className={`cs-tile ${isMine ? 'mine' : ''}`}>
      <img className="bg" alt="" src={cdragon(ch.splash)} />
      <div className="cs-top">
        <span className={`cs-tag ${isMine ? 'mine' : ''}`}>{isMine ? '내 챔피언' : '대기석 미리보기'}</span>
        {isReco && <span className="cs-tag reco">팀 추천</span>}
        <span className="sp" />
        {onBack && <button type="button" className="btn sm back" onClick={onBack}>내 챔피언 보기</button>}
      </div>
      <div className="body">
        <div className="cs-name">
          <h3>{ch.name}</h3>
          <div className="cs-chips">{[ROLE_KO[ch.roles[0]], ch.roles[1] && ROLE_KO[ch.roles[1]], ch.damage === 'MIX' ? 'AP·AD' : ch.damage, RANGE_KO[ch.range]].filter(Boolean).map((t) => <span key={t as string}>{t}</span>)}</div>
        </div>

        <div className="cs-style" aria-label="챔피언 성향">{STYLE.map(([k, l]) => (
          <span key={k} className="cs-st"><small>{l}</small><span className="pips">{[1, 2, 3].map((n) => <i key={n} className={ch.style[k] >= n ? 'on' : ''} />)}</span></span>
        ))}</div>

        <div className="cs-rec">
          <div><small>내 기록</small><b>{me?.n ? pct(me.w, me.n) : '–'}</b><span>{me?.n ? `${me.n}판 ${me.w}승` : '처음이에요'}</span>{me?.n ? <i className="wbar"><i style={{ width: `${(me.w / me.n) * 100}%` }} /></i> : null}</div>
          <div><small>모임</small><b>{cc?.crew?.n ? pct(cc.crew.w, cc.crew.n) : '–'}</b><span>{cc?.crew?.n ? `${cc.crew.n}판` : crew ? '기록 없음' : '회원 전용'}</span>{cc?.crew?.n ? <i className="wbar"><i style={{ width: `${(cc.crew.w / cc.crew.n) * 100}%` }} /></i> : null}</div>
          <div><small>모임 최다</small>{top ? <><b className="who">{top.nick}</b><span>{top.n}판 · {pct(top.w, top.n)}</span></> : <><b>–</b><span>아직 없어요</span></>}</div>
        </div>

        <div className="cs-sec">
          <span className="cs-h">팀에 넣으면</span>
          <div className="cs-fill">{fitText.warn ? <span className="pill warn">팀이 {fitText.warn}</span> : fitText.fills.length ? fitText.fills.map((x) => <span key={x} className="pill ok">{x} 보완</span>) : <span className="cs-muted">{needs.length ? `부족한 ${needs.join('·')}는 채우지 못해요` : '팀 구성 무난'}</span>}</div>
        </div>

        {picks.length > 0 && <div className="cs-sec">
          <span className="cs-h">어울리는 증강 <small>등급별 1순위</small></span>
          <div className="cs-augs">{picks.map(({ r, f }) => {
            const tier = tierOf(fitPoints(f));
            const e = explainFit(ch, AUGMENT[f.id]);
            return (
              <AugmentLink key={f.id} id={f.id} champion={id} className={`cs-aug ${r}`}>
                <AugRing id={f.id} size={36} />
                <span className="t"><b>{AUGMENT[f.id]?.name}</b><small>{e.why}</small></span>
                <TierBadge tier={tier} />
              </AugmentLink>
            );
          })}</div>
        </div>}

        {myAugs.length > 0 && <div className="cs-sec">
          <span className="cs-h">내가 이 챔피언으로 고른 증강</span>
          <div className="cs-mine">{myAugs.map((a) => <AugmentLink key={a.id} id={a.id} champion={id} inline className="cs-chip"><AugRing id={a.id} size={22} /><span>{AUGMENT[a.id]?.name}</span><small>{a.n}번 · {pct(a.w, a.n)}</small></AugmentLink>)}</div>
        </div>}
      </div>
    </article>
  );
}
