/**
 * 명장면 (CLAUDE.md v3.99): 쿼드라·펜타킬 판을 한 장의 카드와 짧은 이야기로.
 *  - 앱이 롤 클라이언트의 판 흐름(처치 순서·시각·자리)을 읽어 보냈으면 그대로 이야기로 만든다.
 *  - 없으면(웹만 쓰는 회원·예전 판) 판 기록(KDA·피해 몫·증강)만으로 쓴다 — 지어내지 않는다.
 * 칼바람 나락 다리는 왼쪽 아래(블루) → 오른쪽 위(레드) 대각선이다. 자리는 그 대각선 위 어디쯤인지로만 말한다.
 */
import { AUGMENT, CHAMPIONS } from './data';
import { josa } from './josa';

/** 처치 하나: 시각(ms) · 쓰러뜨린 상대 챔프 · 자리 · 도운 아군 수 */
export type HlKill = { t: number; v: number; x?: number; y?: number; a?: number };
export type Highlight = {
  gameId: number; champ: number; multi: number; win: boolean; playedAt: number; duration: number;
  kills: number; deaths: number; assists: number; share: number | null; augments: number[]; team: number;
  /** 판 흐름 (있을 때만) */
  seq: HlKill[] | null;
};

export const MULTI_KO: Record<number, string> = { 4: '쿼드라킬', 5: '펜타킬' };
const mmss = (ms: number) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}분 ${String(s % 60).padStart(2, '0')}초`; };
const nm = (c: number) => CHAMPIONS[c]?.name ?? '상대';

/** 다리 위 자리: 우리 진영 쪽 · 다리 한가운데 · 상대 진영 쪽 */
function spotOf(k: HlKill, team: number): string | null {
  if (k.x == null || k.y == null) return null;
  const p = (k.x + k.y) / 2 / 12800; // 0 = 블루 끝, 1 = 레드 끝
  const mine = team === 100 ? p : 1 - p;
  return mine < 0.38 ? '우리 진영 앞' : mine > 0.62 ? '상대 진영 깊숙이' : '다리 한가운데';
}

/** 연속 처치 구간: 처치 사이가 10초 이내(마지막은 30초)로 이어진 가장 긴 묶음 */
export function killRunOf(seq: HlKill[], need: number): HlKill[] | null {
  const s = [...seq].sort((a, b) => a.t - b.t);
  let best: HlKill[] = [], cur: HlKill[] = [];
  for (const k of s) {
    const gap = cur.length ? k.t - cur[cur.length - 1].t : 0;
    const limit = cur.length >= 4 ? 30_000 : 10_000;
    cur = cur.length && gap <= limit ? [...cur, k] : [k];
    if (cur.length > best.length) best = cur;
  }
  return best.length >= need ? best.slice(0, need === 5 ? 5 : Math.min(best.length, 5)) : null;
}

export function storyOf(h: Highlight): { title: string; lines: string[] } {
  const me = nm(h.champ);
  const title = `${me}의 ${MULTI_KO[h.multi] ?? '연속 처치'}`;
  const run = h.seq ? killRunOf(h.seq, h.multi) : null;
  const lines: string[] = [];
  if (run) {
    const t0 = run[0].t, dur = (run[run.length - 1].t - t0) / 1000;
    const spot = spotOf(run[0], h.team);
    lines.push(`${mmss(t0)}${spot ? `, ${spot}` : ''}. 첫 상대는 ${nm(run[0].v)}.`);
    const mid = run.slice(1, -1).map((k, i) => `${Math.max(1, Math.round((k.t - run[i].t) / 1000))}초 뒤 ${nm(k.v)}`);
    if (mid.length) lines.push(`${mid.join(', ')}.`);
    const last = run[run.length - 1];
    lines.push(`마지막 ${nm(last.v)}까지${run.length === 5 ? ' — 다섯' : ` — ${run.length}명`}을 ${dur.toFixed(1)}초 만에 쓰러뜨렸다.`);
    if (run.every((k) => (k.a ?? 1) === 0)) lines.push('아군의 도움 없이 혼자서 해낸 처치였다.');
  } else {
    lines.push(`${Math.round(h.duration / 60)}분 동안 ${h.kills}킬 ${h.deaths}데스 ${h.assists}어시스트.`);
    if (h.share != null) lines.push(`우리 팀 피해의 ${Math.round(h.share * 100)}%를 ${josa(me, '이/가')} 넣었다.`);
    lines.push(`그리고 한 번, 상대 ${h.multi === 5 ? '다섯 명 모두를' : '네 명을'} 잇달아 쓰러뜨렸다.`);
  }
  const augs = h.augments.map((a) => AUGMENT[a]?.name).filter(Boolean).slice(0, 3);
  if (augs.length) lines.push(`함께한 증강: ${augs.join(' · ')}.`);
  lines.push(h.win ? '그 판은 승리로 끝났다.' : '판은 졌지만, 이 장면은 남았다.');
  return { title, lines };
}

/**
 * 롤 클라이언트의 판 흐름(`/lol-match-history/v1/game-timelines/{gameId}`)에서 내 처치만 뽑는다.
 * [검증필요] 아수라장 판에도 이 흐름이 오는지·이름이 같은지 — 없거나 모양이 다르면 null (이야기는 판 기록으로만 쓴다).
 */
export function myKillsOf(timeline: any, detail: any, puuid: string): HlKill[] | null {
  const me = (detail?.participantIdentities ?? []).find((x: any) => x?.player?.puuid === puuid)?.participantId;
  if (!me) return null;
  const champOf = new Map<number, number>((detail?.participants ?? []).map((p: any) => [Number(p.participantId), Number(p.championId)]));
  const out: HlKill[] = [];
  for (const f of timeline?.frames ?? []) for (const e of f?.events ?? []) {
    if (e?.type !== 'CHAMPION_KILL' || Number(e.killerId) !== me) continue;
    const v = champOf.get(Number(e.victimId));
    if (!v) continue;
    out.push({ t: Number(e.timestamp) || 0, v, x: e.position?.x, y: e.position?.y, a: Array.isArray(e.assistingParticipantIds) ? e.assistingParticipantIds.length : undefined });
  }
  return out.length ? out : null;
}
