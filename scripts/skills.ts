/**
 * 챔프 스킬(기본 지속 효과 + Q·W·E·R): CommunityDragon ko_kr champions/{id}.json
 *   → packages/assets/public/skills/{id}.json (챔프 상세 '스킬' 탭이 필요할 때만 불러온다, v3.102)
 *   npm run data:skills   (data:mayhem 이 함께 돌린다. 패치마다)
 * 형식: { v, p: [이름, 아이콘, 설명], s: [[키, 이름, 아이콘, 설명, 재사용 대기시간[], 소모[], 사거리]] }
 * 설명은 게임 클라이언트 챔프 화면의 요약문(수치 없는 글). 재사용·소모는 스킬 레벨마다 (기본 스킬 5단계, 궁극기 3단계, 같으면 하나)
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';

const RAW = 'https://raw.communitydragon.org/latest';
const BASE = `${RAW}/plugins/rcp-be-lol-game-data/global/ko_kr/v1`;
const OUT = new URL('../packages/assets/public/skills/', import.meta.url);

async function get(url: string) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!r.ok) throw new Error(`${r.status}`);
      return await r.json();
    } catch (e) {
      if (i >= 2) throw e;
      await new Promise((res) => setTimeout(res, 1500 * (i + 1)));
    }
  }
}

const plain = (h = '') => h.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').split('\n').map((l) => l.trim()).join('\n').trim();
const icon = (p = '') => p.replace('/lol-game-data/assets/', '').toLowerCase();
/** 스킬 레벨 1~5 값 (6번째는 쓰지 않는 칸). 모두 같으면 하나만 */
/** 스킬 단계 수: 데이터에 없으면(대부분 0) 기본 스킬 5, 궁극기 3 (값이 4단계에서도 바뀌면 4 — 제이스·엘리스처럼) */
const levels = (s: any) => {
  if (s.maxLevel > 0) return Math.min(s.maxLevel, 5);
  if (String(s.spellKey).toLowerCase() !== 'r') return 5;
  const v: number[] = s.cooldownCoefficients ?? [];
  return v.length > 3 && v[3] !== v[2] ? 4 : 3;
};
const ranks = (v: number[] = [], max = 5) => {
  const r = v.slice(0, max).map((x) => Math.round(x * 100) / 100);
  return r.every((x) => x === r[0]) ? r.slice(0, 1) : r;
};

const ver = await get(`${RAW}/content-metadata.json`).then((d: any) => String(d.version).split('+')[0]).catch(() => 'latest');
// 우리 챔프 목록(아수라장에 나오는 챔프)만 — 요약 목록에는 시험용·봇 챔프도 섞여 있다
const champs = JSON.parse(await readFile(new URL('../packages/core/data/mayhem-champions.json', import.meta.url), 'utf8')).champions as Record<string, unknown>;
const list = Object.keys(champs).map((id) => ({ id: Number(id) }));
await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
let n = 0;
for (let i = 0; i < list.length; i += 8) {
  await Promise.all(list.slice(i, i + 8).filter((c) => c.id > 0).map(async ({ id }) => {
    const d = await get(`${BASE}/champions/${id}.json`);
    const out = {
      v: ver,
      p: [d.passive?.name ?? '', icon(d.passive?.abilityIconPath), plain(d.passive?.description)],
      s: (d.spells ?? []).map((s: any) => [
        s.spellKey?.toUpperCase() ?? '',
        s.name ?? '',
        icon(s.abilityIconPath),
        plain(s.description),
        ranks(s.cooldownCoefficients, levels(s)),
        // 소모가 없거나(0) 자원이 체력·기력 같은 것이면 숫자만 (자원 이름은 게임 데이터에 글로 없다)
        ranks(s.costCoefficients, levels(s)).every((x) => x === 0) ? [] : ranks(s.costCoefficients, levels(s)),
        Math.round(s.range?.[0] ?? 0),
      ]),
    };
    await writeFile(new URL(`${id}.json`, OUT), JSON.stringify(out));
    n++;
  }));
}
console.log(`챔프 스킬 ${n}명 → packages/assets/public/skills/ (게임 데이터 ${ver})`);
