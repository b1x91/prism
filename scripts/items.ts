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
// 게임 문구표 (설명이 'GeneratedTip_Item_…' 같은 키로만 들어 있는 아이템, {{ Item_Keyword_OnHit }} 같은 끼워 넣는 문구)
const table = (await get(`${RAW}/game/ko_kr/data/menu/en_us/lol.stringtable.json`)) as { entries: Record<string, string> };
const ST: Record<string, string> = Object.fromEntries(Object.entries(table.entries).map(([k, v]) => [k.toLowerCase(), v]));
/** 키만 있는 설명을 문구로, {{ 키 }} 를 문구로 (3단계까지). 못 찾은 {{ }} 는 지운다 */
const resolve = (d: string) => {
  let s = /^[A-Za-z0-9_]+$/.test(d.trim()) ? ST[d.trim().toLowerCase()] ?? '' : d;
  for (let i = 0; i < 3; i++) s = s.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_, k: string) => ST[k.toLowerCase()] ?? '\u00a4');
  // 게임 중에만 정해지는 값(@이름@, 근접/원거리로 갈리는 {{ … }})은 '일정량'. 이어 붙은 것('¤+¤')은 하나로
  s = s.replace(/\{\{[^}]*\}\}/g, '\u00a4').replace(/@[A-Za-z0-9_.*]+@/g, '\u00a4').replace(/\u00a4(\s*[+×x*]\s*\u00a4)+/g, '\u00a4');
  // 예전 신화급 문구가 남은 설명 줄은 뺀다 (지금 게임에 없는 규칙)
  s = s.replace(/[^<>.]*신화급[^<>.]*\.?/g, '');
  return s.replace(/\u00a4/g, '일정량');
};
const ver = await get(`${RAW}/content-metadata.json`).then((d: any) => d.version as string).catch(() => 'latest');
const items: Record<number, [string, string, number]> = {};
const detail: Record<number, [string[], [string, string][]]> = {};
const plain = (h: string) => h.replace(/%i:[A-Za-z]+%/g, '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').replace(/\(일정량초\)\s*/g, '').trim();
// 게임 파일에서 계산값이 비어 '0'으로 나오는 곳은 '일정량'으로 (틀린 숫자를 보여주지 않게)
const noZero = (t: string) => t.replace(/\(0초\)\s*/g, '').replace(/\s0%?\s*(증가|감소|상승)/g, ' $1').replace(/\((?:0)\)/g, '').replace(/(?<![\d.~])0골드/g, '일정량의 골드').replace(/(?<![\d.~])0초\s*(동안|마다)?\s*/g, '').replace(/(?<![\d.~])0%?(?=[\s,]|의|에)/g, '일정량');
for (const it of data) {
  if (!it.iconPath || !it.name) continue;
  items[it.id] = [it.name.replace(/<[^>]+>/g, ''), it.iconPath.replace('/lol-game-data/assets/', '').toLowerCase(), it.priceTotal ?? 0];
  const d = resolve(it.description ?? '');
  // 능력치: <stats> 안의 줄들 ("공격력 75")
  const stats = (d.match(/<stats>([\s\S]*?)<\/stats>/)?.[1] ?? '').split(/<br\s*\/?>/i).map(plain).filter(Boolean);
  // 효과: <passive>/<active> 이름 뒤의 설명 (다음 효과 전까지, 너무 길면 자름)
  const effects: [string, string][] = [];
  const re = /<(passive|active|jadeUnique|unique)>([\s\S]*?)<\/\1>([\s\S]*?)(?=<(?:passive|active|jadeUnique|unique)>|<rules>|<flavorText>|<\/mainText>|$)/g;
  const cut = (t: string) => (t.length > 160 ? `${t.slice(0, 157)}…` : t);
  for (const m of d.matchAll(re)) {
    const name = plain(m[2]).replace(/[:：]\s*$/, ''), text = noZero(plain(m[3]));
    if (name) effects.push([name, cut(text)]);
  }
  // 효과 이름 표시 없이 글만 있는 아이템 (예: '기본 공격과 궁극기 이외의 스킬이 중첩을 부여합니다.')
  if (!effects.length) {
    const rest = noZero(plain(d.replace(/<stats>[\s\S]*?<\/stats>/, '').replace(/<(rules|flavorText)>[\s\S]*?<\/\1>/g, '')));
    if (rest) effects.push(['효과', cut(rest)]);
  }
  if (stats.length || effects.length) detail[it.id] = [stats, effects.slice(0, 3)];
}
await writeFile(OUT, JSON.stringify({ version: ver, items }));
await writeFile(OUT_DETAIL, JSON.stringify({ version: ver, items: detail }));
console.log(`아이템 ${Object.keys(items).length}개 → packages/core/data/items.json`);
