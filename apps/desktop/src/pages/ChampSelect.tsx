/**
 * 챔프 선택 도우미: 우리 팀 구성(AP/AD·앞라인·CC), 부족한 점, 대기석 추천, 큰 카드(내 챔피언 또는 미리보기).
 * 롤 클라이언트에는 읽기만 한다. 고르기·교체는 사용자가 롤에서 직접 한다.
 */
import { useState } from 'react';
import { CHAMPIONS, ROLE_KO, cdragon, ccWord, comp, guideOf, GAME_DATA, needsOf, pct, teamFit, type ChampionProfile } from '@prism/core';
import { AugImg, ChampImg, Gem, Seg } from '@prism/ui';
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
  const reco = needs.length ? bench.map((id) => ({ id, f: fit(id) })).filter((x) => x.f.fills.length && !x.f.warn).sort((a, b) => b.f.score - a.f.score)[0]?.id : undefined;
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
          <div className="line">{base.length ? (needs.length ? <><span className="meta">부족</span>{needs.map((n) => <span key={n} className="pill warn">{n}</span>)}</> : <span className="pill ok">팀 구성 균형 좋음</span>) : <span className="meta">팀원 챔피언이 정해지면 팀 구성이 보입니다</span>}
            {reco && <><span className="meta" style={{ marginLeft: 8 }}>추천</span><b>{CHAMPIONS[reco]?.name}</b></>}</div>
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

function Featured({ id, isMine, crew, personal, fitText, needs, isReco, onBack }: { id: number; isMine: boolean; crew: CrewSelect; personal: Personal; fitText: ReturnType<typeof teamFit>; needs: string[]; isReco: boolean; onBack?: () => void }) {
  const ch = CHAMPIONS[id];
  const g = guideOf(GAME_DATA, id);
  const best = g ? [...g.prismatic.slice(0, 2), ...g.gold.slice(0, 2)].filter((f) => f.level === 'best').slice(0, 3) : [];
  const me = personal.champions[id], cc = crew?.champions?.[id];
  return (
    <article className={`cs-tile ${isMine ? 'mine' : ''}`}>
      <img className="bg" alt="" src={cdragon(ch?.splash)} />
      {isReco && <span className="badge">팀 추천</span>}
      {onBack && <button type="button" className="btn sm back" onClick={onBack}>내 챔피언 보기</button>}
      <div className="body">
        <div className="row" style={{ gap: 8 }}><h3>{ch?.name}</h3><span className="pill dark">{isMine ? '내 챔피언' : '대기석'}</span></div>
        <div className="row" style={{ gap: 6 }}>{[ROLE_KO[ch?.roles[0] ?? ''], ch?.damage === 'MIX' ? 'AP·AD' : ch?.damage].filter(Boolean).map((t) => <span key={t} className="pill dark">{t}</span>)}</div>
        <div className="stats2">
          <div><span className="k">나</span><b>{me?.n ? pct(me.w, me.n) : '–'}</b><span className="k">{me?.n ? `${me.n}판` : '기록 없음'}</span></div>
          <div><span className="k">모임</span><b>{cc?.crew?.n ? pct(cc.crew.w, cc.crew.n) : '–'}</b><span className="k">{cc?.crew?.n ? `${cc.crew.n}판` : crew ? '기록 없음' : '회원 전용'}</span></div>
        </div>
        <div className="k">팀에 넣으면</div>
        <div className="row wrapr" style={{ gap: 6 }}>{fitText.warn ? <span className="pill warn">팀이 {fitText.warn}</span> : fitText.fills.length ? fitText.fills.map((x) => <span key={x} className="pill ok">{x} 보완</span>) : <span className="k">{needs.length ? `부족한 ${needs.join('·')} 보완 안 됨` : '팀 구성 무난'}</span>}</div>
        {best.length > 0 && <><div className="k">어울리는 증강</div><div className="row wrapr" style={{ gap: 6 }}>{best.map((f) => <span key={f.id} className="pill dark"><AugImg id={f.id} size={18} />{GAME_DATA.augments.find((a) => a.id === f.id)?.name}</span>)}</div></>}
        {cc?.masters?.[0] && <div className="k row" style={{ gap: 6 }}>최다 <b style={{ color: '#fff' }}>{cc.masters[0].nick}</b> · {cc.masters[0].n}판 {pct(cc.masters[0].w, cc.masters[0].n)}</div>}
      </div>
    </article>
  );
}
