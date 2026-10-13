/**
 * 아이템 이름·아이콘: CommunityDragon ko_kr items.json → packages/core/data/items.json
 *   npm run data:items   (data:mayhem 이 함께 돌린다. 패치마다)
 * 형식: { version, items: { [id]: [이름, 아이콘 경로, 가격] } }  경로는 '/lol-game-data/assets/' 를 뗀 소문자
 * 능력치·효과(마우스를 올렸을 때만 필요)는 따로: items-detail.json { [id]: [능력치 줄[], [효과 이름, 설명][]] }
 */
import { writeFile } from 'node:fs/promises';

const RAW = 'https://raw.communitydragon.org/latest';
const OUT = new URL('../packages/core/data/items.json', import.meta.url);
const OUT_DETAIL = new URL('../packages/core/data/items-detail.json', import.meta.url);

async function get(url: string) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(120_000) });
      if (!r.ok) throw new Error(`${r.status}`);
      return await r.json();
    } catch (e) {
      if (i >= 2) throw e;
      await new Promise((res) => setTimeout(res, 2000 * (i + 1)));
    }
  }
}

const data = (await get(`${RAW}/plugins/rcp-be-lol-game-data/global/ko_kr/v1/items.json`)) as { id: number; name: string; iconPath?: string; priceTotal?: number; description?: string }[];
const ver = await get(`${RAW}/content-metadata.json`).then((d: any) => d.version as string).catch(() => 'latest');
const items: Record<number, [string, string, number]> = {};
const detail: Record<number, [string[], [string, string][]]> = {};
const plain = (h: string) => h.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
// 게임 파일에서 계산값이 비어 '0'으로 나오는 곳은 '일정량'으로 (틀린 숫자를 보여주지 않게)
const noZero = (t: string) => t.replace(/\(0초\)\s*/g, '').replace(/\s0%?\s*(증가|감소|상승)/g, ' $1').replace(/\((?:0)\)/g, '').replace(/(?<![\d.~])0골드/g, '일정량의 골드').replace(/(?<![\d.~])0초\s*(동안|마다)?\s*/g, '').replace(/(?<![\d.~])0%?(?=[\s,]|의|에)/g, '일정량');
for (const it of data) {
  if (!it.iconPath || !it.name) continue;
  items[it.id] = [it.name.replace(/<[^>]+>/g, ''), it.iconPath.replace('/lol-game-data/assets/', '').toLowerCase(), it.priceTotal ?? 0];
  const d = it.description ?? '';
  // 능력치: <stats> 안의 줄들 ("공격력 75")
  const stats = (d.match(/<stats>([\s\S]*?)<\/stats>/)?.[1] ?? '').split(/<br\s*\/?>/i).map(plain).filter(Boolean);
  // 효과: <passive>/<active> 이름 뒤의 설명 (다음 효과 전까지, 너무 길면 자름)
  const effects: [string, string][] = [];
  const re = /<(passive|active)>([\s\S]*?)<\/\1>([\s\S]*?)(?=<(?:passive|active)>|<\/mainText>|$)/g;
  for (const m of d.matchAll(re)) {
    const name = plain(m[2]), text = noZero(plain(m[3]));
    if (name) effects.push([name, text.length > 160 ? `${text.slice(0, 157)}…` : text]);
  }
  if (stats.length || effects.length) detail[it.id] = [stats, effects.slice(0, 3)];
}
await writeFile(OUT, JSON.stringify({ version: ver, items }));
await writeFile(OUT_DETAIL, JSON.stringify({ version: ver, items: detail }));
console.log(`아이템 ${Object.keys(items).length}개 → packages/core/data/items.json`);
