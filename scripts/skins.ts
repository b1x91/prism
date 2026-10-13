/**
 * 프로필 꾸미기용 스킨 목록 생성: CommunityDragon ko_kr skins.json → packages/core/data/skins.json
 *   npm run data:skins   (data:mayhem 이 함께 돌린다. 패치마다)
 *
 * 형식: { version, skins: { [skinId]: [이름, 등급, 타일 경로, 일러스트 경로] } }
 *   등급(SKIN_TIERS 순서) 0 기본 · 1 일반 · 2 에픽 · 3 전설 · 4 신화 · 5 궁극 · 6 초월
 *   경로는 '/lol-game-data/assets/' 를 뗀 소문자 (cdragon() 으로 주소를 만든다)
 * 챔피언 ID = floor(skinId / 1000). 아수라장 데이터에 있는 챔피언만 넣는다.
 */
import { readFile, writeFile } from 'node:fs/promises';

const RAW = 'https://raw.communitydragon.org/latest';
const URL_SKINS = `${RAW}/plugins/rcp-be-lol-game-data/global/ko_kr/v1/skins.json`;
const OUT = new URL('../packages/core/data/skins.json', import.meta.url);
const CHAMPS = new URL('../packages/core/data/mayhem-champions.json', import.meta.url);

// 게임의 스킨 등급 → Prism 등급. 등급 없는 비기본 스킨(옛 975·750 RP 등)은 '일반'
const RARITY: Record<string, number> = { kNoRarity: 1, kRare: 1, kEpic: 2, kLegendary: 3, kMythic: 4, kUltimate: 5, kTranscendent: 6, kExalted: 6 };
const short = (p?: string) => (p ? p.replace('/lol-game-data/assets/', '').toLowerCase() : '');

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

const champs = JSON.parse(await readFile(CHAMPS, 'utf8')).champions as Record<string, unknown>;
const data = (await get(URL_SKINS)) as Record<string, { id: number; isBase?: boolean; name: string; rarity?: string; tilePath?: string; splashPath?: string }>;
const ver = await get(`${RAW}/content-metadata.json`).then((d: any) => d.version as string).catch(() => 'latest');
const skins: Record<number, [string, number, string, string]> = {};
const counts = [0, 0, 0, 0, 0, 0, 0];
for (const s of Object.values(data)) {
  if (!champs[Math.floor(s.id / 1000)] || !s.splashPath) continue;
  const tier = s.isBase ? 0 : RARITY[s.rarity ?? 'kNoRarity'] ?? 1;
  skins[s.id] = [s.name, tier, short(s.tilePath), short(s.splashPath)];
  counts[tier]++;
}
await writeFile(OUT, JSON.stringify({ version: ver, skins }));
console.log(`스킨 ${Object.keys(skins).length}개 (등급별 ${counts.join(' / ')}) → packages/core/data/skins.json`);
