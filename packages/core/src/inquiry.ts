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

export type InquiryStatus = 'open' | 'replied' | 'done';
export type Inquiry = { id: number; kind: InquiryKind; body: string; source: 'app' | 'web' | 'discord'; at: number; status: InquiryStatus; reply: string | null; repliedAt: number | null };
/** 앱이 함께 보내는 상태 (문제 확인용, 짧게) */
export type InquiryContext = { app?: string; web?: boolean; lol?: 'off' | 'on' | 'select' | 'game'; vision?: boolean; fullscreen?: boolean; path?: string; ua?: string };
