/**
 * 아이템 풀이 — 증바람(아수라장) 시점에서 언제 가면 좋은지 · 효과가 어떻게 쓰이는지 (CLAUDE.md v3.166).
 * 규칙으로 만든다(AI 아님). 게임 데이터의 능력치·효과 글에 실제로 있는 것만 보고 말하고,
 * 수치·승률을 지어내지 않는다. 판단 기준(치유 감소·관통·방어)은 판 복기와 같은 kindsOf.
 */
import type { ItemDetail } from './data';
import { kindsOf } from './review';
import { ROLE_BUILD } from './build';
import { challengeRole, CHALLENGE_ROLE_KO } from './challenges';

export type ItemGuide = {
  /** 언제 가면 좋아요 (최대 3) */
  when: string[];
  /** 증바람에서는 (최대 3) */
  aram: string[];
  /** 이 아이템이 들어간 역할 기본 빌드 이름 */
  builds: string[];
};

type Rule = { test: (s: string, fx: string, k: Set<string>) => boolean; text: string };

const WHEN: Rule[] = [
  { test: (_s, _f, k) => k.has('antiHeal'), text: '상대에 회복·흡혈로 버티는 챔프가 있을 때' },
  { test: (_s, fx) => /환생|치명적인 피해를 입으면|경직 상태가|경직 상태에/.test(fx), text: '한타 한가운데서 한 번 더 버텨야 할 때' },
  { test: (_s, fx) => /생명선|체력이 \d+% 밑/.test(fx), text: '암살·돌진 챔프에게 한 번에 터지기 쉬울 때' },
  { test: (_s, _f, k) => k.has('armorPen'), text: '상대 앞라인이 방어력을 쌓아 단단할 때' },
  { test: (_s, _f, k) => k.has('magicPen'), text: '상대가 마법 저항력을 올렸을 때' },
  { test: (_s, _f, k) => k.has('pctHp'), text: '상대에 체력이 많은 탱커가 있을 때' },
  { test: (s, _f, k) => k.has('armor') && !/공격력|주문력/.test(s), text: '상대가 물리 피해 위주일 때' },
  { test: (s, _f, k) => k.has('mr') && !/공격력|주문력/.test(s), text: '상대가 마법 피해 위주일 때' },
  { test: (s, _f, k) => k.has('armor') && /공격력|주문력/.test(s), text: '딜을 넣으면서 물리 피해도 버텨야 할 때' },
  { test: (s, _f, k) => k.has('mr') && /공격력|주문력/.test(s), text: '딜을 넣으면서 마법 피해도 버텨야 할 때' },
  { test: (_s, _f, k) => k.has('tenacity'), text: '상대에 묶는 군중 제어가 많을 때' },
  { test: (_s, fx) => /둔화 효과가 \d+% 감소/.test(fx), text: '상대에 둔화가 많을 때' },
  { test: (_s, fx) => /아군/.test(fx), text: '아군을 지키고 돕는 챔프일 때' },
  { test: (s) => /생명력 흡수|모든 피해 흡혈/.test(s), text: '오래 붙어 싸우는 딜러일 때' },
];

const ARAM: Rule[] = [
  { test: (s, fx) => /생명력 흡수|체력 재생|체력을 회복/.test(s + fx), text: '귀환이 없어 버티는 힘이 그대로 이득이에요' },
  { test: (_s, fx) => /보호막/.test(fx), text: '한타가 계속 이어져 보호막이 자주 터져요' },
  { test: (_s, fx) => /주변 적|주변의 적|추가로 탄환|폭풍/.test(fx), text: '다섯이 한 길에 뭉쳐 여럿을 함께 맞히기 쉬워요' },
  { test: (_s, fx) => /처치|관여/.test(fx), text: '싸움이 잦아 처치 관여 효과가 자주 켜져요' },
  { test: (s) => /마나/.test(s), text: '상점에 못 가는 동안 마나 걱정을 덜어 줘요' },
  { test: (s) => /스킬 가속 (2\d|[3-9]\d)/.test(s), text: '한타 사이가 짧아 스킬을 자주 돌릴수록 이득이에요' },
  { test: (s, fx) => /이동 속도/.test(s + fx), text: '좁은 다리에서 들어가고 빠지는 차이가 커요' },
  { test: (_s, fx) => /유체화/.test(fx), text: '좁은 길에서 유닛에 막히지 않아요' },
  { test: (_s, fx) => /궁극기/.test(fx), text: '한타마다 궁극기를 쓰니 궁극기 효과를 자주 봐요' },
  { test: (_s, fx) => /상처/.test(fx), text: '귀환 없이 계속 싸워 상대 회복이 쌓이기 쉬워 효과가 커요' },
];

/** 위 규칙으로 두 줄이 안 될 때 능력치로 채운다 */
const WHEN_BASE: Rule[] = [
  { test: (_s, fx) => /잃은 체력/.test(fx), text: '체력이 깎인 상대를 마무리해야 할 때' },
  { test: (_s, fx) => /세 번째 기본 공격|기본 공격 시/.test(fx), text: '평타를 꾸준히 이어 치는 챔프일 때' },
  { test: (s) => /치명타 확률/.test(s), text: '평타 딜러가 치명타를 올려 갈 때' },
  { test: (s) => /공격 속도/.test(s) && !/치명타/.test(s), text: '평타를 자주 치는 챔프일 때' },
  { test: (s) => /공격력/.test(s) && /스킬 가속|관통/.test(s), text: '스킬로 끊어 치는 물리 챔프일 때' },
  { test: (s) => /주문력/.test(s) && /관통|주문력 (9\d|1\d\d)/.test(s), text: '스킬 한 방으로 큰 피해를 노릴 때' },
  { test: (s) => /주문력/.test(s) && /스킬 가속|마나/.test(s), text: '스킬을 자주 돌리는 마법 챔프일 때' },
  { test: (s) => /주문력/.test(s) && /체력/.test(s), text: '앞에서 싸우는 마법 챔프일 때' },
  { test: (s) => /체력/.test(s) && !/공격력|주문력/.test(s), text: '앞에서 오래 맞아 줘야 할 때' },
  { test: (s) => /스킬 가속/.test(s), text: '스킬을 자주 쓰는 챔프일 때' },
];
const ARAM_BASE: Rule[] = [
  { test: (s) => /치명타|공격 속도/.test(s), text: '한 길에서 계속 맞서 평타를 넣을 시간이 길어요' },
  { test: (s) => /주문력/.test(s), text: '포킹이 길게 오가 스킬을 맞히는 만큼 이득이에요' },
  { test: (s) => /공격력/.test(s), text: '싸움이 쉬지 않아 딜 아이템을 빨리 맞출수록 좋아요' },
  { test: (s) => /체력|방어력|마법 저항력/.test(s), text: '포킹을 많이 맞는 칼바람에서 버티는 힘이 돼요' },
];


export function itemGuideOf(id: number, detail: Record<number, ItemDetail> | null): ItemGuide | null {
  const d = detail?.[id];
  if (!d) return null;
  const s = d.stats.join(' '), fx = d.effects.map(([n, t]) => `${n} ${t}`).join(' ');
  const k = kindsOf(id, detail) as Set<string>;
  const hit = (rules: Rule[]) => rules.filter((r) => r.test(s, fx, k)).map((r) => r.text);
  // 같은 말을 두 번 하지 않게 (예: '평타를 꾸준히'가 있으면 '평타를 자주'는 뺀다)
  const SAME: [string, string][] = [['평타를 꾸준히', '평타를 자주 치는'], ['스킬을 자주 돌리는', '스킬을 자주 쓰는'], ['물리 피해도 버텨야', '물리 피해 위주'], ['마법 피해도 버텨야', '마법 피해 위주']];
  const pick = (rules: Rule[], base: Rule[]) => {
    const a = hit(rules);
    let out = [...new Set(a.length >= 2 ? a : [...a, ...hit(base)])];
    for (const [keep, drop] of SAME) if (out.some((x) => x.includes(keep))) out = out.filter((x) => !x.includes(drop));
    return out.slice(0, 3);
  };
  const builds = Object.values(ROLE_BUILD).filter((b) => b.core.includes(id) || b.later.includes(id) || b.boots === id).map((b) => b.label);
  return { when: pick(WHEN, WHEN_BASE), aram: pick(ARAM, ARAM_BASE), builds };
}

/** 많이 산 챔프들 → 주로 사는 역할 (예: '원딜 · 암살자') */
export function buyerRoles(champs: { c: number; n: number }[]): string {
  const t: Record<string, number> = {};
  for (const x of champs) { const r = challengeRole(x.c); if (r) t[r] = (t[r] ?? 0) + x.n; }
  return Object.entries(t).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([r]) => CHALLENGE_ROLE_KO[r as keyof typeof CHALLENGE_ROLE_KO]).join(' · ');
}
