/**
 * 받침에 맞는 조사 고르기. 글자로 끝나면 받침을 보고, 영문·숫자로 끝나면 읽는 소리(엘·엠·엔·알, 영·일·삼·육·칠·팔)로 본다.
 * josa('앞라인', '이/가') → '앞라인이', josa('AD', '이/가') → 'AD가', josa('원딜', '으로/로') → '원딜로'
 */
type Pair = '이/가' | '을/를' | '은/는' | '과/와' | '으로/로' | '이에요/예요';

/** 끝소리: 0 받침 없음 · 1 받침 있음 · 2 받침 ㄹ */
function tail(word: string): 0 | 1 | 2 {
  const s = word.replace(/[\s)\]'"’”.!?]+$/u, '');
  const c = s.charCodeAt(s.length - 1);
  if (c >= 0xac00 && c <= 0xd7a3) {
    const t = (c - 0xac00) % 28;
    return t === 0 ? 0 : t === 8 ? 2 : 1;
  }
  const ch = s.slice(-1).toUpperCase();
  if (ch === 'L' || ch === 'R' || ch === '1' || ch === '7' || ch === '8') return 2;
  if ('MN0369'.includes(ch)) return 1;
  return 0;
}

export function josa(word: string, pair: Pair): string {
  const [a, b] = pair.split('/');
  const t = tail(word);
  if (pair === '으로/로') return word + (t === 1 ? a : b);
  return word + (t === 0 ? b : a);
}
