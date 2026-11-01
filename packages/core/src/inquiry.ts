/**
 * 문의하기 (CLAUDE.md v3.100). 앱·웹 문의 창과 디스코드 `/문의` 가 같은 서버(`/api/me/inquiry`)로 들어오고,
 * 봇이 운영자에게 정리된 DM 으로 보낸다. 운영자가 DM 의 '답장하기'로 답하면 회원에게 DM + 앱·웹 문의 창에 남는다.
 */
export type InquiryKind = 'bug' | 'idea' | 'account' | 'etc';
export const INQUIRY_KINDS: { id: InquiryKind; name: string; hint: string }[] = [
  { id: 'bug', name: '버그·오류', hint: '언제, 무엇을 했을 때, 어떻게 됐는지 적어 주시면 빨리 찾을 수 있어요.' },
  { id: 'idea', name: '제안', hint: '있으면 좋겠는 기능이나 바뀌면 좋겠는 점을 적어 주세요.' },
  { id: 'account', name: '계정·기록', hint: '롤 계정 연결, 빠진 판, 등급, 피스 같은 내 기록 문제를 적어 주세요.' },
  { id: 'etc', name: '기타', hint: '무엇이든 편하게 적어 주세요.' },
];
export const INQUIRY_KIND_KO: Record<InquiryKind, string> = Object.fromEntries(INQUIRY_KINDS.map((k) => [k.id, k.name])) as Record<InquiryKind, string>;
export const INQUIRY = { min: 5, max: 1000, gapMs: 60_000, perDay: 10 } as const;

export type InquiryStatus = 'open' | 'replied' | 'working' | 'done';
export type Inquiry = { id: number; kind: InquiryKind; body: string; source: 'app' | 'web' | 'discord'; at: number; status: InquiryStatus; reply: string | null; repliedAt: number | null };
/** 앱이 함께 보내는 상태 (문제 확인용, 짧게) */
export type InquiryContext = { app?: string; web?: boolean; lol?: 'off' | 'on' | 'select' | 'game'; vision?: boolean; fullscreen?: boolean; path?: string; ua?: string };


// ───────── 작업 목록 (v3.137) ─────────
// 회원이 올린 문의를 '어느 부분 · 어떤 종류'로 묶어 우선순위 순으로 세운다. 규칙으로 (AI 아님).
// 운영 화면 '문의 작업 목록'과 그대로 작업 지시로 붙여 넣을 마크다운을 같은 함수로 만든다.

/** 앱·웹의 부분. 앞에 있을수록 먼저 맞춘다 (구체적인 것부터) */
export const INQUIRY_AREAS: { id: string; name: string; words: string[] }[] = [
  { id: 'overlay', name: '게임 위 증강 창', words: ['오버레이', '작은 창', '작은창', '증강 창', '증강창', '인식', '안 뜸', '안뜸', '안 떠', '안떠', '안 사라', '안사라', '새로고침', '리롤'] },
  { id: 'select', name: '챔프 선택', words: ['챔프 선택', '챔피언 선택', '챔선', '대기석', '팀 분석', '걸린 것', '아이템 세트'] },
  { id: 'now', name: 'NOW · 팟 · 내전', words: ['now', '팟', '로비', '내전', '팀 나누기', '갈래', '빈자리'] },
  { id: 'shop', name: '상점 · 피스', words: ['상점', '피스', '구매', '랜덤박스', '상자', '배경', '테두리', '칭호', '선물', '출석'] },
  { id: 'dex', name: '도감 · 미션', words: ['도감', '마스터', '미션', '도전', '돋보기'] },
  { id: 'ranking', name: '랭킹 · 장인', words: ['랭킹', '순위', '장인', '점수'] },
  { id: 'records', name: '기록 · 판 상세', words: ['기록', '전적', '판 상세', '최근 판', '빠진 판', '안 올라', '안올라', 'kda', '승률'] },
  { id: 'profile', name: '회원 페이지 · 꾸미기', words: ['프로필', '꾸미기', '스킨', '시너지', '내 페이지', '공유 링크', '닉'] },
  { id: 'crew', name: '멤버 · 아카이브 · 소식', words: ['멤버', '아카이브', '디스코드 카드', '소식', '공지', '접속'] },
  { id: 'augments', name: '증강 · 챔프 정보', words: ['증강', '챔프', '챔피언', '스킬', '아이템', '티어', '어울'] },
  { id: 'account', name: '로그인 · 계정 · 등급', words: ['로그인', '계정', '연결', '등급', '역할', '승인', '정회원', '우수회원'] },
  { id: 'app', name: '앱 설치 · 업데이트 · 성능', words: ['설치', '업데이트', '버전', '실행', '꺼', '렉', '끊김', '느려', '프레임', '메모리', '트레이'] },
  { id: 'bot', name: '디스코드 봇', words: ['봇', '/내기록', '/랭킹', '/미션', '알림'] },
];
const AREA_NAME: Record<string, string> = Object.fromEntries([...INQUIRY_AREAS.map((a) => [a.id, a.name]), ['etc', '그 밖의 것']]);

/** 문의 글과 보던 화면으로 부분을 정한다 */
export function areaOf(body: string, path?: string | null): string {
  const t = body.toLowerCase();
  let best = '', score = 0;
  for (const a of INQUIRY_AREAS) {
    const n = a.words.reduce((k, w) => k + (t.includes(w) ? 1 : 0), 0);
    if (n > score) { best = a.id; score = n; }
  }
  if (best) return best;
  const p = (path ?? '').toLowerCase();
  const byPath: [string, string][] = [['/shop', 'shop'], ['/dex', 'dex'], ['/missions', 'dex'], ['/ranking', 'ranking'], ['/crew', 'crew'], ['/news', 'crew'], ['/members', 'profile'], ['/me', 'profile'], ['/augments', 'augments'], ['/champions', 'augments'], ['/settings', 'app']];
  return byPath.find(([k]) => p.includes(k))?.[1] ?? 'etc';
}

export type WorkItem = { id: number; kind: InquiryKind; body: string; at: number; status: InquiryStatus; source: Inquiry['source']; who: string; whoId: string; ctx: string; reply: string | null };
export type WorkGroup = { key: string; area: string; areaName: string; kind: InquiryKind; title: string; count: number; people: number; first: number; last: number; score: number; items: WorkItem[] };

/** 종류 무게: 버그가 먼저, 그다음 계정·기록, 제안 */
const KIND_WEIGHT: Record<InquiryKind, number> = { bug: 3, account: 2, idea: 1, etc: 1 };
export const WORK = { recentDays: 3, recentBoost: 1.5 } as const;

/** 아직 끝나지 않은 문의를 묶는다 (해결한 것은 빼고). 점수 = 종류 무게 × (사람 수 + 같은 사람의 추가 건수 × 0.3) × 최근이면 1.5 */
export function worklistOf(items: (WorkItem & { path?: string | null })[], now = Date.now()): WorkGroup[] {
  const map = new Map<string, WorkGroup & { who: Set<string> }>();
  for (const it of items) {
    if (it.status === 'done') continue;
    const area = areaOf(it.body, it.path);
    const key = `${it.kind}:${area}`;
    const g = map.get(key) ?? { key, area, areaName: AREA_NAME[area] ?? area, kind: it.kind, title: `${AREA_NAME[area] ?? area} · ${INQUIRY_KIND_KO[it.kind]}`, count: 0, people: 0, first: it.at, last: it.at, score: 0, items: [], who: new Set<string>() };
    g.items.push(it); g.count++; g.who.add(it.whoId);
    g.first = Math.min(g.first, it.at); g.last = Math.max(g.last, it.at);
    map.set(key, g);
  }
  return [...map.values()].map(({ who, ...g }) => {
    const people = who.size;
    const recent = now - g.last < WORK.recentDays * 86_400_000 ? WORK.recentBoost : 1;
    return { ...g, people, items: g.items.sort((a, b) => b.at - a.at), score: Math.round(KIND_WEIGHT[g.kind] * (people + (g.count - people) * 0.3) * recent * 10) / 10 };
  }).sort((a, b) => b.score - a.score || b.last - a.last);
}

const mdDate = (t: number) => { const d = new Date(t + 9 * 3600_000); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };
/** 작업 지시로 그대로 붙여 넣을 마크다운. 회원 이름은 넣지 않는다 (번호로 찾는다) */
export function worklistMd(groups: WorkGroup[], now = Date.now()): string {
  const out = [`# Prism 문의 작업 목록 (${mdDate(now)})`, '', `열린 묶음 ${groups.length}개 · 문의 ${groups.reduce((n, g) => n + g.count, 0)}건. 위에서부터 우선순위 순.`, ''];
  groups.forEach((g, i) => {
    out.push(`## ${i + 1}. [${INQUIRY_KIND_KO[g.kind]}] ${g.areaName} — ${g.people}명 · ${g.count}건 (최근 ${mdDate(g.last)})`);
    for (const it of g.items) {
      const one = it.body.replace(/\s+/g, ' ').trim();
      out.push(`- #${it.id}${it.ctx ? ` (${it.ctx})` : ''}${it.status === 'working' ? ' [작업 중]' : it.status === 'replied' ? ' [답장함]' : ''}: ${one.length > 300 ? `${one.slice(0, 299)}…` : one}`);
    }
    out.push('');
  });
  return out.join('\n');
}
