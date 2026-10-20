/**
 * 상황 판단: 우리 팀·상대 팀 조합으로 "지금 판에서" 어떤 증강이 더 중요한지.
 *  - 티어(S~D)는 그대로 챔피언과의 어울림 (synergy.ts). 바뀌지 않는다.
 *  - 우선순위 = 어울림 점수 + 상황 가산. 티어가 낮아도 지금 판에 필요한 증강이 위로 올라올 수 있다.
 *  - 증강의 상황 효과는 증강 설명을 읽고 사람이 분류한 표 (SITU). 새 증강은 여기 한 줄.
 * 승률은 쓰지 않는다 (게임 위 작은 창에도 그대로 쓰기 때문, v3.5).
 */
import { AUGMENT, CHAMPIONS, inGame } from './data';
import { fitOf, fitPoints, tierOf, TIE_GAP, type ChampionProfile, type FitTier, type MayhemAugment } from './synergy';

export type Matchup = { allies: number[]; enemies: number[] };

export type SituKey =
  | 'vsTank' | 'vsSquishy' | 'vsAP' | 'vsAD' | 'vsCC' | 'vsBurst' | 'vsMelee' | 'vsPoke' | 'vsHeal'
  | 'needFront' | 'needCC' | 'needPeel' | 'needDamage';

/** 증강 → 빛나는 상황 (+) 또는 불리한 상황 (-) */
const SITU: Record<number, Partial<Record<SituKey, number>>> = {
  // 탱커를 녹이는 효과: 최대 체력 비례·고정 피해·관통·저항 깎기·오래 싸울수록 쌓이는 화상
  1028: { vsTank: 1 }, 1084: { vsTank: 1 }, 1036: { vsTank: 1 }, 1133: { vsTank: 1 }, 1195: { vsTank: 0.8 }, 2098: { vsTank: 1 },
  1025: { vsTank: 0.6 }, 1996: { vsTank: 0.8 }, 2083: { vsTank: 0.7 }, 1345: { vsTank: 0.6, needCC: 0.4 }, 2133: { vsTank: 0.5, needPeel: 0.4 }, 1045: { vsTank: 0.5 },
  1325: { vsTank: 0.5, needDamage: 0.6, vsBurst: -0.8 },
  // 물렁한 상대: 폭딜·처형
  1038: { vsSquishy: 1 }, 1211: { vsSquishy: 0.8, vsTank: 0.3 }, 2006: { vsSquishy: 0.8 }, 2026: { vsSquishy: 0.7 }, 1326: { vsSquishy: 0.6 }, 1048: { vsSquishy: 0.5 },
  // 피해 유형별 방어
  1034: { vsAP: 1, vsCC: 0.6, vsBurst: 0.5 }, 2076: { vsAP: 0.8, vsAD: 0.8 }, 2138: { vsAP: 0.8, vsAD: 0.8 }, 1063: { vsAP: 0.6, vsAD: 0.6 },
  1001: { vsAP: 0.5, vsAD: 0.5, vsCC: 0.6, needFront: 0.8 }, 1080: { vsAD: 1 }, 1074: { vsAD: 0.6, vsMelee: 0.6 }, 1095: { vsAP: 0.4, vsAD: 0.4, needPeel: 0.7 },
  // 군중 제어 대비
  1112: { vsCC: 1 }, 1305: { vsCC: 0.7, vsMelee: 0.3 }, 1011: { vsCC: 0.5, vsBurst: 0.7 }, 1301: { vsBurst: 0.8, vsCC: 0.4, needPeel: 0.8 }, 1347: { vsCC: 0.5, vsBurst: 0.5 }, 2099: { vsCC: 0.5 },
  // 폭딜·암살 대비 (살아남기)
  1020: { vsBurst: 1 }, 1333: { vsBurst: 0.9 }, 1180: { vsBurst: 0.8, vsPoke: 0.5 }, 1318: { vsBurst: 0.9 }, 1013: { vsBurst: 0.6, needFront: 1, needDamage: -0.4 },
  1056: { vsBurst: 0.5, needFront: 0.8 }, 1344: { vsBurst: 0.7, needFront: 0.5 }, 2107: { vsBurst: 0.5 },
  // 근접 돌진 상대: 거리 유지
  1071: { vsMelee: 1 }, 1115: { vsMelee: 1 }, 1170: { vsMelee: 1 }, 1044: { vsMelee: 0.8, needCC: 0.5 }, 2139: { vsMelee: 0.8, needFront: 0.5 }, 1187: { vsMelee: 0.6 },
  1116: { vsMelee: 0.6, vsBurst: 0.4 }, 1348: { vsMelee: 0.5, vsBurst: 0.4 }, 2065: { vsMelee: 0.6, needCC: 0.8 },
  // 원거리 견제 상대: 지속력·진입
  1060: { vsPoke: 1 }, 1067: { vsPoke: 0.8 }, 2043: { vsPoke: 0.7 }, 1057: { vsPoke: 0.7 }, 1019: { vsPoke: 0.6 }, 1073: { vsPoke: 0.6 }, 1105: { vsPoke: 0.5 },
  1138: { vsPoke: 0.5 }, 2132: { vsPoke: 0.5 },
  // 우리 팀 앞라인이 없을 때 (내가 버틸 수 있으면)
  1041: { needFront: 1, needDamage: 0.3 }, 1353: { needFront: 0.8 }, 1324: { needFront: 0.6 }, 1413: { needFront: 0.8, needCC: 0.6 }, 1152: { needFront: 0.6 },
  1375: { needFront: 0.6 }, 1401: { needFront: 0.6, needCC: 0.6 },
  // 우리 팀 군중 제어가 부족할 때
  1194: { needCC: 1 }, 1421: { needCC: 1 }, 2115: { needCC: 0.8 }, 1329: { needCC: 0.6 }, 2080: { needCC: 0.6 }, 2031: { needCC: 0.4 },
  // 우리 팀이 물렁할 때 지켜 주기 (보조형)
  1141: { needPeel: 1 }, 2104: { needPeel: 1 }, 1420: { needPeel: 1 }, 2137: { needPeel: 0.7 }, 2004: { needPeel: 0.7 }, 1076: { needPeel: 0.7 },
  1331: { needPeel: 0.7 }, 2108: { needPeel: 0.7 }, 1005: { needPeel: 0.7 }, 2144: { needPeel: 0.6 }, 1037: { needPeel: 0.5 },
  // 우리 팀 딜이 부족할 때
  1007: { needDamage: 0.8 }, 1097: { needDamage: 0.8 }, 2111: { needDamage: 0.5 }, 1389: { needDamage: 0.5 },
  // 상대 회복이 많을 때 불리
  2082: { vsHeal: -1 },
  // 16.21 새 증강 (v3.101)
  3004: { vsSquishy: 0.6 }, 3016: { vsTank: 0.9 }, 3018: { vsSquishy: 0.6, needDamage: 0.5 }, 3025: { needPeel: 0.3 }, 3039: { vsBurst: 0.5, needPeel: 0.5, vsMelee: 0.4 }, 3051: { vsBurst: 0.3 }, 3052: { vsMelee: 0.4 }, 3053: { needFront: 0.7, needCC: 0.4 }, 3059: { needDamage: 0.4 }, 3063: { vsTank: 0.6 }, 3071: { needPeel: 0.6, vsMelee: 0.6 }, 3075: { vsMelee: 0.4 }, 3086: { needCC: 0.4 }, 3094: { needDamage: 0.3 }, 3116: { vsTank: 0.4 }, 3118: { vsSquishy: 0.4 }, 3131: { vsBurst: 0.3 }, 3132: { needDamage: 0.5 }, 3134: { needFront: 0.5 }, 3149: { needPeel: 0.7 }, 3150: { vsTank: 0.4 },
};

/** 상황 가산 한 단위의 크기: 강한 상황 하나면 A 티어가 S 티어를 넘고, 여러 상황이 겹치면 B 티어도 올라올 수 있게 */
const WEIGHT = 28;
const CAP = 45;

export type Situation = { key: SituKey; strength: number; label: string };

const has = (c: ChampionProfile, r: string) => c.roles.includes(r);
const isTank = (c: ChampionProfile) => has(c, 'tank') || c.style.durability >= 3;
const isSquishy = (c: ChampionProfile) => c.style.durability <= 1 && !has(c, 'tank');
const apShare = (c: ChampionProfile) => (c.damage === 'AP' ? 1 : c.damage === 'MIX' ? 0.5 : 0);
const adShare = (c: ChampionProfile) => (c.damage === 'AD' ? 1 : c.damage === 'MIX' ? 0.5 : 0);
const isBurst = (c: ChampionProfile) => has(c, 'assassin') || (c.style.damage >= 3 && c.style.mobility >= 2 && c.range === 'melee');
const healer = (c: ChampionProfile) => c.flags.includes('heal') && (has(c, 'support') || c.style.utility >= 2 || has(c, 'fighter'));
const profiles = (ids: number[]) => ids.map((id) => CHAMPIONS[id]).filter(Boolean) as ChampionProfile[];
const step = (n: number, lo: number, hi: number) => (n >= hi ? 1 : n >= lo ? 0.55 : 0);

/** 조합으로 지금 판의 상황들. me 는 내 챔피언 (우리 팀 상황은 내가 그 역할을 할 수 있을 때만) */
export function situationsOf(me: ChampionProfile | undefined, m: Matchup): Situation[] {
  const out: Situation[] = [];
  const add = (key: SituKey, strength: number, label: string) => { if (strength > 0) out.push({ key, strength: Math.min(1, strength), label }); };
  const en = profiles(m.enemies), al = profiles(m.allies);
  if (en.length >= 3) {
    const tanks = en.filter(isTank).length;
    add('vsTank', step(tanks, 2, 3), `상대 탱커 ${tanks}명`);
    const squishy = en.filter(isSquishy).length;
    add('vsSquishy', tanks <= 1 ? step(squishy, 3, 4) : 0, `상대가 물렁해요 (${squishy}명)`);
    const ap = en.reduce((s, c) => s + apShare(c), 0), ad = en.reduce((s, c) => s + adShare(c), 0);
    add('vsAP', ap >= 3 ? (ap >= 4 ? 1 : 0.6) : 0, `상대 마법 피해 위주`);
    add('vsAD', ad >= 3 ? (ad >= 4 ? 1 : 0.6) : 0, `상대 물리 피해 위주`);
    const cc = en.reduce((s, c) => s + c.style.cc, 0);
    add('vsCC', cc >= 12 ? 1 : cc >= 10 ? 0.6 : 0, `상대 군중 제어가 많아요`);
    const burst = en.filter(isBurst).length;
    add('vsBurst', step(burst, 2, 3), `상대 암살·폭딜 ${burst}명`);
    const melee = en.filter((c) => c.range === 'melee').length;
    add('vsMelee', step(melee, 3, 4), `상대 근접 ${melee}명`);
    const ranged = en.length - melee;
    add('vsPoke', me?.range === 'melee' ? step(ranged, 3, 4) : 0, `상대 원거리 견제 ${ranged}명`);
    const heals = en.filter(healer).length;
    add('vsHeal', step(heals, 2, 3), `상대 회복이 많아요`);
  }
  if (me && al.length >= 3) {
    const tanks = al.filter(isTank).length;
    const canFront = me.style.durability >= 2 || me.range === 'melee';
    add('needFront', canFront ? (tanks === 0 ? 1 : 0) : 0, `우리 팀 앞라인이 없어요`);
    const cc = al.reduce((s, c) => s + c.style.cc, 0);
    add('needCC', cc <= 6 ? 1 : cc <= 8 ? 0.5 : 0, `우리 팀 군중 제어가 부족해요`);
    const soft = al.filter(isSquishy).length;
    const canPeel = has(me, 'support') || me.style.utility >= 2;
    add('needPeel', canPeel ? step(soft, 2, 3) : 0, `우리 팀이 물렁해요`);
    const dmg = al.reduce((s, c) => s + c.style.damage, 0);
    add('needDamage', me.style.damage >= 2 ? (dmg <= 7 ? 1 : dmg <= 8 ? 0.5 : 0) : 0, `우리 팀 딜이 부족해요`);
  }
  return out;
}

/** 상황에 맞는지에 대한 짧은 이유 (상황 → 이 증강이 하는 일) */
const DOES: Record<SituKey, string> = {
  vsTank: '탱커를 녹이는 효과', vsSquishy: '빠르게 끝내는 폭딜', vsAP: '마법 피해 방어', vsAD: '물리 피해 방어', vsCC: '군중 제어 대비',
  vsBurst: '폭딜에서 살아남기', vsMelee: '거리 유지', vsPoke: '버티며 파고들기', vsHeal: '회복', needFront: '앞에서 버티기',
  needCC: '묶어 두기', needPeel: '아군 지키기', needDamage: '모자란 딜 채우기',
};

export type SituBonus = { bonus: number; reasons: string[] };

/** 이 증강의 상황 가산 (조건 없는 증강·챔피언이 못 쓰는 증강은 0) */
export function situationalBonus(c: ChampionProfile, a: MayhemAugment, sits: Situation[]): SituBonus {
  const tags = SITU[a.id];
  if (!tags || !sits.length) return { bonus: 0, reasons: [] };
  if (fitOf(c, a).level === 'none') return { bonus: 0, reasons: [] };
  const parts = sits.map((s) => ({ s, v: (tags[s.key] ?? 0) * s.strength })).filter((x) => x.v !== 0).sort((x, y) => Math.abs(y.v) - Math.abs(x.v));
  const raw = parts.reduce((t, x) => t + x.v, 0) * WEIGHT;
  const bonus = Math.max(-CAP, Math.min(CAP, Math.round(raw)));
  const reasons = parts.slice(0, 2).map((x) => (x.v > 0 ? `${x.s.label} → ${DOES[x.s.key]}` : `${x.s.label} → 이 판엔 불리`));
  return { bonus, reasons };
}

export type PriorityFit = {
  id: number; tier: FitTier; points: number; priority: number; bonus: number; reasons: string[];
  rank: number; tied: boolean;
  /** 티어가 더 높은 증강보다 위로 올라왔는가 (상황 때문에) */
  lifted: boolean;
};

/**
 * 우선순위: 어울림 점수 + 상황 가산. 같은 티어이고 차이가 작으면 같은 순위 (고르는 건 사용자, v3.7-3).
 * 조합을 모르면 상황 가산 0 → 기존 어울림 순서와 같다.
 */
export function rankByPriority(c: ChampionProfile | undefined, augments: MayhemAugment[], m: Matchup | null): PriorityFit[] {
  if (!c) return [];
  const sits = m ? situationsOf(c, m) : [];
  const order: FitTier[] = ['S', 'A', 'B', 'C', 'D'];
  const list = augments.map((a) => {
    const f = fitOf(c, a);
    const points = fitPoints(f);
    const s = situationalBonus(c, a, sits);
    return { id: a.id, tier: tierOf(points), points, priority: points + s.bonus, bonus: s.bonus, reasons: s.reasons, rank: 1, tied: false, lifted: false, weight: f.weight };
  }).sort((x, y) => y.priority - x.priority || y.weight - x.weight);
  list.forEach((f, i) => {
    const prev = list[i - 1];
    if (prev && prev.tier === f.tier && f.tier !== 'D' && prev.priority - f.priority <= TIE_GAP) { f.rank = prev.rank; prev.tied = f.tied = true; }
    else f.rank = i + 1;
    f.lifted = list.slice(i + 1).some((x) => order.indexOf(x.tier) < order.indexOf(f.tier));
  });
  return list.map(({ weight: _w, ...x }) => x);
}

/** 화면 위쪽에 보여 줄 지금 판 요약 (상황 이름들) */
export const matchupSummary = (me: ChampionProfile | undefined, m: Matchup | null) => (m ? situationsOf(me, m).sort((a, b) => b.strength - a.strength) : []);

/** 증강의 상황 효과 이름들 (판 복기·도감 설명용) */
export const situTagsOf = (id: number): SituKey[] => Object.entries(SITU[id] ?? {}).filter(([, v]) => (v ?? 0) > 0).map(([k]) => k as SituKey);
export const SITU_LABEL = DOES;
export const augmentsFor = (key: SituKey) => Object.entries(SITU).filter(([, t]) => (t[key] ?? 0) >= 0.6).map(([id]) => Number(id)).filter((id) => AUGMENT[id] && inGame(AUGMENT[id]));
