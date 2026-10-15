/**
 * 게임 중 아이템 추천 (v3.46). Riot 라이브 클라이언트 데이터(앱이 게임 중에 내 PC 안에서 읽는 10명의 챔프·팀·현재 아이템·점수)로
 * "지금 이 판에서 고려할 아이템"을 이유와 함께 2~3개. 고르는 건 사용자 — 빌드 순서를 정해 주지 않는다.
 * 아이템 성격 판단은 판 복기와 같은 기준 (review.ts kindsOf).
 */
import { AUGMENT, AUGMENTS, CHAMPIONS, ITEM, type ItemDetail } from './data';
import { kindsOf, type ItemKind } from './review';
import { situationsOf, type Matchup, type SituKey } from './situation';

export type LivePlayer = { championId: number; team: string; items: number[]; k: number; d: number; a: number; me: boolean; augments: number[] };
export type LiveGame = { players: LivePlayer[]; mode: string; time: number };

const byAlias = new Map(Object.entries(CHAMPIONS).map(([id, c]) => [String((c as { alias?: string }).alias ?? '').toLowerCase(), Number(id)]));
const byName = new Map(Object.entries(CHAMPIONS).map(([id, c]) => [c.name, Number(id)]));
const augByName = new Map(AUGMENTS.map((a) => [a.name, a.id]));

/** 증강 칸이 있으면 (모드·패치마다 다를 수 있어 이름에 augment 가 들어간 칸을 찾는다) 증강 번호로 */
function augmentsIn(p: Record<string, unknown>): number[] {
  const out: number[] = [];
  for (const [k, v] of Object.entries(p)) {
    if (!/augment/i.test(k) || !Array.isArray(v)) continue;
    for (const x of v) {
      const o = (x ?? {}) as Record<string, unknown>;
      const id = Number(o.id ?? o.augmentId ?? x);
      const nm = String(o.displayName ?? o.name ?? '');
      const hit = AUGMENT[id] ? id : augByName.get(nm);
      if (hit) out.push(hit);
    }
  }
  return out;
}

/** Rust live_game 결과 → 화면용 (챔프를 못 알아보면 그 사람은 뺀다) */
export function parseLive(raw: any): LiveGame | null {
  if (!raw || !Array.isArray(raw.players)) return null;
  const me = String(raw.me ?? '');
  const players: LivePlayer[] = [];
  for (const p of raw.players) {
    const alias = String(p.rawChampionName ?? '').replace(/^game_character_displayname_/i, '').toLowerCase();
    const championId = byAlias.get(alias) ?? byName.get(String(p.championName ?? '')) ?? 0;
    if (!championId) continue;
    const names = [p.riotId, p.summonerName, p.riotIdGameName].filter((x): x is string => typeof x === 'string' && x.length > 0);
    players.push({
      championId, team: String(p.team ?? ''),
      items: (Array.isArray(p.items) ? p.items : []).map((i: any) => Number(i?.itemID)).filter((n: number) => n > 0),
      k: Number(p.scores?.kills ?? 0), d: Number(p.scores?.deaths ?? 0), a: Number(p.scores?.assists ?? 0),
      me: !!me && names.some((n) => n === me || n.split('#')[0] === me.split('#')[0]),
      augments: augmentsIn(p),
    });
  }
  return players.length ? { players, mode: String(raw.mode ?? ''), time: Number(raw.time ?? 0) } : null;
}

/** 라이브 데이터 → 이번 판 조합 (내 챔프 기준) */
export function liveMatchup(g: LiveGame | null): (Matchup & { me: number }) | null {
  const me = g?.players.find((p) => p.me);
  if (!g || !me) return null;
  return {
    me: me.championId,
    allies: g.players.filter((p) => p.team === me.team && !p.me).map((p) => p.championId),
    enemies: g.players.filter((p) => p.team !== me.team).map((p) => p.championId),
  };
}

export type ItemAdvice = { key: string; title: string; why: string; items: number[] };

/** 받침에 맞는 '이/가' */
const iga = (w: string) => { const ch = w.charCodeAt(w.length - 1); return `${w}${ch >= 0xac00 && ch <= 0xd7a3 && (ch - 0xac00) % 28 !== 0 ? '이' : '가'}`; };
const names = (ids: number[]) => ids.map((id) => CHAMPIONS[id]?.name).filter(Boolean).slice(0, 2).join('·');

/** 지금 고려할 아이템 (최대 3개, 급한 순). 이미 그 성격의 아이템이 있으면 말하지 않는다 */
export function adviseItems(g: LiveGame | null, detail: Record<number, ItemDetail> | null): ItemAdvice[] {
  const me = g?.players.find((p) => p.me);
  const c = me && CHAMPIONS[me.championId];
  if (!g || !me || !c || !detail) return [];
  const enemies = g.players.filter((p) => p.team !== me.team);
  const allies = g.players.filter((p) => p.team === me.team && !p.me);
  const sits = situationsOf(c, { allies: allies.map((p) => p.championId), enemies: enemies.map((p) => p.championId) });
  const sv = (k: SituKey) => sits.find((s) => s.key === k)?.strength ?? 0;
  const mine = new Set<ItemKind>(me.items.flatMap((id) => [...kindsOf(id, detail)]));
  const count = (k: ItemKind) => enemies.reduce((n, p) => n + p.items.filter((id) => kindsOf(id, detail).has(k)).length, 0);
  const ap = c.damage === 'AP', dealer = c.style.damage >= 2, tough = c.style.durability >= 2;
  const out: (ItemAdvice & { w: number })[] = [];
  const push = (a: ItemAdvice, w: number) => out.push({ ...a, items: a.items.filter((id) => ITEM[id]), w });

  // 1) 치유 감소: 회복이 많은 상대
  if (sv('vsHeal') >= 0.55 && !mine.has('antiHeal')) {
    const healers = enemies.filter((p) => CHAMPIONS[p.championId]?.flags.includes('heal')).map((p) => p.championId);
    push({ key: 'antiHeal', title: '치유 감소', why: `회복이 많은 상대${healers.length ? ` (${names(healers)})` : ''}`, items: tough ? [3075] : ap ? [3165] : [3033] }, sv('vsHeal') + 0.2);
  }
  // 2) 관통: 상대가 실제로 산 방어 아이템 수 (없으면 조합상 탱커)
  if (dealer) {
    const k = ap ? 'mr' : 'armor', pen = ap ? 'magicPen' : 'armorPen';
    const n = count(k);
    if (!mine.has(pen) && !mine.has('pctHp') && (n >= 2 || sv('vsTank') >= 0.55)) {
      push({ key: 'pen', title: ap ? '마법 관통' : '방어구 관통', why: n >= 2 ? `상대가 ${ap ? '마법 저항력' : '방어력'} 아이템 ${n}개` : sits.find((s) => s.key === 'vsTank')!.label, items: ap ? [3135] : [3036] }, Math.min(1, n / 4) + sv('vsTank'));
    }
  }
  // 3) 방어: 지금 가장 잘 크는 상대(킬 - 데스)의 피해 유형
  const threat = enemies.filter((p) => p.k >= 3 && p.k > p.d).sort((x, y) => (y.k - y.d) - (x.k - x.d))[0];
  const tc = threat && CHAMPIONS[threat.championId];
  if (tc && (tough || me.d >= 4)) {
    const magic = tc.damage === 'AP';
    if (magic && !mine.has('mr')) push({ key: 'def', title: '마법 저항력', why: `${iga(tc.name)} 크는 중 (${threat.k}/${threat.d}/${threat.a})`, items: tough ? [4401, 3065] : ap ? [3102] : [3156] }, 0.6 + threat.k / 20);
    if (!magic && tc.damage !== 'MIX' && !mine.has('armor')) push({ key: 'def', title: '방어력', why: `${iga(tc.name)} 크는 중 (${threat.k}/${threat.d}/${threat.a})`, items: tough ? [3143, 3110] : [3047] }, 0.6 + threat.k / 20);
  } else if (tough) {
    if (sv('vsAP') >= 0.55 && !mine.has('mr')) push({ key: 'def', title: '마법 저항력', why: '상대가 마법 피해 위주', items: [4401, 3065] }, sv('vsAP'));
    else if (sv('vsAD') >= 0.55 && !mine.has('armor')) push({ key: 'def', title: '방어력', why: '상대가 물리 피해 위주', items: [3143, 3110] }, sv('vsAD'));
  }
  // 4) 강인함: 군중 제어가 많고 많이 죽는 중
  if (sv('vsCC') >= 0.55 && !mine.has('tenacity') && me.d >= 3) push({ key: 'ten', title: '강인함', why: `상대 군중 제어가 많아요 · ${me.d}데스`, items: [3111] }, sv('vsCC'));

  return out.filter((a) => a.items.length).sort((a, b) => b.w - a.w).slice(0, 3).map(({ w: _w, ...a }) => a);
}
