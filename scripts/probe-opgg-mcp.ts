/**
 * op.gg 공식 MCP 검증 스크립트 (CLAUDE.md 7-2절)
 *
 * 확인 항목:
 *   1. 전적 도구가 아수라장(queueId 2400) 판을 포함하는가
 *   2. 판당 필드 — 챔피언·승패·KDA / 증강 / 아이템 / 딜량·받은 딜 / 10명 전원
 *   3. 몇 판까지 오는가
 *   4. 응답 속도와 호출 제한
 *   5. 서버 측 약관·용도 안내 문구
 *
 * 2026-10-10 실측: 문서의 lol-summoner-renewal / lol-summoner-game-history 는 없다.
 * 실제 도구는 lol_list_summoner_matches(최근 N판, limit 5~20) 와
 * lol_get_summoner_game_detail(한 판 상세) 이다. 둘 다 desired_output_fields 필수.
 *
 * 사용법 (이 클라우드 환경에서는 NODE_USE_ENV_PROXY=1 필요):
 *   npm run probe:opgg -- --riot "게임이름#태그" [--region KR] [--burst 10]
 *
 * 원본 응답은 전부 scripts/out/ 에 저장한다. 자동 판정은 보조일 뿐이므로
 * 최종 보고 전에 원본을 반드시 눈으로 확인한다.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { parseOpgg } from './opgg-format.js';

const MCP_URL = 'https://mcp-api.op.gg/mcp';
const TIMEOUT_MS = 60_000;
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'out');
const LIST_TOOL = 'lol_list_summoner_matches';
const DETAIL_TOOL = 'lol_get_summoner_game_detail';

type ToolInfo = { name: string; description?: string; inputSchema: { properties?: Record<string, any>; required?: string[] }; outputSchema?: unknown };

// op.gg 서버는 일부 도구의 outputSchema 를 MCP 규격(type: "object")과 다르게 준다.
// SDK 의 listTools()/callTool() 은 이를 거부하므로 느슨한 스키마로 직접 요청한다.
const LooseToolList = z.object({ tools: z.array(z.any()) }).passthrough();
const LooseCallResult = z.object({}).passthrough();

const { values: opt } = parseArgs({
  options: {
    riot: { type: 'string' },
    region: { type: 'string', default: 'KR' },
    burst: { type: 'string', default: '0' },
  },
});

function save(name: string, data: unknown) {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, name), typeof data === 'string' ? data : JSON.stringify(data, null, 2));
}

/** desired_output_fields 설명의 "Available fields" 목록을 펼친다. a.b.{c,d} → a.b.c, a.b.d */
function availableFields(tool: ToolInfo): string[] {
  const desc: string = tool.inputSchema.properties?.desired_output_fields?.description ?? '';
  const out: string[] = [];
  for (const line of desc.split('\n')) {
    const m = line.match(/^- (data\.\S+)$/);
    if (!m) continue;
    const brace = m[1].match(/^(.*)\.\{(.+)\}$/);
    if (brace) out.push(...brace[2].split(',').map((f) => `${brace[1]}.${f}`));
    else out.push(m[1]);
  }
  // 클립·분당 타임라인은 수집과 무관하고 응답만 키우므로 뺀다
  return out.filter((f) => !/clips|op_score_timeline/.test(f));
}

/** 응답 content 의 텍스트를 모으고, JSON 이면 파싱한다. */
function extract(result: any): { text: string; json: any } {
  const text = (result?.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n');
  let json: any = result?.structuredContent ?? null;
  if (!json) {
    try {
      json = JSON.parse(text);
    } catch {
      // JSON 이 아니면 op.gg 압축 형식으로 읽는다. 실패하면 원본 텍스트로만 확인한다.
      try {
        json = parseOpgg(text);
      } catch (e) {
        console.log(`[파싱 실패] ${e instanceof Error ? e.message : e}`);
      }
    }
  }
  return { text, json };
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

/** 객체에 값이 있는 필드인지 (null·undefined·빈 배열 제외) */
const has = (v: unknown) => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0);

async function main() {
  const client = new Client({ name: 'prism-probe', version: '0.2.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(MCP_URL)));

  // 5. 서버 정보·안내 문구
  const server = { version: client.getServerVersion(), instructions: client.getInstructions() ?? null };
  console.log(`[서버] ${JSON.stringify(server.version)}`);
  console.log(`[안내 문구] ${server.instructions ?? '(없음)'}`);
  save('server.json', server);

  const { tools } = (await client.request({ method: 'tools/list', params: {} }, LooseToolList)) as { tools: ToolInfo[] };
  save('tools.json', tools);
  console.log(`[도구] 전체 ${tools.length}개: ${tools.map((t) => t.name).join(', ')}`);
  const listTool = tools.find((t) => t.name === LIST_TOOL);
  const detailTool = tools.find((t) => t.name === DETAIL_TOOL);
  if (!listTool || !detailTool) throw new Error(`${LIST_TOOL} 또는 ${DETAIL_TOOL} 이 없습니다. 도구 구성이 바뀌었습니다.`);

  if (!opt.riot) {
    console.log('\n--riot 이 없어 도구 목록까지만 확인했습니다.');
    return client.close();
  }
  const [gameName, tagLine] = opt.riot.split('#');
  if (!gameName || !tagLine) throw new Error('--riot 은 "게임이름#태그" 형식이어야 합니다.');

  const call = (name: string, args: Record<string, unknown>) =>
    timed(async () => {
      const t = performance.now();
      const r: any = await client.request({ method: 'tools/call', params: { name, arguments: args } }, LooseCallResult, { timeout: TIMEOUT_MS });
      r._ms = Math.round(performance.now() - t);
      return r;
    });

  // 1·3. 최근 전적
  const listArgs = { game_name: gameName, tag_line: tagLine, region: opt.region, lang: 'ko_KR', limit: 20, desired_output_fields: availableFields(listTool) };
  const list = await call(LIST_TOOL, listArgs);
  save('matches.raw.json', list);
  if (list.error) throw new Error(`${LIST_TOOL} 실패: ${list.error}`);
  const listMs = list.value._ms;
  const { text: listText, json: listJson } = extract(list.value);
  save('matches.txt', listText);
  if (list.value.isError || !listJson) {
    console.log(`\n[${LIST_TOOL}] 오류 또는 비 JSON 응답 — matches.txt 확인\n${listText.slice(0, 1000)}`);
    return client.close();
  }
  const games: any[] = listJson?.data?.game_history ?? [];
  const typeCount: Record<string, number> = {};
  for (const g of games) typeCount[`${g.game_type}/${g.game_map}`] = (typeCount[`${g.game_type}/${g.game_map}`] ?? 0) + 1;

  console.log(`\n[${LIST_TOOL}] ${listMs}ms · ${games.length}판`);
  for (const g of games) {
    const me = (g.participants ?? []).find((p: any) => p.summoner?.game_name?.toLowerCase() === gameName.toLowerCase()) ?? g.participants?.[0];
    console.log(`  ${g.created_at} ${String(g.game_type).padEnd(12)} ${g.game_map} ${g.game_length_second}s 참가자 ${g.participants?.length ?? 0}명 · ${me?.champion_name} ${me?.stats?.result}`);
  }

  // 2. 필드 유무 — 목록 응답의 첫 판, 상세 응답의 한 판
  const sample = games.find((g) => /ARAM/i.test(g.game_type)) ?? games[0];
  let detail: any = null;
  let detailMs = 0;
  if (sample) {
    const d = await call(DETAIL_TOOL, {
      region: opt.region,
      lang: 'ko_KR',
      game_id: String(sample.id),
      created_at: sample.created_at,
      focus_riot_id: opt.riot,
      desired_output_fields: availableFields(detailTool),
    });
    save('detail.raw.json', d);
    detailMs = d.value?._ms ?? d.ms;
    detail = extract(d.value).json?.data?.game_detail ?? null;
    if (!detail) console.log(`\n[${DETAIL_TOOL}] 상세 파싱 실패 — detail.raw.json 확인`);
  }
  const detailPlayers: any[] = (detail?.teams ?? []).flatMap((t: any) => t.participants ?? []);
  const listPlayers: any[] = sample?.participants ?? [];
  const fieldCheck = (players: any[]) => {
    const p = players.find((x) => x.is_target) ?? players[0] ?? {};
    return {
      '챔피언': has(p.champion_id),
      '승패': has(p.stats?.result),
      'KDA': has(p.stats?.kill) && has(p.stats?.death) && has(p.stats?.assist),
      '증강': Object.keys(p).some((k) => /augment/i.test(k)),
      '아이템': has(p.items),
      '챔피언 딜량': has(p.stats?.total_damage_dealt_to_champions),
      '받은 딜': has(p.stats?.total_damage_taken),
      '골드': has(p.stats?.gold_earned),
      'PUUID': has(p.summoner?.puuid),
    };
  };
  const augAnywhere = /augment|증강/i.test(JSON.stringify(list.value)) || /augment|증강/i.test(JSON.stringify(detail));

  // 4. 연속 호출
  const burstN = Number(opt.burst);
  const burst: { ms: number; ok: boolean; note?: string }[] = [];
  for (let i = 0; i < burstN; i++) {
    const r = await call(LIST_TOOL, listArgs);
    const ok = !r.error && !r.value?.isError;
    burst.push({ ms: r.value?._ms ?? r.ms, ok, note: ok ? undefined : (r.error ?? extract(r.value).text.slice(0, 200)) });
  }
  if (burstN) save('burst.json', burst);

  const o = (b: boolean) => (b ? 'O' : 'X');
  const lf = fieldCheck(listPlayers);
  const df = fieldCheck(detailPlayers);
  console.log('\n===== 7-2 검증 결과 (자동 판정 · 원본 확인 필요) =====');
  console.log('| 항목 | 목록 응답 | 상세 응답 |');
  console.log('|---|---|---|');
  console.log(`| 큐 종류 분포 | ${JSON.stringify(typeCount)} | ${detail ? `${detail.game_type}/${detail.game_map}` : '-'} |`);
  for (const k of Object.keys(lf)) console.log(`| ${k} | ${o((lf as any)[k])} | ${o((df as any)[k])} |`);
  console.log(`| 참가자 수 (샘플 판) | ${listPlayers.length} | ${detailPlayers.length} |`);
  console.log(`| 증강 문자열 (응답 전체 검색) | ${o(augAnywhere)} | |`);
  console.log(`| 응답 속도 | ${listMs}ms | ${detailMs}ms |`);
  if (burst.length) {
    const avg = Math.round(burst.reduce((s, b) => s + b.ms, 0) / burst.length);
    console.log(`| 연속 ${burst.length}회 | 평균 ${avg}ms · 실패 ${burst.filter((b) => !b.ok).length}회 | |`);
  }
  console.log(`| 안내 문구 | ${server.instructions ? '있음 (server.json)' : '없음'} | |`);
  console.log(`\n원본: ${OUT_DIR}`);
  await client.close();
}

main().catch((e) => {
  console.error(`\n[실패] ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
