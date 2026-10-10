/**
 * op.gg MCP 응답 형식 파서.
 *
 * op.gg 는 JSON 대신 토큰 절약용 압축 형식을 준다 (2026-10-10 실측):
 *   class GameHistory: id,created_at,game_map,...      ← 헤더: 클래스별 필드 이름
 *   LolListSummonerMatches(Data([GameHistory("m_..", "2026-..", ...)]))   ← 본문: 위치 기반 값
 * 같은 이름에 필드가 다른 변형은 GameHistory1 처럼 숫자가 붙는다.
 * 값: "문자열"(JSON 이스케이프), 숫자, true/false/null, [배열], Class(인자...)
 */

export type OpggValue = null | boolean | number | string | OpggValue[] | { [k: string]: OpggValue };

export function parseOpgg(text: string): OpggValue {
  const classes = new Map<string, string[]>();
  const lines = text.split('\n');
  let i = 0;
  for (; i < lines.length; i++) {
    const m = lines[i].match(/^class (\w+): (.*)$/);
    if (m) classes.set(m[1], m[2] ? m[2].split(',') : []);
    else if (lines[i].trim()) break;
  }
  const body = lines.slice(i).join('\n');
  let pos = 0;

  const fail = (msg: string): never => {
    throw new Error(`op.gg 응답 파싱 실패 @${pos}: ${msg} — "${body.slice(pos, pos + 40)}"`);
  };
  const ws = () => {
    while (pos < body.length && /\s/.test(body[pos])) pos++;
  };

  function value(): OpggValue {
    ws();
    const c = body[pos];
    if (c === '"') return str();
    if (c === '[') return list();
    if (c === '-' || (c >= '0' && c <= '9')) return num();
    const word = body.slice(pos).match(/^\w+/)?.[0] ?? fail('알 수 없는 토큰');
    pos += word.length;
    if (word === 'null') return null;
    if (word === 'true') return true;
    if (word === 'false') return false;
    ws();
    if (body[pos] !== '(') fail(`식별자 ${word} 뒤에 ( 가 없음`);
    pos++;
    const args = items(')');
    const fields = classes.get(word);
    if (!fields) fail(`헤더에 없는 클래스 ${word}`);
    if (args.length > fields!.length) fail(`${word} 인자 ${args.length}개 > 필드 ${fields!.length}개`);
    return Object.fromEntries(fields!.map((f, k) => [f, k < args.length ? args[k] : null]));
  }

  function items(close: string): OpggValue[] {
    const out: OpggValue[] = [];
    ws();
    if (body[pos] === close) {
      pos++;
      return out;
    }
    for (;;) {
      out.push(value());
      ws();
      if (body[pos] === ',') pos++;
      else if (body[pos] === close) {
        pos++;
        return out;
      } else fail(`, 또는 ${close} 기대`);
    }
  }

  function list(): OpggValue[] {
    pos++;
    return items(']');
  }

  function str(): string {
    const start = pos++;
    while (pos < body.length && body[pos] !== '"') pos += body[pos] === '\\' ? 2 : 1;
    if (pos >= body.length) fail('닫히지 않은 문자열');
    pos++;
    return JSON.parse(body.slice(start, pos));
  }

  function num(): number {
    const m = body.slice(pos).match(/^-?\d+(\.\d+)?([eE][-+]?\d+)?/) ?? fail('숫자 형식');
    pos += m![0].length;
    return Number(m![0]);
  }

  const root = value();
  ws();
  if (pos < body.length) fail('본문 뒤에 남은 내용');
  return root;
}
