/**
 * LCU 전적 해석과 개인 통계 (서버 없이 계산).
 * LCU 필드 이름은 실측 전 추정이다. 없는 필드는 null/빈 배열로 둔다.
 */
import { lcuGet, type LcuCreds } from './lcu.js';

export const MAYHEM_QUEUE = 2400;
const HISTORY_PAGES = 5; // 20판 × 5 = 최근 100판

export type Game = {
  gameId: number;
  playedAt: number;
  duration: number;
  championId: number;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  items: number[];
  augments: number[];
  damageToChampions: number | null;
  damageTaken: number | null;
  goldEarned: number | null;
};

export type NW = { n: number; w: number };

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export const itemsOf = (s: any) => [0, 1, 2, 3, 4, 5].map((i) => num(s?.[`item${i}`]) ?? 0).filter((id) => id > 0);
export const augmentsOf = (s: any) =>
  Object.keys(s ?? {})
    .filter((k) => /^playerAugment\d+$/.test(k))
    .sort((a, b) => Number(a.slice(13)) - Number(b.slice(13)))
    .map((k) => num(s[k]) ?? 0)
    .filter((id) => id > 0);

/** 목록 응답의 한 판 (본인 1명만 들어 있음) */
export function toGame(g: any): Game | null {
  const p = g?.participants?.[0];
  const s = p?.stats;
  if (!p || !s) return null;
  return {
    gameId: Number(g.gameId),
    playedAt: Number(g.gameCreation),
    duration: Number(g.gameDuration),
    championId: Number(p.championId),
    win: s.win === true,
    kills: num(s.kills) ?? 0,
    deaths: num(s.deaths) ?? 0,
    assists: num(s.assists) ?? 0,
    items: itemsOf(s),
    augments: augmentsOf(s),
    damageToChampions: num(s.totalDamageDealtToChampions),
    damageTaken: num(s.totalDamageTaken),
    goldEarned: num(s.goldEarned),
  };
}

export type HistoryResult = { games: Game[]; scanned: number; queueCounts: Record<string, number>; firstPage: unknown };

/** puuid 의 최근 전적에서 아수라장 판만. pages 만큼 20판씩 읽는다 */
export async function loadHistory(creds: LcuCreds, puuid: string, pages = HISTORY_PAGES): Promise<HistoryResult> {
  const games: Game[] = [];
  const queueCounts: Record<string, number> = {};
  let scanned = 0;
  let firstPage: unknown = null;
  for (let page = 0; page < pages; page++) {
    const beg = page * 20;
    const res = await lcuGet<any>(creds, `/lol-match-history/v1/products/lol/${puuid}/matches?begIndex=${beg}&endIndex=${beg + 19}`);
    if (page === 0) firstPage = res;
    const list: any[] = res?.games?.games ?? [];
    for (const g of list) {
      scanned++;
      const q = Number(g.queueId);
      queueCounts[q] = (queueCounts[q] ?? 0) + 1;
      if (q !== MAYHEM_QUEUE) continue;
      const parsed = toGame(g);
      if (parsed) games.push(parsed);
    }
    if (list.length < 20) break;
  }
  const seen = new Set<number>();
  return {
    games: games.filter((g) => !seen.has(g.gameId) && seen.add(g.gameId)).sort((a, b) => b.playedAt - a.playedAt),
    scanned,
    queueCounts,
    firstPage,
  };
}

/** 상세 응답(10명) → 서버 /api/ingest 형식 (CLAUDE.md 7-1) */
export function toIngestGame(d: any) {
  const ids = new Map<number, any>((d?.participantIdentities ?? []).map((x: any) => [x.participantId, x.player]));
  const participants = (d?.participants ?? []).map((p: any) => {
    const s = p.stats ?? {};
    const pl = ids.get(p.participantId) ?? {};
    return {
      puuid: String(pl.puuid ?? ''),
      riotId: pl.gameName && pl.tagLine ? `${pl.gameName}#${pl.tagLine}` : undefined,
      championId: Number(p.championId),
      teamId: Number(p.teamId),
      win: s.win === true,
      kills: num(s.kills) ?? 0,
      deaths: num(s.deaths) ?? 0,
      assists: num(s.assists) ?? 0,
      damageToChampions: num(s.totalDamageDealtToChampions) ?? undefined,
      damageTaken: num(s.totalDamageTaken) ?? undefined,
      goldEarned: num(s.goldEarned) ?? undefined,
      augments: augmentsOf(s),
      items: itemsOf(s),
    };
  });
  return { gameId: Number(d?.gameId), queueId: Number(d?.queueId), playedAt: Number(d?.gameCreation), duration: Number(d?.gameDuration), participants };
}

// ───────── 개인 통계 ─────────

export type Personal = {
  total: NW;
  champions: Record<number, NW>;
  augments: { id: number; n: number; w: number }[];
  augmentsByChampion: Record<number, { id: number; n: number; w: number }[]>;
  augmentGames: number; // 증강 정보가 있는 판 수
};

export function personalStats(games: Game[]): Personal {
  const champions: Record<number, NW> = {};
  const aug = new Map<number, NW>();
  const augByChamp = new Map<number, Map<number, NW>>();
  let augmentGames = 0;
  for (const g of games) {
    const c = (champions[g.championId] ??= { n: 0, w: 0 });
    c.n++;
    if (g.win) c.w++;
    if (g.augments.length) augmentGames++;
    for (const a of new Set(g.augments)) {
      const x = aug.get(a) ?? { n: 0, w: 0 };
      x.n++;
      if (g.win) x.w++;
      aug.set(a, x);
      const m = augByChamp.get(g.championId) ?? new Map<number, NW>();
      const y = m.get(a) ?? { n: 0, w: 0 };
      y.n++;
      if (g.win) y.w++;
      m.set(a, y);
      augByChamp.set(g.championId, m);
    }
  }
  const sorted = (m: Map<number, NW>) => [...m].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.n - a.n || b.w - a.w);
  return {
    total: { n: games.length, w: games.filter((g) => g.win).length },
    champions,
    augments: sorted(aug),
    augmentsByChampion: Object.fromEntries([...augByChamp].map(([c, m]) => [c, sorted(m)])),
    augmentGames,
  };
}
