/**
 * 이번 판 분석 (CLAUDE.md v3.71): 이번 판 조합(우리 팀·상대 팀)으로 내 역할 · 자리 잡기 · 주의할 상대 · 고려할 아이템.
 * 규칙으로 만든다(AI 아님). 상황 판단은 증강 우선순위·판 복기와 같은 엔진(situation.ts), 아이템 성격 기준도 같다.
 * 빌드 순서를 정해 주지 않는다 — '고려해 볼 것'만, 고르는 건 사용자.
 */
import { CHAMPIONS, ITEM } from './data';
import { situationsOf, type Matchup, type SituKey } from './situation';
import { challengeRole, CHALLENGE_ROLE_KO, type ChallengeRole } from './challenges';
import { josa } from './josa';
import type { ChampionProfile } from './synergy';

export type PlanTip = { title: string; text: string };
export type Threat = { id: number; tag: string };
export type PlanItem = { title: string; why: string; items: number[] };
export type GamePlan = { role: PlanTip & { role: ChallengeRole | null; note?: string }; position: PlanTip[]; threats: Threat[]; items: PlanItem[] };

const has = (c: ChampionProfile, r: string) => c.roles.includes(r);
const isTank = (c: ChampionProfile) => has(c, 'tank') || c.style.durability >= 3;
const squishy = (c: ChampionProfile) => c.style.durability <= 1 && !has(c, 'tank');
const diver = (c: ChampionProfile) => has(c, 'assassin') || (c.range === 'melee' && c.style.mobility >= 2 && c.style.damage >= 2);
const nameOf = (id: number) => CHAMPIONS[id]?.name ?? '';
const list = (ids: number[], n = 2) => ids.slice(0, n).map(nameOf).filter(Boolean).join('·');

/** 조합이 들어왔을 때만 (상대 3명 이상). me = 내 챔프 */
export function gamePlanOf(meId: number | null | undefined, m: Matchup | null): GamePlan | null {
  const me = meId ? CHAMPIONS[meId] : undefined;
  if (!me || !meId || !m || m.enemies.length < 3) return null;
  const en = m.enemies.filter((id) => CHAMPIONS[id]);
  const al = m.allies.filter((id) => CHAMPIONS[id]);
  const E = (id: number) => CHAMPIONS[id]!;
  const sits = situationsOf(me, m);
  const sv = (k: SituKey) => sits.find((s) => s.key === k)?.strength ?? 0;
  const role = challengeRole(meId);
  const soft = squishy(me), tough = me.style.durability >= 2, dealer = me.style.damage >= 2, ap = me.damage === 'AP';
  const allyTanks = al.filter((id) => isTank(E(id))).length;
  const divers = en.filter((id) => diver(E(id)));
  const ccers = en.filter((id) => E(id).style.cc >= 3).sort((a, b) => E(b).style.cc - E(a).style.cc);
  const softEnemies = en.filter((id) => squishy(E(id)) && E(id).style.damage >= 2);
  const enemyTanks = en.filter((id) => isTank(E(id)));
  const rangedEn = en.filter((id) => E(id).range === 'ranged');
  const meleeEn = en.filter((id) => E(id).range === 'melee');

  // ── 내 역할: 챔프 역할 + 이번 판 팀 사정
  const roleKo = role ? CHALLENGE_ROLE_KO[role] : '';
  let rt: PlanTip;
  if ((role === 'tank' || role === 'fighter') && allyTanks === 0 && al.length >= 3) rt = { title: '앞라인을 맡아요', text: `우리 팀에 탱커가 없어요. ${roleKo}인 내가 먼저 맞아 주며 싸움을 열어야 해요` };
  else if (role === 'tank') rt = { title: '먼저 들어가 묶는 앞라인', text: ccers.length ? '상대보다 먼저 시야를 잡고, 들어가서 군중 제어를 받아 내 아군 딜러가 칠 시간을 벌어요' : '먼저 들어가 묶고 맞아 주며 아군 딜러가 칠 시간을 벌어요' };
  else if (role === 'fighter') rt = { title: '앞라인 옆에서 오래 싸우는 전사', text: softEnemies.length ? `탱커가 열어 주면 따라 들어가 ${list(softEnemies)}까지 밀어붙여요` : '탱커와 함께 앞에서 오래 버티며 피해를 꾸준히 넣어요' };
  else if (role === 'marksman') rt = { title: '뒤에서 꾸준히 때리는 주 딜러', text: '한타가 길어질수록 내 몫이 커져요. 살아 있는 것 자체가 팀의 딜이에요' };
  else if (role === 'mage') rt = sv('vsSquishy') >= 0.55 ? { title: '한 번에 터뜨리는 폭딜', text: `상대가 물렁해요. 스킬을 아꼈다가 ${list(softEnemies) || '뒤의 딜러'}에게 한 번에` } : { title: '광역 견제와 한타 딜', text: '싸움 전에는 견제로 체력을 깎고, 뭉치면 광역 스킬을 넣어요' };
  else if (role === 'assassin') rt = { title: '옆으로 돌아 딜러를 끊어요', text: softEnemies.length ? `${list(softEnemies)}처럼 물렁한 딜러가 목표예요. 앞의 탱커와 싸우지 않아요` : '상대가 단단해요. 무리하게 뛰어들기보다 한타가 시작된 뒤 빈틈을 노려요' };
  else if (role === 'support') rt = sv('needPeel') >= 0.55 ? { title: '물렁한 아군을 지켜요', text: '가장 잘 크는 아군 딜러 옆에서, 달려드는 적을 막아 주는 게 먼저예요' } : { title: '묶고 지키는 서포터', text: '싸움을 여는 군중 제어와 아군 보호를 함께 챙겨요' };
  else rt = { title: '내 역할', text: '' };
  // 피해 유형 몫: 우리 팀에서 나 혼자 AP/AD 면 알려 준다
  let note: string | undefined;
  const alC = al.map(E);
  if (alC.length >= 3 && me.damage && me.damage !== 'MIX') {
    const same = alC.filter((c) => c.damage === me.damage || c.damage === 'MIX').length;
    if (same === 0) note = `우리 팀 ${ap ? '마법' : '물리'} 피해는 나 혼자예요 — 상대가 한쪽 방어만 올리지 못하게 하는 몫`;
  }

  // ── 자리 잡기 (급한 것부터 최대 3)
  const pos: (PlanTip & { w: number })[] = [];
  if (soft && divers.length) pos.push({ w: 3 + divers.length, title: `${josa(list(divers), '이/가')} 나를 노려요`, text: '우리 앞라인 뒤, 아군 곁에 붙어 있어요. 혼자 떨어져 있으면 가장 먼저 잡혀요' });
  if (soft && ccers.length >= 2) pos.push({ w: 3, title: '묶이면 끝나요', text: `${list(ccers)}의 군중 제어를 먼저 보고 움직여요. 사거리 끝을 지키고, 스킬이 빠졌을 때 앞으로` });
  if (!soft && (role === 'tank' || role === 'fighter') && ccers.length >= 2) pos.push({ w: 2, title: '군중 제어를 대신 받아요', text: `${list(ccers)}의 스킬을 내가 먼저 맞아 빼 주면 아군 딜러가 자유로워져요` });
  if (me.range === 'melee' && rangedEn.length >= 3) pos.push({ w: 2 + rangedEn.length / 2, title: '견제에 깎이기 전에', text: `상대 원거리 ${rangedEn.length}명이 멀리서 깎아요. 체력이 있을 때 아군과 같이 한 번에 들어가요 — 혼자 먼저 들어가지 않기` });
  if (me.range === 'ranged' && meleeEn.length >= 3) pos.push({ w: 2 + meleeEn.length / 2, title: '거리를 지켜요', text: `상대 근접 ${meleeEn.length}명이 파고들어요. 사거리 끝에서 치고, 들어오면 뒤로 빠지며 때려요` });
  if (dealer && enemyTanks.length >= 2 && role !== 'tank') pos.push({ w: 1.5 + enemyTanks.length / 2, title: '탱커가 많아요', text: role === 'assassin' ? `${josa(list(enemyTanks), '은/는')} 피하고 뒤의 딜러를 노려요` : `${josa(list(enemyTanks), '을/를')} 넘기 어렵다면 닿는 적부터 꾸준히 — 오래 싸울수록 유리해요` });
  if (soft && allyTanks === 0 && al.length >= 3) pos.push({ w: 2, title: '앞라인이 없어요', text: '먼저 맞지 않게 한 칸 뒤에서. 상대가 먼저 들어오게 만들고 받아쳐요' });
  if (sv('vsBurst') >= 0.55 && !soft) pos.push({ w: 1, title: '물렁한 아군 곁에', text: `${josa(list(divers) || '상대', '이/가')} 들어오는 길목을 막아 주면 한타가 쉬워져요` });
  const position = pos.sort((a, b) => b.w - a.w).slice(0, 3).map(({ w: _w, ...p }) => p);

  // ── 주의할 상대 (나에게 위험한 순, 둘)
  const danger = (id: number) => { const c = E(id); return (diver(c) ? (soft ? 3 : 1.5) : 0) + c.style.cc * 0.6 + c.style.damage * 0.5 + (c.flags.includes('heal') && (has(c, 'support') || has(c, 'fighter')) ? 0.8 : 0); };
  const tagOf = (id: number) => { const c = E(id); const r = challengeRole(id); return r === 'assassin' ? '암살' : diver(c) && c.range === 'melee' ? '돌진' : c.style.cc >= 3 ? '묶기' : c.style.damage >= 3 ? '주 딜러' : c.flags.includes('heal') ? '회복' : '앞라인'; };
  const threats = [...en].sort((a, b) => danger(b) - danger(a)).slice(0, 2).map((id) => ({ id, tag: tagOf(id) }));

  // ── 고려할 아이템 (조합 기준, 최대 3)
  const items: (PlanItem & { w: number })[] = [];
  const healers = en.filter((id) => E(id).flags.includes('heal') && (has(E(id), 'support') || has(E(id), 'fighter') || E(id).style.utility >= 2));
  if (sv('vsHeal') >= 0.55) items.push({ w: sv('vsHeal') + 0.2, title: '치유 감소', why: healers.length ? `회복이 많은 상대 (${list(healers)})` : '회복이 많은 상대', items: tough ? [3075] : ap ? [3165] : [3033] });
  if (dealer && sv('vsTank') >= 0.55) items.push({ w: sv('vsTank'), title: ap ? '마법 관통' : '방어구 관통', why: `상대 탱커 ${enemyTanks.length}명 (${list(enemyTanks)})`, items: ap ? [3135] : [3036] });
  if (tough) {
    if (sv('vsAP') >= 0.55) items.push({ w: sv('vsAP'), title: '마법 저항력', why: '상대가 마법 피해 위주', items: [4401, 3065] });
    else if (sv('vsAD') >= 0.55) items.push({ w: sv('vsAD'), title: '방어력', why: '상대가 물리 피해 위주', items: [3143, 3110] });
  } else if (soft && sv('vsBurst') >= 0.55) {
    items.push({ w: sv('vsBurst'), title: '한 번 더 살아남기', why: divers.length ? `${list(divers)}의 폭딜` : '상대 폭딜', items: ap ? [3157, 3102] : [3026, 3156] });
  }
  if (sv('vsCC') >= 0.55) items.push({ w: sv('vsCC') * 0.9, title: '강인함', why: ccers.length ? `상대 군중 제어가 많아요 (${list(ccers)})` : '상대 군중 제어가 많아요', items: [3111] });
  return {
    role: { ...rt, role, note },
    position,
    threats,
    items: items.map((x) => ({ ...x, items: x.items.filter((id) => ITEM[id]) })).filter((x) => x.items.length).sort((a, b) => b.w - a.w).slice(0, 3).map(({ w: _w, ...x }) => x),
  };
}
