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
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUGMENT_TAGS } from './augment-tags.js';

const RAW = 'https://raw.communitydragon.org/latest';
const PLUGIN = `${RAW}/plugins/rcp-be-lol-game-data/global/ko_kr/v1`;
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'packages', 'core', 'data');

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

async function buildAugments() {
  const [kiwi, cherry, table, lists, meta] = await Promise.all([
    get<Bin>(`${RAW}/game/maps/modespecificdata/kiwi.bin.json`),
    get<any[]>(`${PLUGIN}/cherry-augments.json`),
    get<{ entries: Record<string, string> }>(`${RAW}/game/ko_kr/data/menu/en_us/lol.stringtable.json`),
    get<any[]>(`${PLUGIN}/augment-lists.json`),
    get<{ version: string }>(`${RAW}/content-metadata.json`),
  ]);
  const st = Object.fromEntries(Object.entries(table.entries).map(([k, v]) => [k.toLowerCase(), v]));
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
      disabled: a.Enabled === false,
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

const [aug, champions] = await Promise.all([buildAugments(), buildChampions()]);
await mkdir(OUT, { recursive: true });
const stamp = new Date().toISOString();
await writeFile(join(OUT, 'mayhem-augments.json'), JSON.stringify({ version: aug.version, generatedAt: stamp, augments: aug.augments }, null, 1));
await writeFile(join(OUT, 'mayhem-champions.json'), JSON.stringify({ version: aug.version, generatedAt: stamp, champions }, null, 1));
console.log(`게임 버전 ${aug.version} · 증강 ${aug.augments.length}개 · 챔피언 ${Object.keys(champions).length}명`);
if (aug.untagged.length) console.log(`궁합 태그가 없는 증강 ${aug.untagged.length}개 (augment-tags.ts 에 추가 필요): ${aug.untagged.join(', ')}`);
