/**
 * 아이템 이름·아이콘: CommunityDragon ko_kr items.json → packages/core/data/items.json
 *   npm run data:items   (data:mayhem 이 함께 돌린다. 패치마다)
 * 형식: { version, items: { [id]: [이름, 아이콘 경로, 가격] } }  경로는 '/lol-game-data/assets/' 를 뗀 소문자
 */
import { writeFile } from 'node:fs/promises';

const RAW = 'https://raw.communitydragon.org/latest';
const OUT = new URL('../packages/core/data/items.json', import.meta.url);

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

const data = (await get(`${RAW}/plugins/rcp-be-lol-game-data/global/ko_kr/v1/items.json`)) as { id: number; name: string; iconPath?: string; priceTotal?: number }[];
const ver = await get(`${RAW}/content-metadata.json`).then((d: any) => d.version as string).catch(() => 'latest');
const items: Record<number, [string, string, number]> = {};
for (const it of data) {
  if (!it.iconPath || !it.name) continue;
  items[it.id] = [it.name.replace(/<[^>]+>/g, ''), it.iconPath.replace('/lol-game-data/assets/', '').toLowerCase(), it.priceTotal ?? 0];
}
await writeFile(OUT, JSON.stringify({ version: ver, items }));
console.log(`아이템 ${Object.keys(items).length}개 → packages/core/data/items.json`);
