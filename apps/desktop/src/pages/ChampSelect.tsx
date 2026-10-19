/**
 * 챔프 선택 도우미: 우리 팀 구성(AP/AD·앞라인·CC), 부족한 점, 대기석 추천, 큰 카드(내 챔피언 또는 미리보기).
 * 롤 클라이언트에는 읽기만 한다. 고르기·교체는 사용자가 롤에서 직접 한다.
 */
import { useEffect, useState } from 'react';
import { AUGMENT, CHAMPIONS, ROLE_KO, cdragon, ccWord, comp, explainFit, fitPoints, guideOf, GAME_DATA, needsOf, pct, planOf, teamFit, tierOf, verdictOf, buildFor, type Build, type ChampionProfile, type Comp, type Need, type Verdict, shortNick, josa } from '@prism/core';
import { AugRing, AugmentLink, Bone, ChampImg, ItemBuild, ItemBuildSkeleton, MemberFace, PieceIcon, Seg, SplashSwap, TierBadge, preloadSplash } from '@prism/ui';
import { checkNow, isKnownMember, type ChampSelect, type CrewSelect } from '../controller';
import { bridge } from '../bridge';
import { Icon } from '@prism/ui';
import type { Personal } from '@prism/core';

type Sort = 'mine' | 'balance' | 'crew';

/** '지금 확인': 기다리지 않고 롤 상태(챔프 선택·내 챔프·대기석)를 바로 다시 읽는다 */
export function CheckNow({ label = '지금 확인' }: { label?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" className={`btn sm ghost checknow ${busy ? 'busy' : ''}`} disabled={busy} title="롤 클라이언트를 바로 다시 읽어요"
      onClick={async () => { setBusy(true); try { await checkNow(); } finally { setTimeout(() => setBusy(false), 300); } }}>
      <Icon name="refresh" />{label}
    </button>
  );
}
/** 롤이 '전체 화면'이면 게임 위 증강 창이 뜰 수 없다 → 챔프 선택에서 미리 알린다 (v3.65). 자동 인식이 켜져 있을 때만 */
const fmt = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));
const rate = (r?: { n: number; w: number }) => (r && r.n ? r.w / r.n : -1);

export function ChampSelectPanel({ cs, crew, pending = false, personal }: { cs: ChampSelect; crew: CrewSelect; pending?: boolean; personal: Personal }) {
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
  // 내 챔프·대기석·팀 챔프 그림을 미리 받아 둔다 — 바꿀 때 기다림 없이 바로 겹쳐 바뀌게 (v3.80)
  const preKey = [cs.mine, ...cs.bench, ...cs.team.map((t) => t.championId)].filter(Boolean).join(',');
  useEffect(() => { preloadSplash(preKey.split(',').map(Number)); }, [preKey]);
  // 아직 아무 챔프도 정해지지 않은 첫 몇 초: 빈 숫자 대신 기다리는 화면
  if (!shown && !base.length && !bench.length) return (
    <section className="card pad cs">
      <div className="card-head"><h2>챔프 선택</h2><span className="sp" /><CheckNow /><span className="pill accent">진행 중</span></div>
      <div className="cs-wait">
        <div className="cs-wait-slots" aria-hidden="true">{[0, 1, 2, 3, 4].map((i) => <i key={i} className={i === 0 ? 'me' : ''} style={{ animationDelay: `${i * 120}ms` }} />)}</div>
        <div className="cs-wait-t"><b>챔프가 정해지는 중이에요</b><span className="meta">정해지면 우리 팀 구성과 어울리는 증강을 바로 보여 드려요.</span></div>
      </div>
    </section>
  );
  // 우리 팀은 늘 5칸 (아직 안 들어온 팀원은 빈 칸)
  const slots = [{ championId: shown ?? 0, puuid: 'me' }, ...cs.team, ...Array.from({ length: Math.max(0, 4 - cs.team.length) }, (_, i) => ({ championId: 0, puuid: `empty-${i}` }))];

  const recoAfter = reco ? (() => { const cc2 = comp([...base, CHAMPIONS[reco]].filter(Boolean)); return verdictOf(cc2, needsOf(cc2)); })() : null;

  // 대기석은 맨 위 한 줄 (바로 눌러 미리보기), 아래는 왼쪽 큰 카드(내 챔프·미리보기) + 오른쪽 우리 팀 분석
  return (
    <section className="card pad cs">
      <div className="card-head"><h2>챔프 선택</h2><span className="sp" /><CheckNow /><span className="pill accent">진행 중</span></div>
      {bench.length > 0 && <div className="cs-bench">
        <div className="cs-bench-h"><b>대기석</b><span className="cs-bench-n">{bench.length}</span><span className="meta">눌러서 미리보기</span><span className="sp" />
          {bench.length > 1 && <Seg value={sort} options={[['balance', '팀 밸런스'], ['mine', '내가 잘하는'], ['crew', '모임 승률']]} onChange={setS} />}</div>
        <div className="seat-tray">
          {bench.map((id) => {
            const r = sort === 'crew' ? crewOf(id) : mine(id);
            const f = fit(id);
            const sub = sort === 'balance' ? (f.fills.length ? `${f.fills.join('·')} 보완` : '–') : r?.n ? `${sort === 'crew' ? '모임' : '나'} ${pct(r.w, r.n)}` : '기록 없음';
            return (
              <button key={id} type="button" className={`seat ${preview === id ? 'on' : ''} ${reco === id ? 'reco' : ''}`} onClick={() => setPreview(preview === id ? null : id)} title={`${CHAMPIONS[id]?.name} · 눌러서 미리보기`}>
                <span className="pic"><ChampImg id={id} size={52} />{reco === id && <span className="mark">추천</span>}<span className="dmg">{CHAMPIONS[id]?.damage === 'MIX' ? '혼합' : CHAMPIONS[id]?.damage}</span></span>
                <span className="nm">{CHAMPIONS[id]?.name}</span><span className={`sub ${sort === 'balance' && f.fills.length ? 'fill' : ''}`}>{sub}</span>
              </button>
            );
          })}
        </div>
      </div>}
      <div className={`cs-layout ${shown ? '' : 'one'}`}>
        <Briefing crew={crew} pending={pending} team={cs.team} />
        {shown && <Featured id={shown} isMine={shown === cs.mine} crew={crew} pending={pending} personal={personal} fitText={fit(shown)} needs={needs} isReco={reco === shown} onBack={preview ? () => setPreview(null) : undefined} />}
        <TeamBoard slots={slots} mates={mates} preview={Boolean(preview)} c={teamComp} needs={teamNeeds} verdict={team.length ? verdictOf(teamComp, teamNeeds) : null} reco={reco} recoAfter={recoAfter} recoFills={reco ? fit(reco).fills : []} onPreview={setPreview} />
      </div>
    </section>
  );
}

type Mate = NonNullable<CrewSelect>['teammates'][number];

/** 추천 아이템을 롤 아이템 세트로 넣기 (v3.92). 누를 때만, 내 세트 목록의 'Prism' 세트 하나를 넣거나 바꾼다 */
function ItemSetButton({ champion, name, build }: { champion: number; name: string; build: Build }) {
  const [st, setSt] = useState<'idle' | 'busy' | 'done' | 'err'>('idle');
  const [msg, setMsg] = useState('');
  useEffect(() => { setSt('idle'); setMsg(''); }, [champion]);
  const put = async () => {
    setSt('busy'); setMsg('');
    const blocks = [
      build.boots ? { name: '신발', items: [build.boots] } : null,
      { name: '먼저', items: build.core.map((x) => x.id) },
      build.later.length ? { name: '그다음', items: build.later.slice(0, 3).map((x) => x.id) } : null,
    ].filter((b): b is { name: string; items: number[] } => Boolean(b && b.items.length));
    try { await bridge.lcuItemSet(champion, `Prism · ${name}`, blocks); setSt('done'); }
    catch (e) { setSt('err'); setMsg(e instanceof Error ? e.message : String(e)); }
  };
  if (st === 'done') return <small className="ok"><Icon name="check" />롤 아이템 세트에 넣었어요</small>;
  return <>
    {st === 'err' && <small className="err">{msg || '넣지 못했어요'}</small>}
    <button type="button" className="btn sm" disabled={st === 'busy'} onClick={put}>{st === 'busy' ? '넣는 중…' : '롤에 아이템 세트로 넣기'}</button>
  </>;
}

/** 이번 판 (v3.90): 같은 팀 멤버와 우리 사이 기록 · 이 판을 이기면 무엇이 되는지 (이번 주 도전). 받기는 미션 화면에서 */
function Briefing({ crew, pending, team }: { crew: CrewSelect; pending: boolean; team: { puuid: string }[] }) {
  // 받는 동안 같은 자리를 잡아 둔다 — 나중에 위에 끼어들며 큰 카드·분석을 밀어내지 않게 (v3.93).
  // 같은 팀 멤버는 전에 본 회원 계정으로 미리 센다
  if (pending) {
    const n = team.filter((t) => t.puuid && isKnownMember(t.puuid)).length;
    return (
    <section className={`csb ${n ? '' : 'solo'}`} aria-busy="true">
      {n > 0 && <div className="csb-mates">
        <span className="csb-h">같은 팀 멤버</span>
        {Array.from({ length: n }, (_, i) => <div key={i} className="csb-mate"><Bone w={40} h={40} r="round" /><span className="csb-mate-t"><b><Bone w={80} h={14} style={{ display: 'inline-block', verticalAlign: 'middle' }} /></b><Bone w={120} h={20} r="pill" /></span></div>)}
      </div>}
      <div className="csb-stakes">
        <span className="csb-h">이번 판에 걸린 것</span>
        <div className="csb-list">{[0, 1, 2].map((i) => <div key={i} className="csb-st"><Bone w={40} h={40} r="round" /><span className="t"><Bone w="70%" h={14} /><Bone w="45%" h={12} /></span><span /></div>)}</div>
      </div>
    </section>
  );
  }
  const mates = crew?.teammates ?? [];
  const stakes = crew?.stakes ?? [];
  if (!mates.length && !stakes.length) return null;
  return (
    <section className={`csb ${mates.length ? '' : 'solo'}`}>
      {mates.length > 0 && <div className="csb-mates">
        <span className="csb-h">같은 팀 멤버</span>
        {mates.map((m) => (
          <div key={m.puuid} className="csb-mate">
            <MemberFace nick={m.nick} skin={m.skin} champion={m.main} size={40} />
            <span className="csb-mate-t">
              <b>{shortNick(m.nick)}</b>
              <span className="csb-tags">
                <span>{m.together.n ? `함께 ${m.together.n}판 ${m.together.w}승` : '처음 함께해요'}</span>
                {(m.bond?.grade ?? 1) >= 2 && <span className="bond">{m.bond!.name}</span>}
                {(m.streak ?? 0) >= 3 && <span className="hot">{m.streak}연승 중</span>}
              </span>
            </span>
          </div>
        ))}
      </div>}
      {stakes.length > 0 && <div className="csb-stakes">
        <span className="csb-h">이번 판에 걸린 것</span>
        <div className="csb-list">{stakes.map((s) => (
          <div key={s.key + s.title} className={`csb-st ${s.key} ${s.reward ? 'hot' : ''}`}>
            <span className="big num">{s.big}</span>
            <span className="t"><b>{s.title}</b>{s.augs ? <span className="csb-augs">{s.augs.map((a) => <AugmentLink key={a} id={a} inline><AugRing id={a} size={24} /></AugmentLink>)}<small>{s.sub}</small></span> : <small>{s.sub}</small>}</span>
            {s.reward > 0 && <span className="msn-amt">+{s.reward}<PieceIcon size={12} /></span>}
          </div>
        ))}</div>
      </div>}
    </section>
  );
}

/** 우리 팀 분석 (나까지 5명): 평가 · 다섯 칸 · 피해 구성/앞라인/군중 제어 막대 · 바꾸면 좋은 챔프 · 이번 판 작전 */
function TeamBoard({ slots, mates, preview, c, needs, verdict, reco, recoAfter, recoFills, onPreview }: {
  slots: { championId: number; puuid: string }[]; mates: Record<string, Mate>; preview: boolean; c: Comp; needs: Need[]; verdict: Verdict | null;
  reco?: number; recoAfter: Verdict | null; recoFills: Need[]; onPreview: (id: number) => void;
}) {
  const dmg = c.ap + c.ad;
  const apShare = dmg ? c.ap / dmg : 0.5;
  const ccAvg = c.n ? c.cc / c.n : 0;
  const plans = c.n ? planOf(c, needs) : [];
  // 팀 성향: 다섯 축의 평균 (챔프 성향 1~3)
  const team = slots.map((x) => CHAMPIONS[x.championId]).filter(Boolean) as ChampionProfile[];
  const avgOf = (k: keyof ChampionProfile['style']) => (team.length ? team.reduce((t, ch) => t + ch.style[k], 0) / team.length : 0);
  const state = (bad: boolean) => <span className={`tb-st ${bad ? 'bad' : 'ok'}`}>{bad ? '부족' : '충분'}</span>;
  return (
    <section className="tb">
      <div className={`tb-verdict ${verdict?.grade ?? 'none'}`}>
        <span className="k">우리 팀 {preview ? '(미리보기 포함)' : ''}</span>
        <b>{verdict ? verdict.label.split(' · ')[0] : '팀 구성을 읽는 중'}</b>
        <span className="sub">{!verdict ? '팀원 챔프가 정해지면 바로 분석해요' : needs.length ? `${josa(needs.join('·'), '이/가')} 부족해요` : '부족한 것이 없어요'}</span>
        <div className="tb-team">{slots.map((s, i) => {
          const m = mates[s.puuid];
          return (
            <span key={i} className={`tm ${i === 0 ? 'me' : ''}`} title={m ? `Prism 회원 · 함께 ${m.together.n}판 ${pct(m.together.w, m.together.n)}` : undefined}>
              {s.championId ? <ChampImg id={s.championId} size={40} /> : <span className="champ ph" />}
              <span className={`who ${m ? 'prism' : ''}`}>{i === 0 ? (preview ? '미리보기' : '나') : m ? shortNick(m.nick) : CHAMPIONS[s.championId]?.name ?? '선택 중'}</span>
            </span>
          );
        })}</div>
      </div>

      <div className="tb-metrics">
        <div className="tb-m">
          <span className="tb-l">피해 구성</span>
          <span className="tb-split" aria-hidden="true"><i className="ap" style={{ width: `${apShare * 100}%` }} /><i className="ad" style={{ width: `${(1 - apShare) * 100}%` }} /></span>
          <span className="tb-v"><b className="ap">AP {fmt(c.ap)}</b> · <b className="ad">AD {fmt(c.ad)}</b></span>
          {state(needs.includes('AP') || needs.includes('AD'))}
        </div>
        <div className="tb-m">
          <span className="tb-l">앞라인</span>
          <span className="tb-bar" aria-hidden="true"><i style={{ width: `${Math.min(1, c.front / 3) * 100}%` }} /><em style={{ left: `${(1 / 3) * 100}%` }} /></span>
          <span className="tb-v"><b>{fmt(c.front)}</b>명</span>
          {state(needs.includes('앞라인'))}
        </div>
        <div className="tb-m">
          <span className="tb-l">군중 제어</span>
          <span className="tb-bar" aria-hidden="true"><i style={{ width: `${Math.min(1, ccAvg / 3) * 100}%` }} /><em style={{ left: `${(2 / 3) * 100}%` }} /></span>
          <span className="tb-v"><b>{ccWord(c)}</b></span>
          {state(needs.includes('CC'))}
        </div>
      </div>

      {team.length > 0 && <div className="tb-style">
        <span className="tb-h">팀 성향 <small>{team.length}명 평균</small></span>
        <div className="tb-axes">{STYLE.map(([k, l]) => { const v = avgOf(k); return (
          <span key={k} className="tb-ax"><span className="col"><i style={{ height: `${(v / 3) * 100}%` }} /></span><b>{v.toFixed(1)}</b><small>{l}</small></span>
        ); })}</div>
      </div>}

      {reco && <button type="button" className="tb-reco" onClick={() => onPreview(reco)}>
        <ChampImg id={reco} size={48} />
        <span className="t"><small>대기석에서 바꾸면 좋아요</small><b>{CHAMPIONS[reco]?.name}</b><span>{recoFills.length ? `${recoFills.join('·')} 보완` : '부족한 것이 줄어요'}{recoAfter && <> → <em className={recoAfter.grade}>{recoAfter.label.split(' · ')[0]}</em></>}</span></span>
        <span className="go">미리보기</span>
      </button>}

      {plans.length > 0 && <div className="tb-plan">
        <span className="tb-h">이번 판 작전</span>
        {plans.map((p) => <div key={p.title} className={`tb-p ${p.tone}`}><i aria-hidden="true" /><span><b>{p.title}</b><small>{p.text}</small></span></div>)}
      </div>}
    </section>
  );
}

const STYLE: [keyof ChampionProfile['style'], string][] = [['damage', '피해'], ['durability', '단단함'], ['cc', '군중 제어'], ['mobility', '기동'], ['utility', '보조']];
const RANGE_KO = { ranged: '원거리', melee: '근접' } as const;

/** 큰 카드: 내 챔피언(또는 대기석 미리보기)의 성향·내 기록·모임 기록·팀에 넣으면 + 아래 줄: 어울리는 증강·내가 고른 증강 (v3.72) */
function Featured({ id, isMine, crew, pending, personal, fitText, needs, isReco, onBack }: { id: number; isMine: boolean; crew: CrewSelect; pending: boolean; personal: Personal; fitText: ReturnType<typeof teamFit>; needs: string[]; isReco: boolean; onBack?: () => void }) {
  const ch = CHAMPIONS[id];
  const g = guideOf(GAME_DATA, id);
  // 등급마다 가장 잘 맞는 증강 하나씩 (프리즘 · 골드 · 실버)
  const picks = g ? ([['prismatic', g.prismatic], ['gold', g.gold], ['silver', g.silver]] as const).map(([r, list]) => ({ r, f: list[0] })).filter((x) => x.f && x.f.level !== 'none') : [];
  const me = personal.champions[id], cc = crew?.champions?.[id];
  const myAugs = (personal.augmentsByChampion[id] ?? []).slice(0, 3);
  const top = cc?.masters?.[0];
  if (!ch) return <div />;
  const build = buildFor(id, cc?.items);
  return (
    <>
    <article className={`cs-tile ${isMine ? 'mine' : ''}`}>
      <SplashSwap className="bg" src={cdragon(ch.splash)} />
      <div className="cs-top">
        <span className={`cs-tag ${isMine ? 'mine' : ''}`}>{isMine ? '내 챔프' : '대기석 미리보기'}</span>
        {isReco && <span className="cs-tag reco">팀 추천</span>}
        <span className="sp" />
        {onBack && <button type="button" className="btn sm back" onClick={onBack}>내 챔프 보기</button>}
      </div>
      <div className="body cs-swap" key={id}>
        <div className="cs-name">
          <h3>{ch.name}</h3>
          <div className="cs-chips">{[ROLE_KO[ch.roles[0]], ch.roles[1] && ROLE_KO[ch.roles[1]], ch.damage === 'MIX' ? 'AP·AD' : ch.damage, RANGE_KO[ch.range]].filter(Boolean).map((t) => <span key={t as string}>{t}</span>)}</div>
        </div>

        <div className="cs-style" aria-label="챔프 성향">{STYLE.map(([k, l]) => (
          <span key={k} className="cs-st"><small>{l}</small><span className="pips">{[1, 2, 3].map((n) => <i key={n} className={ch.style[k] >= n ? 'on' : ''} />)}</span></span>
        ))}</div>

        <div className="cs-rec">
          <div><small>내 기록</small><b>{me?.n ? pct(me.w, me.n) : '–'}</b><span>{me?.n ? `${me.n}판 ${me.w}승` : '처음이에요'}</span>{me?.n ? <i className="wbar"><i style={{ width: `${(me.w / me.n) * 100}%` }} /></i> : null}</div>
          {pending ? <><div><small>모임</small><Bone w={56} h={24} dark /><Bone w={40} h={12} dark /></div><div><small>모임 최다</small><Bone w={64} h={24} dark /><Bone w={56} h={12} dark /></div></> : <>
          <div><small>모임</small><b>{cc?.crew?.n ? pct(cc.crew.w, cc.crew.n) : '–'}</b><span>{cc?.crew?.n ? `${cc.crew.n}판` : crew ? '기록 없음' : '회원 전용'}</span>{cc?.crew?.n ? <i className="wbar"><i style={{ width: `${(cc.crew.w / cc.crew.n) * 100}%` }} /></i> : null}</div>
          <div><small>모임 최다</small>{top ? <><b className="who">{shortNick(top.nick)}</b><span>{top.n}판 · {pct(top.w, top.n)}</span></> : <><b>–</b><span>아직 없어요</span></>}</div></>}
        </div>

        {!isMine && <div className="cs-sec">
          <span className="cs-h">팀에 넣으면</span>
          <div className="cs-fill">{fitText.warn ? <span className="pill warn">팀이 {fitText.warn}</span> : fitText.fills.length ? fitText.fills.map((x) => <span key={x} className="pill ok">{x} 보완</span>) : <span className="cs-muted">{needs.length ? `부족한 ${josa(needs.join('·'), '은/는')} 채우지 못해요` : '팀 구성 무난'}</span>}</div>
        </div>}
      </div>
    </article>
    {(picks.length > 0 || myAugs.length > 0) && <section className={`cs-augrow ${myAugs.length ? '' : 'solo'}`}>
        {picks.length > 0 && <div className="cs-sec">
          <span className="cs-h">{ch.name}에게 어울리는 증강 <small>등급별 1순위</small></span>
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
          <span className="cs-h">내가 이 챔프로 고른 증강</span>
          <div className="cs-mine">{myAugs.map((a) => <AugmentLink key={a.id} id={a.id} champion={id} inline className="cs-chip"><AugRing id={a.id} size={22} /><span>{AUGMENT[a.id]?.name}</span><small>{a.n}번 · {pct(a.w, a.n)}</small></AugmentLink>)}</div>
        </div>}
    </section>}
    <section className="cs-itemrow">{pending ? <ItemBuildSkeleton title={`${ch.name} 추천 아이템`} /> : <ItemBuild build={build} title={`${ch.name} 추천 아이템`} action={build && <ItemSetButton champion={id} name={ch.name} build={build} />} />}</section>
    </>
  );
}
