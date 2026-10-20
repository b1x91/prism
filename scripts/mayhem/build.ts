/**
 * 아수라장(내부 이름 KIWI) 증강·챔피언 데이터 생성.
 *
 *   npm run data:mayhem
 *
 * 출처: CommunityDragon (롤 게임 파일을 그대로 풀어둔 공개 미러). 게임 데이터만 쓴다 — 회원 전적과 무관해서 공개층에 써도 된다.
 *   - 증강 정의:   game/maps/modespecificdata/kiwi.bin.json   (이름·설명 키, 수치, 아이콘, 비활성 여부)
 *   - 등급·아이콘: plugins/.../ko_kr/v1/cherry-augments.json (클라이언트가 쓰는 ID 와 같다)
 *   - 한국어 문구: game/ko_kr/data/menu/en_us/lol.stringtable.json
 *   - 챔피언:      plugins/.../ko_kr/v1/champions/{id}.json  (역할, 피해 유형, 스킬 설명)
 * 궁합 태그는 사람이 붙인 표(augment-tags.ts)를 합친다.
 *
 * 결과: packages/core/data/mayhem-augments.json, packages/core/data/mayhem-champions.json
 */
import { createXXHash3 } from 'hash-wasm';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUGMENT_TAGS } from './augment-tags.js';

// CDRAGON=pbe 로 다음 패치(PBE)만 따로 받을 수 있다. OUT 을 주면 그 폴더에 쓴다 (비교용)
// NEXT=pbe (+ NEXT_AT=ISO 시각) 이면 라이브 데이터에 다음 패치의 새 증강(added)·빠지는 증강(removed)을 표시해 합친다 (v3.101)
const CDN = (branch: string) => `https://raw.communitydragon.org/${branch}`;
const RAW = CDN(process.env.CDRAGON ?? 'latest');
const plugin = (raw: string) => `${raw}/plugins/rcp-be-lol-game-data/global/ko_kr/v1`;
const PLUGIN = plugin(RAW);
const OUT = process.env.OUT ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'packages', 'core', 'data');

async function get<T>(url: string): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(120_000) });
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return (await r.json()) as T;
    } catch (e) {
      if (i >= 2) throw e;
      await new Promise((ok) => setTimeout(ok, 2000 * (i + 1)));
    }
  }
}

// ───────── 증강 ─────────

/** 게임 문구표의 키 = 소문자 키의 xxh3-64 하위 38비트 ('{%010x}'). 16.21 PBE 문구표에서 확인 (2026-10-20) */
async function stringKeyHasher(): Promise<(key: string) => string> {
  const h = await createXXHash3();
  const mask = (1n << 38n) - 1n;
  return (key) => {
    h.init(); h.update(key.toLowerCase());
    return `{${(BigInt(`0x${h.digest('hex')}`) & mask).toString(16).padStart(10, '0')}}`;
  };
}

type Bin = Record<string, any>;
const RARITY: Record<string, string> = { kSilver: 'silver', kGold: 'gold', kPrismatic: 'prismatic' };

/** 수치 표시: 레벨별 값이 같으면 하나, 다르면 "최소~최대" */
function fmtValue(values: number[], mul: number): string {
  const vs = (values.length > 1 ? values.slice(1) : values).map((v) => Math.round(v * mul * 100) / 100);
  const a = vs[0], b = vs[vs.length - 1];
  return a === b ? String(a) : `${a}~${b}`;
}

/**
 * 툴팁 문구를 읽을 수 있는 글로.
 * - {{키}} 는 문구표에서 다시 찾는다 (최대 3단계)
 * - @이름*배수@ 는 증강 주문의 수치로 바꾼다. 게임 중에만 계산되는 값(현재 피해량 등)은 풀 수 없으므로 그 줄을 지우거나 "일정량"으로 둔다
 */
function cleanText(raw: string, st: Record<string, string>, values: Record<string, number[]>): string {
  let s = raw.replace(/\{\{\s*SpellName\s*\}\}/gi, '선택한 스킬').replace(/\{\{\s*Item_Keyword_OnHit\s*\}\}/gi, '적중 시 효과');
  for (let depth = 0; depth < 3; depth++) {
    s = s.replace(/\{\{\s*([A-Za-z0-9_]+)(@[^@]*@)?\s*\}\}/g, (_, key: string, lv?: string) => {
      const k = key.toLowerCase();
      return st[k] ?? (lv ? st[`${k}1`] ?? st[`${k}_1`] : undefined) ?? (k === 'spellname' ? '선택한 스킬' : k === 'item_keyword_onhit' ? '적중 시 효과' : '');
    });
  }
  s = s.replace(/@SpellName@/gi, '선택한 스킬').replace(/@f\d+(\.\d+)?@/g, '?');
  s = s.replace(/@([A-Za-z0-9_.]+)(?:\*(-?[0-9.]+))?@/g, (_, name: string, mul?: string) => {
    const v = values[name.toLowerCase()];
    return v ? fmtValue(v, mul ? Number(mul) : 1) : '?';
  });
  s = s.replace(/%i:[A-Za-z]+%/g, '').replace(/%%/g, '%');
  s = s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
  const lines = s
    .split('\n')
    .map((l) => l.trim())
    // "입힌 피해량: ?" 처럼 게임 중 집계 줄, 장식 줄은 뺀다
    .filter((l) => l && !/^[^:：]{1,20}[:：]\s*(\?|총 \?|%)?\s*$/.test(l) && !/^-{5,}$/.test(l) && !/[:：]\s*\?\s*(\/|$)/.test(l));
  return [...new Set(lines)]
    .join('\n')
    .replace(/선택한 스킬 스킬/g, '선택한 스킬')
    .replace(/\(최대 \?\)/g, '')
    .replace(/\?회/g, '여러 번')
    .replace(/\?골드/g, '골드')
    .replace(/\?초로/g, '더 짧게')
    .replace(/\(\?\)/g, '')
    .replace(/\?\+/g, '')
    .replace(/\?의 /g, '일정량의 ')
    .replace(/\?만큼/g, '일정량만큼')
    .replace(/\?초/g, '일정 시간')
    .replace(/\?까지/g, '일정 수준까지')
    .replace(/\? 증가/g, '증가')
    .replace(/\?/g, '일정량')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** 툴팁이 게임 중 수치만 참조하는 껍데기({{키@f1@}})면 설명 문구를 쓴다 */
function pickText(st: Record<string, string>, a: any): string {
  const tip = st[String(a.AugmentTooltipTra).toLowerCase()] ?? '';
  const desc = st[String(a.DescriptionTra).toLowerCase()] ?? '';
  return !tip || /^\s*\{\{[^}]*@f\d+@\s*\}\}/.test(tip) ? desc || tip : tip;
}

async function buildAugments(raw = RAW) {
  const [kiwi, cherry, table, lists, meta] = await Promise.all([
    get<Bin>(`${raw}/game/maps/modespecificdata/kiwi.bin.json`),
    get<any[]>(`${plugin(raw)}/cherry-augments.json`),
    get<{ entries: Record<string, string> }>(`${raw}/game/ko_kr/data/menu/en_us/lol.stringtable.json`),
    get<any[]>(`${plugin(raw)}/augment-lists.json`),
    get<{ version: string }>(`${raw}/content-metadata.json`),
  ]);
  // 새 문구는 이름 대신 '{해시}' 키로만 들어 있다 (CommunityDragon 이 아직 이름을 모르는 키) — 이름으로 못 찾으면 해시로 찾는다
  const plain: Record<string, string> = Object.fromEntries(Object.entries(table.entries).map(([k, v]) => [k.toLowerCase(), v]));
  const hashKey = await stringKeyHasher();
  const st = new Proxy(plain, { get: (t, k) => (typeof k === 'string' ? t[k] ?? t[hashKey(k)] : undefined) });
  const byId = new Map(cherry.map((c) => [c.id, c]));
  const inMode = new Set((lists.find((l) => l.modeName === 'KIWI')?.augmentList ?? []).map((p: string) => p.split('/').pop()));

  const spellValues = (path: string | undefined) => {
    const out: Record<string, number[]> = {};
    for (const dv of kiwi[path ?? '']?.mSpell?.DataValues ?? []) out[String(dv.name).toLowerCase()] = dv.values ?? [0];
    return out;
  };

  const augments = [];
  const untagged: string[] = [];
  for (const a of Object.values(kiwi)) {
    if (a?.__type !== 'AugmentData' || !inMode.has(a.AugmentNameId)) continue;
    const values: Record<string, number[]> = {};
    for (const sp of [a.RootSpell, ...(a.AdditionalSpells ?? [])]) for (const [k, v] of Object.entries(spellValues(sp))) values[k] ??= v;
    const c = byId.get(a.AugmentPlatformId);
    const fit = AUGMENT_TAGS[a.AugmentNameId];
    if (!fit) untagged.push(a.AugmentNameId);
    augments.push({
      id: a.AugmentPlatformId as number,
      key: a.AugmentNameId as string,
      name: st[String(a.NameTra).toLowerCase()] ?? a.AugmentNameId,
      rarity: RARITY[c?.rarity] ?? 'silver',
      icon: c?.augmentSmallIconPath ?? null,
      desc: cleanText(pickText(st, a), st, values),
      tags: fit?.tags ?? [],
      note: fit?.note ?? '',
      ability: !!a.IsAbilityAugment, // 선택한 스킬 하나를 강화하는 증강
      quest: !!a.QuestData,
      // 한국어 이름이 없는 항목(게임 안 자리표시, 예: GoH_PentakillAug_Generic)은 목록·인식에서 뺀다
      disabled: a.Enabled === false || st[String(a.NameTra).toLowerCase()] == null,
    });
  }
  augments.sort((x, y) => x.id - y.id);
  return { version: meta.version.split('+')[0], augments, untagged };
}

// ───────── 챔피언 ─────────

/** 스킬 설명에서 증강 조건에 쓰는 특성을 찾는다 (한국어 설명 기준) */
const FLAGS: Record<string, RegExp> = {
  cc: /기절|속박|공중에 띄|에어본|매혹|공포에 빠|제압|도발|수면|변이|이동 불가|띄워 올|끌어당/,
  dash: /돌진|도약|순간이동|뛰어올라|뛰어들|달려들|날아올라|미끄러지/,
  shield: /보호막/,
  heal: /체력을 회복|체력을 \S+ 회복|회복합니다|생명력 흡수|모든 피해 흡혈/,
  channel: /정신 집중/,
  burn: /화상|중독|독 피해|지속 피해/,
  knockback: /뒤로 밀어|밀어냅|밀쳐|밀려나/,
  empower: /다음 기본 공격|기본 공격이 강화|강화된 기본 공격|다음 공격/,
  onhit: /적중 시 효과/,
};
/**
 * 설명 문구로는 가려내기 어려운 조건은 챔피언 이름(alias)으로 지정한다.
 * 증강 설명의 대상: 소환물(소환술사), 영구 중첩(다단 중첩), 지형 생성(지형 생성됨), 회전 스킬(승리를 위한 회전)
 */
const BY_ALIAS: Record<string, string[]> = {
  summon: ['Annie', 'Yorick', 'Zyra', 'Heimerdinger', 'Malzahar', 'Ivern', 'Shaco', 'Elise', 'Azir', 'Illaoi', 'Naafiri', 'Maokai', 'Fiddlesticks', 'Teemo', 'Kalista'],
  stack: ['Nasus', 'Veigar', 'Chogath', 'Sion', 'Senna', 'Thresh', 'Kindred', 'Bard', 'Smolder', 'Swain', 'AurelionSol', 'Belveth'],
  terrain: ['Anivia', 'Azir', 'Taliyah', 'Trundle', 'JarvanIV', 'Ornn', 'Yorick'],
  spin: ['Garen', 'Katarina', 'Darius'], // 확실한 회전 스킬만. 실제 적용 범위는 게임에서 확인 필요
};

/** 아군에게 회복·보호막을 주는가 (같은 스킬 설명 안에 "아군"과 회복/보호막이 함께 있을 때) */
const ALLY = /아군[^.]{0,40}(체력을 회복|보호막|회복시)|(보호막|체력을 회복)[^.]{0,40}아군/;

async function buildChampions() {
  // 1~999 가 실제 챔피언 (그 위는 아레나 보스·봇 등)
  const summary = (await get<any[]>(`${PLUGIN}/champion-summary.json`)).filter((c) => c.id > 0 && c.id < 1000);
  const champions: Record<number, unknown> = {};
  for (let i = 0; i < summary.length; i += 8) {
    await Promise.all(
      summary.slice(i, i + 8).map(async (s) => {
        const d = await get<any>(`${PLUGIN}/champions/${s.id}.json`).catch(() => null);
        if (!d) return;
        const texts = [d.passive, ...(d.spells ?? [])].map((x: any) => `${x?.description ?? ''} ${(x?.dynamicDescription ?? '').replace(/<[^>]+>/g, '')}`);
        const all = texts.join(' ');
        const flags = Object.entries(FLAGS)
          .filter(([, re]) => re.test(all))
          .map(([k]) => k);
        if (texts.some((t) => ALLY.test(t))) flags.push('ally');
        for (const [flag, names] of Object.entries(BY_ALIAS)) if (names.includes(d.alias)) flags.push(flag);
        const t = d.tacticalInfo ?? {}, p = d.playstyleInfo ?? {};
        champions[s.id] = {
          name: d.name,
          alias: d.alias,
          roles: d.roles ?? [],
          damage: { kMagic: 'AP', kPhysical: 'AD', kMixed: 'MIX' }[t.damageType as string] ?? null,
          range: t.attackType === 'ranged' ? 'ranged' : 'melee',
          style: { damage: p.damage ?? 1, durability: p.durability ?? 1, cc: p.crowdControl ?? 1, mobility: p.mobility ?? 1, utility: p.utility ?? 1 },
          flags,
          // 기본 스킨 일러스트 (클라이언트·CommunityDragon 공통 경로)
          splash: d.skins?.[0]?.splashPath ?? null,
          tile: d.skins?.[0]?.tilePath ?? null,
        };
      }),
    );
  }
  return champions;
}

// ───────── 패치 사이 합치기 (v3.101) ─────────
type Aug = Awaited<ReturnType<typeof buildAugments>>['augments'][number] & { added?: string; removed?: string; seen?: string };
const verNum = (v: string) => v.split('.').slice(0, 2).map(Number);
const newer = (a: string, b: string) => { const [x, y] = [verNum(a), verNum(b)]; return x[0] !== y[0] ? x[0] > y[0] : x[1] > y[1]; };
const short = (v: string) => v.split('.').slice(0, 2).join('.');

/**
 * 이전 데이터(prev) · 라이브(live) · 다음 패치(next, 선택)를 합친다.
 *  - added: 처음 보인 패치 (새로운 증강 거르기). 라이브에 있고 이전 데이터에 없으면 라이브 패치, 다음 패치에만 있으면 다음 패치
 *  - removed: 빠진(빠질) 패치. 지난 판 기록의 이름·아이콘을 위해 데이터에는 남긴다
 *  - seen: 마지막으로 보인 패치 (빠진 증강 아이콘을 그 패치 폴더에서 받는다)
 */
function merge(prev: { version: string; augments: Aug[] } | null, live: { version: string; augments: Aug[] }, next: { version: string; augments: Aug[] } | null): Aug[] {
  const L = short(live.version), N = next ? short(next.version) : null;
  const byPrev = new Map((prev?.augments ?? []).map((a) => [a.id, a]));
  const inLive = new Set(live.augments.map((a) => a.id)), inNext = new Set((next?.augments ?? []).map((a) => a.id));
  const out: Aug[] = live.augments.map((a) => {
    const p = byPrev.get(a.id);
    const added = p?.added ?? (prev && !p ? L : undefined);
    const removed = next && !inNext.has(a.id) ? N! : undefined;
    return { ...a, ...(added ? { added } : {}), ...(removed ? { removed } : {}), seen: L };
  });
  for (const a of next?.augments ?? []) if (!inLive.has(a.id)) out.push({ ...a, added: N!, seen: N! });
  const prevV = prev ? short(prev.version) : L;
  for (const p of prev?.augments ?? []) {
    if (inLive.has(p.id) || inNext.has(p.id)) continue;
    if (p.added && newer(p.added, L) && !next) continue; // 나온다던 증강이 다음 패치에서 빠짐 → 버린다
    out.push({ ...p, removed: p.removed ?? L, seen: p.seen ?? prevV });
  }
  return out.sort((x, y) => x.id - y.id);
}

const NEXT = process.env.NEXT;
const prevFile = join(OUT, 'mayhem-augments.json');
const prev = await readFile(prevFile, 'utf8').then((t) => JSON.parse(t) as { version: string; augments: Aug[] }).catch(() => null);
const [live, next, champions] = await Promise.all([buildAugments(), NEXT ? buildAugments(CDN(NEXT)) : Promise.resolve(null), buildChampions()]);
const augments = merge(prev, live, next && newer(next.version, live.version) ? next : null);
const nextInfo = next && newer(next.version, live.version) ? { version: short(next.version), at: process.env.NEXT_AT ? Date.parse(process.env.NEXT_AT) : null } : null;
await mkdir(OUT, { recursive: true });
const stamp = new Date().toISOString();
await writeFile(join(OUT, 'mayhem-augments.json'), JSON.stringify({ version: live.version, generatedAt: stamp, ...(nextInfo ? { next: nextInfo } : {}), augments }, null, 1));
await writeFile(join(OUT, 'mayhem-champions.json'), JSON.stringify({ version: live.version, generatedAt: stamp, champions }, null, 1));
console.log(`게임 버전 ${live.version}${nextInfo ? ` (+ 다음 패치 ${nextInfo.version})` : ''} · 증강 ${augments.length}개 (새 ${augments.filter((a) => a.added).length} · 빠짐 ${augments.filter((a) => a.removed).length}) · 챔피언 ${Object.keys(champions).length}명`);
const untagged = [...new Set([...live.untagged, ...(next?.untagged ?? [])])];
if (untagged.length) console.log(`궁합 태그가 없는 증강 ${untagged.length}개 (augment-tags.ts 에 추가 필요): ${untagged.join(', ')}`);
