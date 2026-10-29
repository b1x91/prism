/**
 * 아이템 도감 목록 (CLAUDE.md v3.119) → packages/core/data/item-dex.json
 * 상점에서 살 수 있는 완성 아이템(2200골드 이상)과 2단계 신발만. 아레나 전용·오른 강화·바뀐 모습(무라마나 등)은 뺀다.
 * 게임 파일(items.cdtb.bin.json)의 상점 판매 여부·아이템 묶음으로 거르고, 이름·가격은 items.json 그대로.
 * 패치마다 data:mayhem 이 함께 돌린다.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BIN = 'https://raw.communitydragon.org/latest/game/items.cdtb.bin.json';
const LIST = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/ko_kr/v1/items.json';
const BOOTS = new Set([3006, 3009, 3010, 3013, 3020, 3047, 3111, 3158]);

const items = (JSON.parse(await readFile(join(ROOT, 'packages/core/data/items.json'), 'utf8')) as { items: Record<string, [string, string, number]> }).items;
const res = await fetch(BIN);
if (!res.ok) throw new Error(`items.cdtb.bin.json ${res.status}`);
const bin = (await res.json()) as Record<string, { mItemDataAvailability?: { mInStore?: boolean }; mItemGroups?: string[] }>;

const cats = Object.fromEntries(((await (await fetch(LIST)).json()) as { id: number; categories?: string[] }[]).map((x) => [x.id, x.categories ?? []]));
/** 도감 유형: 신발 · 마법 · 물리 · 방어 · 지원 (게임 데이터의 분류로) */
const groupOf = (id: number): string => {
  const c = new Set(cats[id] ?? []);
  if (BOOTS.has(id) || c.has('Boots')) return 'boots';
  if (c.has('ManaRegen') && !c.has('Damage') && !c.has('CriticalStrike') && !c.has('AttackSpeed') && !(c.has('SpellDamage') && !c.has('Health'))) return 'support';
  if (c.has('SpellDamage')) return 'ap';
  if (c.has('Damage') || c.has('CriticalStrike') || c.has('AttackSpeed') || c.has('ArmorPenetration')) return 'ad';
  if (c.has('Armor') || c.has('SpellBlock') || c.has('Health')) return 'tank';
  return 'support';
};
const ids: number[] = [];
for (const [k, [, , price]] of Object.entries(items)) {
  const id = Number(k);
  if (id >= 10000 || (id >= 7000 && id < 8000)) continue;          // 모드 전용 번호·오른 강화
  if (!(price >= 2200 || BOOTS.has(id)) || price >= 7000) continue; // 완성 아이템·신발 (황금 뒤집개 같은 특수 아이템 제외)
  const b = bin[`Items/${id}`];
  if (!b?.mItemDataAvailability?.mInStore) continue;               // 상점에서 사지 않는 것 (바뀐 모습)
  if ((b.mItemGroups ?? []).some((g) => g.includes('Arena'))) continue;
  ids.push(id);
}
ids.sort((a, b) => a - b);
const group = Object.fromEntries(ids.map((id) => [id, groupOf(id)]));
await writeFile(join(ROOT, 'packages/core/data/item-dex.json'), JSON.stringify({ ids, group }) + '\n');
console.log(`아이템 도감 ${ids.length}개`);
