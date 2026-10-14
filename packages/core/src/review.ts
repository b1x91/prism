/**
 * 판 복기: 이 판의 조합(우리 팀·상대 팀)으로 내 아이템·증강을 돌아본다.
 * 잘한 점(good)과 다음에 해 볼 것(tip)을 짧게. 승패를 탓하지 않고 "조합상 더 나았을 선택"만 말한다.
 * 상황 판단은 증강 우선순위와 같은 엔진 (situation.ts).
 */
import { AUGMENT, CHAMPIONS, ITEM, type ItemDetail } from './data';
import type { MatchDetail, MatchPlayer } from './history';
import { augmentsFor, situationsOf, situTagsOf, type SituKey } from './situation';
import { fitOf, fitPoints, tierOf } from './synergy';

export type Lesson = { kind: 'good' | 'tip'; title: string; detail?: string; augments?: number[]; items?: number[] };
export type Review = { lessons: Lesson[]; known: boolean };

type ItemKind = 'antiHeal' | 'armorPen' | 'magicPen' | 'armor' | 'mr' | 'tenacity' | 'pctHp';

function kindsOf(id: number, detail: Record<number, ItemDetail> | null): Set<ItemKind> {
  const out = new Set<ItemKind>();
  const d = detail?.[id];
  if (!d) return out;
  const stats = d.stats.join(' '), fx = d.effects.map(([n, t]) => `${n} ${t}`).join(' ');
  if (/고통스러운 상처|상처를 남깁니다|치유 및 회복 효과를 감소/.test(fx)) out.add('antiHeal');
  if (/방어구 관통력|물리 관통력/.test(stats)) out.add('armorPen');
  if (/마법 관통력/.test(stats)) out.add('magicPen');
  if (/방어력/.test(stats)) out.add('armor');
  if (/마법 저항력/.test(stats)) out.add('mr');
  if (/강인함/.test(stats)) out.add('tenacity');
  if (/최대 체력의|현재 체력의|현재 체력에 비례|추가 체력에 비례/.test(fx)) out.add('pctHp');
  return out;
}

/** 받침에 맞는 조사 ('이'/'가', '은'/'는') */
const jong = (w: string) => { const ch = w.charCodeAt(w.length - 1); return ch >= 0xac00 && ch <= 0xd7a3 && (ch - 0xac00) % 28 !== 0; };
const iga = (w: string) => `'${w}'${jong(w) ? '이' : '가'}`;
const eunneun = (w: string) => `'${w}'${jong(w) ? '은' : '는'}`;
const names = (ids: number[]) => ids.map((id) => CHAMPIONS[id]?.name).filter(Boolean).slice(0, 3).join('·');
const itemNames = (ids: number[]) => ids.map((id) => ITEM[id]?.name).filter(Boolean).join(' · ');

/** 판 복기. me = 카드의 내 기록 (챔피언·승패로 판 안의 나를 찾는다) */
export function reviewMatch(m: MatchDetail, me: { championId: number; win: boolean }, detail: Record<number, ItemDetail> | null): Review {
  const mine: MatchPlayer | undefined = m.players.find((p) => p.championId === me.championId && p.win === me.win);
  const c = CHAMPIONS[me.championId];
  if (!mine || !c) return { lessons: [], known: false };
  // 조합: 서버에 저장된 팀 조합 → 없으면 10명 기록
  const teamIds = Object.keys(m.teams);
  const myTeam = teamIds.find((t) => m.teams[t].win === me.win && (m.teams[t].champions ?? []).includes(me.championId)) ?? String(mine.teamId);
  const champsOf = (t: string) => m.teams[t]?.champions ?? m.players.filter((p) => String(p.teamId) === t).map((p) => p.championId);
  const allyIds = champsOf(myTeam).filter((id) => id !== me.championId);
  const enemyTeam = teamIds.find((t) => t !== myTeam) ?? (m.full ? String(m.players.find((p) => String(p.teamId) !== String(mine.teamId))?.teamId) : undefined);
  const enemyIds = enemyTeam ? champsOf(enemyTeam) : [];
  if (enemyIds.length < 3) return { lessons: [], known: false };

  const sits = situationsOf(c, { allies: allyIds, enemies: enemyIds });
  const strong = (k: SituKey) => (sits.find((s) => s.key === k)?.strength ?? 0) >= 0.55;
  const label = (k: SituKey) => sits.find((s) => s.key === k)?.label ?? '';
  const kinds = new Set<ItemKind>();
  for (const id of mine.items) for (const k of kindsOf(id, detail)) kinds.add(k);
  const deaths = mine.deaths;
  const ap = c.damage === 'AP', dealer = c.style.damage >= 2;
  const goods: Lesson[] = [], tips: Lesson[] = [];

  // 아이템: 조합 대응
  if (strong('vsHeal')) {
    const healers = enemyIds.filter((id) => CHAMPIONS[id]?.flags.includes('heal')).slice(0, 3);
    if (kinds.has('antiHeal')) goods.push({ kind: 'good', title: '회복이 많은 상대에게 치유 감소를 챙겼어요' });
    else { const ex = c.style.durability >= 3 ? [3075] : ap ? [3165] : [3033]; tips.push({ kind: 'tip', title: `상대 회복이 많았어요 (${names(healers)})`, detail: `치유 감소 아이템이 없었어요. 예: ${itemNames(ex)}`, items: ex }); }
  }
  if (strong('vsTank') && dealer) {
    if (kinds.has('armorPen') || kinds.has('magicPen') || kinds.has('pctHp')) goods.push({ kind: 'good', title: `${label('vsTank')}에 맞춰 관통·체력 비례 피해를 챙겼어요` });
    else { const ex = ap ? [3135] : [3036]; tips.push({ kind: 'tip', title: label('vsTank'), detail: `관통이나 최대 체력 비례 피해 아이템이 없었어요. 예: ${itemNames(ex)}`, items: ex }); }
  }
  const tough = c.style.durability >= 2 || deaths >= 7;
  if (strong('vsAP') && tough) {
    if (kinds.has('mr')) goods.push({ kind: 'good', title: '마법 피해 위주 상대에 마법 저항력을 챙겼어요' });
    else { const ex = c.style.durability >= 2 ? [4401, 3065] : ap ? [3102] : [3156]; tips.push({ kind: 'tip', title: '상대가 마법 피해 위주였어요', detail: `마법 저항력 아이템이 없었어요. 예: ${itemNames(ex)}`, items: ex }); }
  }
  if (strong('vsAD') && tough) {
    if (kinds.has('armor')) goods.push({ kind: 'good', title: '물리 피해 위주 상대에 방어력을 챙겼어요' });
    else { const ex = c.style.durability >= 2 ? [3143, 3110] : [3047]; tips.push({ kind: 'tip', title: '상대가 물리 피해 위주였어요', detail: `방어력 아이템이 없었어요. 예: ${itemNames(ex)}`, items: ex }); }
  }
  if (strong('vsCC') && !kinds.has('tenacity') && deaths >= 6) tips.push({ kind: 'tip', title: '상대 군중 제어가 많았어요', detail: `강인함이 없었어요. 예: ${itemNames([3111, 3091])}`, items: [3111, 3091] });

  // 증강: 상황에 맞는 증강을 골랐는지, 아니면 다음에 노려 볼 증강
  const picked = mine.augments.filter((id) => AUGMENT[id]);
  const goodFor = (id: number) => fitOf(c, AUGMENT[id]).level !== 'none';
  const suggested = new Set<number>();
  for (const s of sits.filter((x) => x.strength >= 0.55).sort((a, b) => b.strength - a.strength)) {
    const hit = picked.find((id) => situTagsOf(id).includes(s.key));
    if (hit) { goods.push({ kind: 'good', title: `${s.label} — ${iga(AUGMENT[hit].name)} 잘 맞았어요`, augments: [hit] }); continue; }
    const cand = augmentsFor(s.key).filter((id) => !suggested.has(id) && goodFor(id) && ['S', 'A', 'B'].includes(tierOf(fitPoints(fitOf(c, AUGMENT[id]))))).slice(0, 3);
    cand.forEach((id) => suggested.add(id));
    if (cand.length) tips.push({ kind: 'tip', title: `${s.label} — 이런 증강이 보이면 우선해 보세요`, augments: cand });
  }
  // 챔피언과 안 맞는 증강 (상황 덕도 없을 때)
  const weak = picked.filter((id) => tierOf(fitPoints(fitOf(c, AUGMENT[id]))) === 'D' && !situTagsOf(id).some((k) => strong(k)));
  if (weak.length) tips.push({ kind: 'tip', title: `${eunneun(AUGMENT[weak[0]].name)} ${c.name}에게 잘 맞지 않는 증강이었어요`, detail: '같은 등급의 다른 증강을 고르는 편이 나았을 수 있어요.', augments: weak.slice(0, 2) });

  return { lessons: [...tips.slice(0, 4), ...goods.slice(0, 2)], known: true };
}
