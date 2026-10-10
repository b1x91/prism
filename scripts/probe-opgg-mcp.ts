/**
 * op.gg 공식 MCP 검증 스크립트 (CLAUDE.md 7-2절)
 *
 * 확인 항목:
 *   1. lol-summoner-game-history 가 아수라장(queueId 2400) 판을 포함하는가
 *   2. 판당 필드 — 챔피언·승패·KDA / 증강 / 아이템 / 딜량·받은 딜 / 10명 전원
 *   3. 몇 판까지 오는가
 *   4. 응답 속도와 호출 제한
 *   5. 서버 측 약관·용도 안내 문구
 *
 * 사용법:
 *   npm run probe:opgg -- --riot "게임이름#태그" [--region kr] [--renew] [--burst 10] [--args '{"k":"v"}']
 *
 *   --riot   조회할 Riot ID. 아수라장을 최근에 한 계정이어야 1번 항목을 판정할 수 있다.
 *   --region 기본 kr
 *   --renew  game-history 전에 lol-summoner-renewal 호출
 *   --burst  game-history 를 N회 연속 호출해 지연·제한 응답을 측정 (기본 0)
 *   --args   도구 인자를 자동 추론하지 못할 때 직접 지정 (JSON, 모든 lol 도구에 병합)
 *
 * 원본 응답은 전부 scripts/out/ 에 저장한다. 자동 판정은 휴리스틱이므로
 * 최종 보고 전에 원본을 반드시 눈으로 확인한다.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const MCP_URL = 'https://mcp-api.op.gg/mcp';
const TIMEOUT_MS = 60_000;
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'out');

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type ToolInfo = { name: string; description?: string; inputSchema: { properties?: Record<string, unknown>; required?: string[] } };

const { values: opt } = parseArgs({
  options: {
    riot: { type: 'string' },
    region: { type: 'string', default: 'kr' },
    renew: { type: 'boolean', default: false },
    burst: { type: 'string', default: '0' },
    args: { type: 'string' },
  },
});

function save(name: string, data: unknown) {
  mkdirSync(OUT_DIR, { recursive: true });
  const path = join(OUT_DIR, name);
  writeFileSync(path, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  return path;
}

/** 스키마 속성 이름으로 인자를 추론한다. 못 채운 required 는 missing 으로 돌려준다. */
function buildArgs(tool: ToolInfo, gameName: string, tagLine: string, region: string, extra: Record<string, unknown>) {
  const props = Object.keys(tool.inputSchema.properties ?? {});
  const args: Record<string, unknown> = {};
  for (const p of props) {
    const k = p.toLowerCase().replace(/[^a-z]/g, '');
    if (k === 'gamename' || k === 'summonername' || k === 'name') args[p] = gameName;
    else if (k === 'tagline' || k === 'tag') args[p] = tagLine;
    else if (k === 'riotid') args[p] = `${gameName}#${tagLine}`;
    else if (k === 'region' || k === 'server' || k === 'platform') args[p] = region;
    else if (k === 'lang' || k === 'language' || k === 'locale') args[p] = 'ko_KR';
  }
  Object.assign(args, Object.fromEntries(Object.entries(extra).filter(([k]) => props.includes(k))));
  const missing = (tool.inputSchema.required ?? []).filter((r) => !(r in args));
  return { args, missing };
}

/** 응답 content 에서 텍스트를 모으고, JSON 으로 파싱되는 것은 파싱한다. */
function extract(result: any): { text: string; json: Json[] } {
  const texts: string[] = [];
  const json: Json[] = [];
  if (result?.structuredContent) json.push(result.structuredContent);
  for (const c of result?.content ?? []) {
    if (c.type !== 'text') continue;
    texts.push(c.text);
    try {
      json.push(JSON.parse(c.text));
    } catch {
      /* JSON 아님 — 키워드 검사로만 판정 */
    }
  }
  return { text: texts.join('\n'), json };
}

function walk(node: Json, visit: (key: string, value: Json, parent: Json) => void, key = '', parent: Json = null) {
  visit(key, node, parent);
  if (Array.isArray(node)) node.forEach((v) => walk(v, visit, key, node));
  else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) walk(v, visit, k, node);
}

/** 필드 존재 여부 판정 패턴. JSON 키 이름과 원문 텍스트 양쪽에 적용한다. */
const FIELD_PATTERNS: Record<string, RegExp> = {
  '챔피언': /champion/i,
  '승패': /\b(win|result|is_?win)\b/i,
  'KDA': /\b(kill|death|assist)s?\b/i,
  '증강': /augment|증강/i,
  '아이템': /\bitems?\b/i,
  '챔피언 딜량': /damage_?(dealt_?)?to_?champ|total_?damage_?dealt|champion_?damage/i,
  '받은 딜': /damage_?taken/i,
  '골드': /gold/i,
  'PUUID': /puuid/i,
};
const MAYHEM_TEXT = /\b2400\b|mayhem|아수라장|KIWI/i;

function analyze(label: string, result: any) {
  const { text, json } = extract(result);
  const keys = new Set<string>();
  const queueValues = new Map<string, number>();
  let gameIdCount = 0;
  const arrayLens: number[] = [];

  for (const root of json) {
    walk(root, (k, v) => {
      if (k) keys.add(k);
      if (/queue|game_?type|game_?mode/i.test(k) && (typeof v === 'string' || typeof v === 'number')) {
        queueValues.set(String(v), (queueValues.get(String(v)) ?? 0) + 1);
      }
      if (/^(game_?id|match_?id|id)$/i.test(k) && (typeof v === 'string' || typeof v === 'number')) gameIdCount++;
      if (/participant|player|team/i.test(k) && Array.isArray(v)) arrayLens.push(v.length);
    });
  }

  const keyList = [...keys].join(' ');
  const fields = Object.fromEntries(
    Object.entries(FIELD_PATTERNS).map(([name, re]) => [name, re.test(keyList) || re.test(text)]),
  );

  return {
    label,
    isError: Boolean(result?.isError),
    textBytes: text.length,
    jsonParsed: json.length > 0,
    mayhemHit: MAYHEM_TEXT.test(text) || [...queueValues.keys()].some((q) => MAYHEM_TEXT.test(q)),
    queueValues: Object.fromEntries(queueValues),
    gameIdCount,
    participantArrayLens: [...new Set(arrayLens)],
    fields,
    keys: [...keys].sort(),
  };
}

async function timed<T>(fn: () => Promise<T>): Promise<{ ms: number; value?: T; error?: string }> {
  const t = performance.now();
  try {
    const value = await fn();
    return { ms: Math.round(performance.now() - t), value };
  } catch (e) {
    return { ms: Math.round(performance.now() - t), error: e instanceof Error ? e.message : String(e) };
  }
}

async function main() {
  const client = new Client({ name: 'prism-probe', version: '0.1.0' });
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
  const conn = await timed(() => client.connect(transport));
  if (conn.error) throw new Error(`MCP 연결 실패 (${conn.ms}ms): ${conn.error}`);

  // 5. 서버 정보·안내 문구
  const server = { version: client.getServerVersion(), instructions: client.getInstructions(), capabilities: client.getServerCapabilities() };
  console.log(`\n[서버] ${JSON.stringify(server.version)} · 연결 ${conn.ms}ms`);
  console.log(`[안내 문구] ${server.instructions ?? '(없음)'}`);
  save('server.json', server);

  const { tools } = (await client.listTools()) as { tools: ToolInfo[] };
  save('tools.json', tools);
  const lol = tools.filter((t) => /lol/i.test(t.name));
  console.log(`\n[도구] 전체 ${tools.length}개, lol ${lol.length}개`);
  for (const t of lol) {
    console.log(`  - ${t.name}(${Object.keys(t.inputSchema.properties ?? {}).join(', ')}) required=[${(t.inputSchema.required ?? []).join(', ')}]`);
  }
  // 도구 설명에 약관·제한 언급이 있으면 그대로 보고한다
  for (const t of tools) {
    if (t.description && /terms|rate|limit|commercial|약관|제한|상업/i.test(t.description)) {
      console.log(`  [설명 내 제한/약관 언급] ${t.name}: ${t.description}`);
    }
  }

  if (!opt.riot) {
    console.log('\n--riot 이 없어 도구 목록까지만 확인했습니다. 스키마는 scripts/out/tools.json 참고.');
    await client.close();
    return;
  }
  const [gameName, tagLine] = opt.riot.split('#');
  if (!gameName || !tagLine) throw new Error('--riot 은 "게임이름#태그" 형식이어야 합니다.');
  const extra = opt.args ? (JSON.parse(opt.args) as Record<string, unknown>) : {};

  const find = (re: RegExp) => lol.find((t) => re.test(t.name));
  const historyTool = find(/game-history/);
  const renewalTool = find(/renewal/);
  if (!historyTool) throw new Error('lol-summoner-game-history 도구가 없습니다. tools.json 확인 필요.');

  const call = async (tool: ToolInfo) => {
    const { args, missing } = buildArgs(tool, gameName, tagLine, opt.region!, extra);
    if (missing.length) throw new Error(`${tool.name}: 인자 추론 실패 ${missing.join(', ')} — --args 로 지정하세요.`);
    return timed(() => client.callTool({ name: tool.name, arguments: args }, undefined, { timeout: TIMEOUT_MS }));
  };

  if (opt.renew && renewalTool) {
    const r = await call(renewalTool);
    save('renewal.json', r);
    console.log(`\n[renewal] ${r.ms}ms ${r.error ?? 'ok'}`);
  }

  // 1·2·3. 전적 응답 분석
  const h = await call(historyTool);
  save('game-history.json', h);
  if (h.error) throw new Error(`game-history 실패 (${h.ms}ms): ${h.error}`);
  const a = analyze('game-history', h.value);
  save('game-history.analysis.json', a);
  const raw = extract(h.value).text;
  save('game-history.txt', raw);

  // 4. 연속 호출
  const burstN = Number(opt.burst);
  const burst: { ms: number; ok: boolean; note?: string }[] = [];
  for (let i = 0; i < burstN; i++) {
    const r = await call(historyTool);
    const isErr = Boolean(r.error) || Boolean((r.value as any)?.isError);
    burst.push({ ms: r.ms, ok: !isErr, note: r.error ?? (isErr ? extract(r.value).text.slice(0, 200) : undefined) });
  }
  if (burstN) save('burst.json', burst);

  const yes = (b: boolean) => (b ? '있음' : '없음');
  console.log('\n===== 7-2 검증 결과 (자동 판정 · 원본 확인 필요) =====');
  console.log(`| 항목 | 결과 |`);
  console.log(`|---|---|`);
  console.log(`| 1. 아수라장 판 포함 | ${a.mayhemHit ? '흔적 있음' : '흔적 없음'} · 큐 값 ${JSON.stringify(a.queueValues)} |`);
  for (const [name, has] of Object.entries(a.fields)) console.log(`| 2. ${name} | ${yes(has)} |`);
  console.log(`| 2. 참가자 배열 길이 | ${a.participantArrayLens.join(', ') || '판별 불가'} (10이면 10명 전원) |`);
  console.log(`| 3. 판 수 (game id 개수 추정) | ${a.gameIdCount || '판별 불가'} |`);
  console.log(`| 4. 응답 속도 | 첫 호출 ${h.ms}ms` + (burst.length ? ` · 연속 ${burst.length}회 평균 ${Math.round(burst.reduce((s, b) => s + b.ms, 0) / burst.length)}ms, 실패 ${burst.filter((b) => !b.ok).length}회` : '') + ' |');
  console.log(`| 5. 안내 문구 | ${server.instructions ? '있음 (server.json)' : '없음'} |`);
  console.log(`| 응답 형식 | ${a.jsonParsed ? 'JSON' : '텍스트(비 JSON)'} · ${a.textBytes} bytes |`);
  console.log(`\n원본: ${OUT_DIR}`);

  await client.close();
}

main().catch((e) => {
  console.error(`\n[실패] ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
