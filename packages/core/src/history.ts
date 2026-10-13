/**
 * 롤 클라이언트(LCU) 전적 해석과 개인 통계. 순수 함수 (앱이 받은 원본을 넘겨준다).
 * LCU 필드 이름은 실측 전 추정이다. 없는 필드는 null/빈 배열로 둔다.
 */
export const MAYHEM_QUEUE = 2400;

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
  };
}

/** 목록 응답 여러 쪽 → 아수라장 판만, 최신순, 중복 제거 */
export function mayhemGames(pages: any[]): { games: Game[]; scanned: number } {
  const games: Game[] = [];
  let scanned = 0;
  for (const res of pages) {
    for (const g of res?.games?.games ?? []) {
      scanned++;
      if (Number(g.queueId) !== MAYHEM_QUEUE) continue;
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
    };
  });
  return { gameId: Number(d?.gameId), queueId: Number(d?.queueId), playedAt: Number(d?.gameCreation), duration: Number(d?.gameDuration), participants };
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
