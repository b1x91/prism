/**
 * 롤 클라이언트(LCU) 전적 해석과 개인 통계. 순수 함수 (앱이 받은 원본을 넘겨준다).
 * LCU 필드 이름은 실측 전 추정이다. 없는 필드는 null/빈 배열로 둔다.
 */
import { baseItem } from './data';

export const MAYHEM_QUEUE = 2400;

/**
 * 사용자 설정(커스텀) 아수라장: 커스텀 게임이면서 증강 기록이 있는 판. 아레나(증강이 있는 다른 모드)는 뺀다.
 * 목록 응답(본인 1명)과 상세 응답(10명) 모두에 쓴다.
 */
export const isCustomMayhem = (g: any) =>
  (g?.gameType === 'CUSTOM_GAME' || Number(g?.queueId) === 0) &&
  g?.gameMode !== 'CHERRY' &&
  Number(g?.mapId) !== 30 &&
  (g?.participants ?? []).some((p: any) => augmentsOf(p?.stats).length > 0);

/** 기록 대상: 아수라장 큐(2400) 또는 커스텀 아수라장 */
export const isMayhemGame = (g: any) => Number(g?.queueId) === MAYHEM_QUEUE || isCustomMayhem(g);

export type NW = { n: number; w: number };
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
  /** 사용자 설정(커스텀) 게임 */
  custom?: boolean;
};

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
    custom: Number(g.queueId) !== MAYHEM_QUEUE,
  };
}

/** 목록 응답 여러 쪽 → 아수라장 판만, 최신순, 중복 제거 */
export function mayhemGames(pages: any[]): { games: Game[]; scanned: number } {
  const games: Game[] = [];
  let scanned = 0;
  for (const res of pages) {
    for (const g of res?.games?.games ?? []) {
      scanned++;
      if (!isMayhemGame(g)) continue;
      const parsed = toGame(g);
      if (parsed) games.push(parsed);
    }
  }
  const seen = new Set<number>();
  return { games: games.filter((g) => !seen.has(g.gameId) && seen.add(g.gameId)).sort((a, b) => b.playedAt - a.playedAt), scanned };
}

/** 상세 응답(10명) → 서버 /api/ingest 형식 (CLAUDE.md 7-1). 비회원 정보는 서버가 팀 합계에만 쓰고 버린다 */
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
      // 도감 역할 챌린지 (클라이언트가 주는 값만. 이름이 버전마다 다를 수 있어 둘 다 본다)
      largestMultiKill: num(s.largestMultiKill) ?? undefined,
      pentaKills: num(s.pentaKills) ?? undefined,
      quadraKills: num(s.quadraKills) ?? undefined,
      ccTime: num(s.timeCCingOthers) ?? undefined,
      healsOnTeammates: num(s.totalHealsOnTeammates) ?? num(s.totalHealOnTeammates) ?? undefined,
      shieldsOnTeammates: num(s.totalDamageShieldedOnTeammates) ?? undefined,
    };
  });
  return { gameId: Number(d?.gameId), queueId: Number(d?.queueId), gameType: String(d?.gameType ?? ''), gameMode: String(d?.gameMode ?? ''), mapId: Number(d?.mapId) || 0, playedAt: Number(d?.gameCreation), duration: Number(d?.gameDuration), participants };
}

export type Personal = {
  total: NW;
  champions: Record<number, NW>;
  augments: { id: number; n: number; w: number }[];
  augmentsByChampion: Record<number, { id: number; n: number; w: number }[]>;
  augmentGames: number;
};

export function personalStats(games: Game[]): Personal {
  const champions: Record<number, NW> = {};
  const aug = new Map<number, NW>();
  const augByChamp = new Map<number, Map<number, NW>>();
  let augmentGames = 0;
  const bump = (m: Map<number, NW>, k: number, win: boolean) => {
    const x = m.get(k) ?? { n: 0, w: 0 };
    x.n++;
    if (win) x.w++;
    m.set(k, x);
  };
  for (const g of games) {
    const c = (champions[g.championId] ??= { n: 0, w: 0 });
    c.n++;
    if (g.win) c.w++;
    if (g.augments.length) augmentGames++;
    for (const a of new Set(g.augments)) {
      bump(aug, a, g.win);
      const m = augByChamp.get(g.championId) ?? new Map<number, NW>();
      bump(m, a, g.win);
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

/** 지금 연승/연패 */
export function streakOf(games: Game[]): { n: number; win: boolean } {
  if (!games.length) return { n: 0, win: true };
  const win = games[0].win;
  let n = 0;
  for (const g of games) {
    if (g.win !== win) break;
    n++;
  }
  return { n, win };
}

/**
 * 오늘의 챔피언 추천 (게임이 없을 때 게임 화면). 아수라장은 무작위라 '고르는' 게 아니라
 * 주사위·대기석에서 만나면 잡을 만한 챔피언을 내 기록으로 고른다.
 * - 2판 이상 한 챔피언을 보정 승률((승+1)/(판+2)) 순으로 상위 6개, 날짜마다 돌아가며 하나
 * - 기록이 적으면 아직 안 만난 챔피언 중 날짜로 하나 (새 챔피언 도전)
 */
export function todayPicks(p: Personal, allIds: number[], day = Math.floor(Date.now() / 864e5)) {
  const good = Object.entries(p.champions)
    .map(([id, v]) => ({ id: Number(id), ...v, score: (v.w + 1) / (v.n + 2) }))
    .filter((x) => x.n >= 2)
    .sort((a, b) => b.score - a.score || b.n - a.n)
    .slice(0, 6);
  const fresh = allIds.filter((id) => !p.champions[id]);
  // 잘 이긴 챔피언을 먼저 (날짜마다 시작점을 바꿔 매일 다른 챔피언이 앞에), 새 챔피언 도전은 맨 뒤
  const start = good.length ? day % good.length : 0;
  const best = [...good.slice(start), ...good.slice(0, start)].map((g) => ({ id: g.id, why: 'best' as const }));
  return [...best, ...(fresh.length ? [{ id: fresh[day % fresh.length], why: 'new' as const }] : [])];
}

// ───────── 도감: 만난 챔피언·고른 증강 ─────────

export type DexEntry = { n: number; w: number; first: number; last: number };
export type DexPair = { aug: number; champ: number; n: number; w: number };
/** 아이템 × 챔프 (v3.119): 그 챔프로 그 아이템을 끝까지 갖고 있던 판 */
export type ItemPair = { item: number; champ: number; n: number; w: number };
export type Dex = { champions: Record<number, DexEntry>; augments: Record<number, DexEntry>; pairs: DexPair[]; items?: Record<number, DexEntry>; itemPairs?: ItemPair[]; challenges?: import('./challenges').ChallengeTally };
/** 서버 /api/me/dex 응답 */
export type DexRows = { champions: ({ id: number } & DexEntry)[]; augments: ({ id: number } & DexEntry)[]; pairs: DexPair[]; items?: ({ id: number } & DexEntry)[]; itemPairs?: ItemPair[]; challenges?: import('./challenges').ChallengeTally };

export function dexFromRows(r: DexRows): Dex {
  const map = (rows: ({ id: number } & DexEntry)[]) => Object.fromEntries(rows.map(({ id, ...e }) => [id, e]));
  return { champions: map(r.champions), augments: map(r.augments), pairs: r.pairs, items: map(r.items ?? []), itemPairs: r.itemPairs ?? [], challenges: r.challenges };
}

export function dexFromGames(games: Game[]): Dex {
  const champions: Record<number, DexEntry> = {}, augments: Record<number, DexEntry> = {};
  const pairs = new Map<string, DexPair>();
  const items: Record<number, DexEntry> = {}, itemPairs = new Map<string, ItemPair>();
  const add = (m: Record<number, DexEntry>, id: number, g: Game) => {
    const e = (m[id] ??= { n: 0, w: 0, first: g.playedAt, last: g.playedAt });
    e.n++; if (g.win) e.w++;
    e.first = Math.min(e.first, g.playedAt); e.last = Math.max(e.last, g.playedAt);
  };
  for (const g of games) {
    add(champions, g.championId, g);
    for (const a of new Set(g.augments)) {
      add(augments, a, g);
      const k = `${a}:${g.championId}`;
      const p = pairs.get(k) ?? { aug: a, champ: g.championId, n: 0, w: 0 };
      p.n++; if (g.win) p.w++;
      pairs.set(k, p);
    }
    for (const it of new Set((g.items ?? []).map(baseItem))) {
      add(items, it, g);
      const k = `${it}:${g.championId}`;
      const p = itemPairs.get(k) ?? { item: it, champ: g.championId, n: 0, w: 0 };
      p.n++; if (g.win) p.w++;
      itemPairs.set(k, p);
    }
  }
  return { champions, augments, pairs: [...pairs.values()], items, itemPairs: [...itemPairs.values()] };
}

/**
 * 서버 기록과 이 PC 의 롤 기록을 합친다. 같은 판이 양쪽에 다 있을 수 있어 더하지 않고,
 * 항목마다 판수가 많은 쪽을 쓰고 처음 만난 날은 이른 쪽을 쓴다.
 */
export function mergeDex(a: Dex, b: Dex): Dex {
  const m = (x: Record<number, DexEntry>, y: Record<number, DexEntry>) => {
    const out: Record<number, DexEntry> = { ...x };
    for (const [k, e] of Object.entries(y)) {
      const o = out[+k];
      out[+k] = !o ? e : { ...(e.n > o.n ? e : o), first: Math.min(e.first, o.first), last: Math.max(e.last, o.last) };
    }
    return out;
  };
  const pairs = new Map<string, DexPair>();
  for (const p of [...a.pairs, ...b.pairs]) { const k = `${p.aug}:${p.champ}`; const o = pairs.get(k); if (!o || p.n > o.n) pairs.set(k, p); }
  const ip = new Map<string, ItemPair>();
  for (const p of [...(a.itemPairs ?? []), ...(b.itemPairs ?? [])]) { const k = `${p.item}:${p.champ}`; const o = ip.get(k); if (!o || p.n > o.n) ip.set(k, p); }
  // 역할 챌린지는 서버만 센다 (10명 전체가 필요해서)
  return { champions: m(a.champions, b.champions), augments: m(a.augments, b.augments), pairs: [...pairs.values()], items: m(a.items ?? {}, b.items ?? {}), itemPairs: [...ip.values()], challenges: a.challenges ?? b.challenges };
}

// ───────── 한 판 상세 ─────────

export type MatchPlayer = {
  name: string | null; memberId?: string | null; nick?: string | null; skin?: number | null; main?: number | null;
  championId: number; teamId: number; win: boolean; kills: number; deaths: number; assists: number;
  damageToChampions: number | null; damageTaken: number | null; goldEarned: number | null; items: number[]; augments: number[];
};
export type MatchDetail = {
  gameId: number; playedAt: number; duration: number; custom: boolean;
  /** 10명 전체가 있는가 (서버만이면 함께한 Prism 회원만) */
  full: boolean;
  teams: Record<string, { win: boolean; kills: number | null; champions?: number[] | null }>;
  players: MatchPlayer[];
};

/** 롤 클라이언트 상세(10명) → 화면용 */
export function matchFromLcu(d: any): MatchDetail | null {
  if (!d?.gameId || !Array.isArray(d.participants)) return null;
  const g = toIngestGame(d);
  const players: MatchPlayer[] = g.participants.map((p: any) => ({
    name: p.riotId ? String(p.riotId).split('#')[0] : null, championId: p.championId, teamId: p.teamId, win: p.win,
    kills: p.kills, deaths: p.deaths, assists: p.assists, damageToChampions: p.damageToChampions ?? null, damageTaken: p.damageTaken ?? null,
    goldEarned: p.goldEarned ?? null, items: p.items, augments: p.augments,
  }));
  const teams: MatchDetail['teams'] = {};
  for (const p of players) {
    const t = (teams[p.teamId] ??= { win: p.win, kills: 0, champions: [] });
    t.kills = (t.kills ?? 0) + p.kills;
    t.champions!.push(p.championId);
  }
  return { gameId: g.gameId, playedAt: g.playedAt, duration: g.duration, custom: g.queueId !== MAYHEM_QUEUE, full: players.length >= 10, teams, players };
}

/** 서버(회원 얼굴) + 클라이언트(10명) 합치기. 같은 판에서 팀+챔피언은 한 명뿐이라 그것으로 맞춘다 */
export function mergeMatch(server: MatchDetail | null, lcu: MatchDetail | null): MatchDetail | null {
  if (!lcu) return server;
  if (!server) return lcu;
  const key = (p: MatchPlayer) => `${p.teamId}:${p.championId}`;
  const members = new Map(server.players.map((p) => [key(p), p]));
  return { ...lcu, players: lcu.players.map((p) => { const m = members.get(key(p)); return m ? { ...p, memberId: m.memberId, nick: m.nick, skin: m.skin, main: m.main, name: m.nick ?? p.name } : p; }) };
}
