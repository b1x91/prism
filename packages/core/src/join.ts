/**
 * 가입 신청 (CLAUDE.md v3.148). 웹 초대 페이지·운영 화면·서버가 함께 쓰는 정의.
 * 초대 링크 → 소개·숫자·규칙 → 신청 → 면접방(오픈카톡)에서 운영진과 이야기 → 운영진 확정 → 톡방·디스코드 초대 → 로그인하면 자동 승인.
 */

/** 숫자는 이 한 곳에서 바꾼다 */
export const JOIN = {
  signs: 2,          // 확정에 필요한 운영진 수 (운영진이 그보다 적으면 있는 만큼)
  perCodeDay: 10,    // 초대 링크 하나당 하루 신청
  perIpDay: 5,       // 같은 곳(주소)에서 하루 신청
  quietDays: 3,      // 신청 뒤 이만큼 소식이 없으면 '연락 없음'
  dropDays: 14,      // 신청·면접 중·보류가 이만큼 그대로면 정리
  keepDays: 30,      // 거절·가입 완료 기록을 남겨 두는 기간 (그동안 같은 롤 이름 재신청 불가)
  kakaoMax: 20,
  noteMax: 100,
} as const;

export type JoinStatus = 'new' | 'interview' | 'confirmed' | 'invited' | 'joined' | 'hold' | 'rejected';
export const JOIN_STATUS_KO: Record<JoinStatus, string> = {
  new: '신청', interview: '면접 중', confirmed: '확정', invited: '초대함', joined: '가입 완료', hold: '보류', rejected: '거절',
};

export const JOIN_TIMES = [
  { key: 'day', label: '낮' }, { key: 'evening', label: '저녁' }, { key: 'night', label: '밤' }, { key: 'dawn', label: '새벽' },
] as const;

/** 초대 페이지 규칙 (공지 'Prism 가입 안내 및 운영 수칙'·docs/discord-rules.md 와 같게 유지) */
export const JOIN_RULES = [
  { t: '초기 지인 추천제', d: '아는 멤버가 불러 준 분만' },
  { t: '디스코드 참여 필수', d: '듣기만 해도 괜찮아요 (듣톡 가능)' },
  { t: 'Prism 앱 설치 필수', d: 'Windows PC 버전' },
  { t: '오픈프로필은 본인 사진', d: '카카오톡 오픈프로필' },
  { t: '톡방 닉네임은 롤아이디#태그', d: '예: 조이보이#PRSM' },
  { t: '태그 #PRSM 이면 5,000 피스', d: '혜택 · 인게임 태그를 바꾸면 한 번 자동 지급' },
  { t: '연 2회 칼춤', d: '톡방 멤버와 함께한 판이 0판이면 대상' },
  { t: '늘 매너 지키기', d: '함께하는 모든 분께' },
  { t: '반복 민원은 경고 후 강퇴', d: '여러 번 경고한 뒤에도 이어지면' },
  { t: '전적은 회원에게만 보여요', d: '앱이 모은 아수라장 기록' },
] as const;

/** 롤 이름 '이름#태그' 확인 (태그 3~5자). 맞으면 다듬은 값, 아니면 null */
export function cleanRiotId(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s*#\s*/, '#').trim();
  const m = /^(.{3,16})#([0-9A-Za-z가-힣]{2,5})$/.exec(s);
  return m ? `${m[1].trim()}#${m[2]}` : null;
}
export const riotKey = (riotId: string) => riotId.toLowerCase().replace(/\s+/g, '');
export const joinNo = (num: number) => `P-${num}`;

/** 초대 페이지에 보여 줄 모임 숫자 (모두 합계, 사람 이름 없음) */
export type JoinStats = {
  members: number;      // 함께하는 멤버
  online: number;       // 지금 접속 (앱·웹)
  week: number;         // 이번 주 기록된 판 (월요일 0시 KST 부터)
  month: number;        // 이번 달 기록된 판
  together: number;     // 최근 4주 판 중 멤버 둘 이상이 같이 한 판 비율 (0~100)
  days: number;         // 이번 달 판이 있었던 날
  monthDays: number;    // 이번 달 지난 날 수
  hours: number[];      // 최근 4주 판 시작 시각 분포 (KST 0~23시)
  voice: number | null; // 디스코드 음성 채널 지금 인원 (위젯이 꺼져 있으면 null)
  appUsers: number;     // 앱을 쓰는 멤버
  yesterday: number;    // 어제 판을 한 멤버 수 (지금 접속이 적을 때 대신)
};

export type JoinInviter = { nick: string; skin: number | null; main: number | null; intro: string | null };
export type JoinLanding = { inviter: JoinInviter | null; stats: JoinStats };

/** 신청자가 보는 내 신청 */
export type MyApplication = {
  no: string; status: JoinStatus; riotId: string; kakao: string; inviter: string | null;
  room: { url: string; pw: string | null } | null; discord: string | null; createdAt: number;
};

/** 운영 화면 줄 */
export type StaffApplication = {
  id: number; no: string; status: JoinStatus; riotId: string; kakao: string; times: string[]; note: string | null;
  /** pending: 초대한 사람이 아직 승인 대기 (v3.187) */
  inviter: { id: string; nick: string; skin: number | null; main: number | null; pending?: boolean } | null; codeToday: number;
  signs: { id: string; nick: string }[]; sentKakao: boolean; sentDiscord: boolean; memo: string | null;
  member: { id: string; nick: string } | null; createdAt: number; updatedAt: number; log: { at: number; by: string; act: string }[];
};
export type StaffApplications = {
  items: StaffApplication[]; signsNeeded: number; /** 보는 운영진 ID (확정 취소 단추) */ me: string; room: { url: string; pw: string | null };
  pendingMembers: { id: string; nick: string }[];
};
