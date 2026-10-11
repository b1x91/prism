/**
 * 챔피언·아이템·증강 이름과 아이콘.
 *
 * 우선순위:
 *   1. 이 PC 의 캐시 (~/.prism/static.json, ~/.prism/assets/)
 *   2. 롤 클라이언트(LCU) — 게임 중이 아닐 때만. 받으면 캐시에 저장한다
 *   3. CommunityDragon — 클라이언트 자료를 그대로 옮겨둔 공개 서버. 클라이언트가 꺼져 있고 캐시도 없을 때만
 * 그래서 클라이언트가 꺼져 있거나 게임 중이어도 썸네일이 보인다.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PRISM_DIR } from './config.js';
import { lcuAsset, lcuGet, type LcuCreds } from './lcu.js';

const CDRAGON = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global';
const ASSET_PREFIX = '/lol-game-data/assets/';
const TIMEOUT_MS = 10_000;
const STATIC_FILE = join(PRISM_DIR, 'static.json');
const ASSET_DIR = join(PRISM_DIR, 'assets');

export type Statics = {
  champions: Record<number, { name: string; icon?: string }>;
  items: Record<number, { name: string; icon?: string }>;
  augments: Record<number, { name: string; icon?: string; rarity?: string }>;
};

export const statics: Statics = { champions: {}, items: {}, augments: {} };

/** 원본 목록(LCU·CommunityDragon 공통 형식)을 statics 로 옮긴다 */
function apply(champs: any[], items: any[], augs: any[]) {
  for (const x of champs) if (x.id > 0) statics.champions[x.id] = { name: x.name, icon: x.squarePortraitPath };
  for (const x of items) statics.items[x.id] = { name: x.name, icon: x.iconPath };
  for (const x of augs) statics.augments[x.id] = { name: x.nameTRA ?? x.name ?? `#${x.id}`, icon: x.augmentSmallIconPath, rarity: x.rarity };
}

const hasChampions = () => Object.keys(statics.champions).length > 0;

async function save() {
  await mkdir(PRISM_DIR, { recursive: true });
  await writeFile(STATIC_FILE, JSON.stringify(statics));
}

/** 앱 시작 때 캐시를 읽는다 */
export async function loadCachedStatics() {
  try {
    const c = JSON.parse(await readFile(STATIC_FILE, 'utf8')) as Statics;
    Object.assign(statics.champions, c.champions);
    Object.assign(statics.items, c.items);
    Object.assign(statics.augments, c.augments);
  } catch {
    /* 캐시 없음 */
  }
}

/** 클라이언트에서 최신 목록을 받아 캐시에 저장한다 (패치 반영) */
export async function loadStaticsFromClient(c: LcuCreds) {
  const get = (path: string) => lcuGet<any[]>(c, path).catch(() => []);
  const [champs, items, augs] = await Promise.all([
    get('/lol-game-data/assets/v1/champion-summary.json'),
    get('/lol-game-data/assets/v1/items.json'),
    get('/lol-game-data/assets/v1/cherry-augments.json'),
  ]);
  if (!champs.length) return false;
  apply(champs, items, augs);
  await save().catch(() => {});
  return true;
}

async function fetchWithRetry(url: string): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (r.ok || attempt >= 1) return r;
    } catch (e) {
      if (attempt >= 1) throw e;
    }
    await new Promise((ok) => setTimeout(ok, 1000));
  }
}

let lastCdragonTry = 0;
/** 캐시도 클라이언트도 없을 때 CommunityDragon 에서 목록을 받는다 (10분에 1번까지 시도) */
export async function loadStaticsFromCdragon() {
  if (hasChampions() || Date.now() - lastCdragonTry < 10 * 60_000) return;
  lastCdragonTry = Date.now();
  try {
    const get = async (path: string) => {
      const r = await fetchWithRetry(`${CDRAGON}/ko_kr${path}`);
      return r.ok ? ((await r.json()) as any[]) : [];
    };
    const [champs, items, augs] = await Promise.all([get('/v1/champion-summary.json'), get('/v1/items.json'), get('/v1/cherry-augments.json')]);
    if (!champs.length) return;
    apply(champs, items, augs);
    await save().catch(() => {});
  } catch (e) {
    console.error('[CommunityDragon]', e instanceof Error ? e.message : e);
  }
}

const TYPES: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

/**
 * 아이콘 한 장. 캐시 → 클라이언트(게임 중 아닐 때) → CommunityDragon 순서.
 * 받은 것은 캐시에 저장한다. 없으면 null.
 */
export async function getAsset(path: string, creds: LcuCreds | null, inGame: boolean): Promise<{ type: string; body: Buffer } | null> {
  if (!path.startsWith(ASSET_PREFIX) || path.includes('..')) return null;
  const ext = (path.match(/\.[a-z0-9]+$/i)?.[0] ?? '.png').toLowerCase();
  const type = TYPES[ext] ?? 'application/octet-stream';
  const file = join(ASSET_DIR, createHash('sha1').update(path.toLowerCase()).digest('hex') + ext);

  const cached = await readFile(file).catch(() => null);
  if (cached) return { type, body: cached };

  let body: Buffer | null = null;
  if (creds && !inGame) {
    body = await lcuAsset(creds, path)
      .then((r) => r.body)
      .catch(() => null);
  }
  if (!body) {
    // 클라이언트 경로 /lol-game-data/assets/X 는 CommunityDragon 의 global/default/X (소문자) 와 같은 자료다
    const url = `${CDRAGON}/default/${path.slice(ASSET_PREFIX.length).toLowerCase()}`;
    body = await fetchWithRetry(url)
      .then(async (r) => (r.ok ? Buffer.from(await r.arrayBuffer()) : null))
      .catch(() => null);
  }
  if (!body) return null;
  await mkdir(ASSET_DIR, { recursive: true });
  await writeFile(file, body).catch(() => {});
  return { type, body };
}
