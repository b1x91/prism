// 계정마다 랭킹 줄 · 계정마다 꾸밈 시뮬레이션 (v3.161). sim.sh 가 띄운 로컬 서버(8788)와 시뮬레이션 D1 에 대고 돈다.
// 환경: SIM_DB = wrangler --persist-to 폴더, SIM_SERVER = server 폴더
import { execFileSync } from 'node:child_process';
const SQL = (q) => JSON.parse(execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', '--local', '--persist-to', process.env.SIM_DB, '--json', '--command', q], { cwd: process.env.SIM_SERVER, stdio: ['ignore', 'pipe', 'ignore'] }).toString())[0].results;
const B = 'http://localhost:8788';
const A = '426955675592163329';
let pass = 0, fail = 0;
const ok = (c, msg, extra = '') => { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + ' ' + extra); } };
async function login(id, roles = '') {
  const r = await fetch(`${B}/auth/dev?id=${id}&name=${id}&roles=${roles}&redirect=${encodeURIComponent('http://127.0.0.1:5173/auth/done')}`, { redirect: 'manual' });
  const code = new URL(r.headers.get('location')).searchParams.get('code');
  const t = await (await fetch(`${B}/api/app/token`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) })).json();
  return t.token;
}
const call = (tok) => async (m, path, body) => {
  const r = await fetch(B + path, { method: m, headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => null) };
};
const a = call(await login(A));
console.log('0. 예전 판에 계정 채우기 (0044)');
{
  const g = Object.fromEntries(SQL("SELECT member_id || ':' || COALESCE(puuid, 'NULL') AS k, COUNT(*) AS n FROM participants GROUP BY 1").map((r) => [r.k, r.n]));
  ok(g[A + ':pa1'] === 13, `메인 13판 = 10판 + 10명 기록 없는 2판 + 이름 바뀐 1판 (${g[A + ':pa1']})`);
  ok(g[A + ':pa2'] === 6, `부계정 6판 — 띄어쓰기·대소문자가 달라도 찾음 (${g[A + ':pa2']})`);
  ok(g['mD:pd1'] === 5 && !g['mD:pd2'], '뺀 계정 판은 메인으로');
  ok(g['mC:NULL'] === 4, '계정 정보 없는 예전 회원은 비어 있음');
  const d = SQL("SELECT puuid, deco FROM member_accounts WHERE member_id = '" + A + "' ORDER BY added_at");
  ok(d[0].deco?.includes('bg-starry') && d[1].deco === null, '메인 계정 줄에 메인 꾸밈을 옮김');
}
const rowsOf = async (api, id, q = '?by=score') => (await api('GET', '/api/ranking' + q)).data.rows.filter((r) => r.id === id);

console.log('1. 랭킹: 계정마다 한 줄');
let all = (await a('GET', '/api/ranking?by=score')).data.rows;
let mine = all.filter((r) => r.id === A);
ok(mine.length === 2, `블랙 줄 2개 (판이 있는 계정만, pa3 는 판 없음) — ${mine.map((r) => r.nick + ' ' + r.n + '판').join(' / ')}`);
const m1 = mine.find((r) => r.main), s1 = mine.find((r) => !r.main);
ok(m1?.n === 13 && m1.nick === '블랙#KR18', '메인 13판 (못 찾은 3판 포함), 이름 블랙#KR18');
ok(s1?.n === 6 && s1.nick === '블랙 부캐#KR2', '부계정 6판, 이름 블랙 부캐#KR2');
ok(m1?.bg === 'bg-starry' && m1.frame === 'frame-gold' && !s1?.bg, '메인 줄에만 별 내리는 밤·금빛 테두리');
ok(all.some((r) => r.id === 'mC' && r.key === 'mC:m'), '계정 정보 없는 예전 회원도 한 줄 (mC:m)');
ok(all.filter((r) => r.id === 'mD').length === 1 && all.find((r) => r.id === 'mD').n === 5, '뺀 계정(pd2) 판은 메인 줄로 — 디 5판 한 줄');
ok(new Set(all.map((r) => r.key)).size === all.length, `줄 열쇠가 모두 다름 (${all.length}줄)`);
ok(!JSON.stringify(all).includes('"pa1"') && !JSON.stringify(all).includes('pb1'), 'puuid 를 내보내지 않음');
const sorted = all.every((r, i) => i === 0 || (all[i - 1].w + 10) / (all[i - 1].n + 20) >= (r.w + 10) / (r.n + 20) - 1e-9);
ok(sorted, '점수 순 정렬');

console.log('2. 회원 페이지 순위 = 가장 높은 줄');
const pg = (await a('GET', `/api/members/${A}`)).data;
const best = all.findIndex((r) => r.id === A) + 1;
const scoreAll = (await a('GET', '/api/ranking?by=score')).data.rows;
ok(pg.rank === scoreAll.findIndex((r) => r.id === A) + 1, `rank ${pg.rank} (랭킹 전체에서 첫 줄 ${best}위)`);

console.log('3. 상점: 계정마다 꾸밈');
let sh = (await a('GET', '/api/shop')).data;
ok(sh.accounts?.length === 3 && sh.accounts[0].main && sh.accounts[0].puuid === 'pa1', '계정 3개, 메인이 맨 앞');
let r = await a('POST', '/api/me/equip', { slot: 'bg', id: 'bg-starry', account: 'pa2' });
ok(r.status === 200, '별 내리는 밤을 부계정에 장착');
sh = r.data;
ok(!sh.deco.bg && sh.accounts.find((x) => x.puuid === 'pa2').deco.bg === 'bg-starry', '메인에서는 빠지고 부계정에만 (한 꾸밈은 한 계정에)');
r = await a('POST', '/api/me/equip', { slot: 'frame', id: 'frame-gold', account: 'pa3' });
ok(r.data.accounts.find((x) => x.puuid === 'pa3').deco.frame === 'frame-gold' && !r.data.deco.frame, '금빛 테두리를 셋째 계정으로 옮김');
r = await a('POST', '/api/me/equip', { slot: 'bg', id: 'bg-magma', account: 'pa2' });
ok(r.status === 400, `안 가진 꾸밈은 400 (${r.status})`);
r = await a('POST', '/api/me/equip', { slot: 'bg', id: 'bg-dusk', account: 'pb1' });
ok(r.status === 404, `남의 계정은 404 (${r.status})`);
r = await a('POST', '/api/me/equip', { slot: 'bg', id: 'bg-dusk' });
ok(r.data.deco.bg === 'bg-dusk' && r.data.accounts[0].deco.bg === 'bg-dusk', '계정을 안 보내면(예전 앱) 메인에');
r = await a('POST', '/api/me/equip', { slot: 'bg', id: 'bg-dusk', account: 'pa2' });
ok(r.data.accounts.find((x) => x.puuid === 'pa2').deco.bg === 'bg-dusk' && !r.data.deco.bg, '노을 협곡을 부계정으로 옮기면 별 내리는 밤은 풀리고 메인에서 빠짐');
r = await a('POST', '/api/me/equip', { slot: 'bg', id: 'bg-starry' });
mine = await rowsOf(a, A);
ok(mine.find((x) => x.main).bg === 'bg-starry' && mine.find((x) => !x.main).bg === 'bg-dusk', '랭킹 줄에 계정마다 다른 배경');
const me = (await a('GET', '/api/me')).data;
ok(me.frame == null, `/api/me 의 얼굴 테두리 = 메인 것 (지금 없음: ${me.frame})`);

console.log('4. 메인 바꾸기: 꾸밈이 서로 자리를 바꿈');
r = await a('POST', '/api/me/riot/main', { puuid: 'pa2' });
ok(r.status === 200, '부계정을 메인으로');
sh = (await a('GET', '/api/shop')).data;
ok(sh.deco.bg === 'bg-dusk' && sh.accounts[0].puuid === 'pa2', `members.deco = 새 메인 꾸밈 (${JSON.stringify(sh.deco)})`);
ok(sh.accounts.find((x) => x.puuid === 'pa1').deco.bg === 'bg-starry', '예전 메인 꾸밈은 그 계정에 남음');
mine = await rowsOf(a, A);
const nm = mine.find((x) => x.main);
ok(nm?.nick === '블랙 부캐#KR2' && nm.n === 6, `메인 줄이 부캐 계정 (${nm?.nick} ${nm?.n}판)`);
ok(mine.find((x) => !x.main)?.nick === '블랙#KR18', '예전 메인은 부계정 줄로');
const pg2 = (await a('GET', `/api/members/${A}`)).data;
ok(pg2.member.deco.bg === 'bg-dusk', '회원 페이지 꾸밈 = 새 메인');

console.log('5. 새 판 기록: 계정이 남는다');
const NOW = Date.now();
const mk = (gameId, t, list) => ({ gameId, queueId: 2400, playedAt: t, duration: 1300, participants: list.map(([puuid, riotId, teamId, championId], i) => ({ puuid, riotId, championId, teamId, win: teamId === 100, kills: 5, deaths: 3, assists: 7, damageToChampions: 20000, damageTaken: 15000, goldEarned: 11000, items: [3089], augments: [] })) });
const ten = (us) => { const l = [...us]; let c = 200; while (l.length < 10) { const tm = l.filter((x) => x[2] === 100).length < 5 ? 100 : 200; l.push([`guest-${l.length}`, `손님${l.length}#KR9`, tm, c++]); } return l; };
r = await a('POST', '/api/ingest', { source: 'lcu', games: [
  mk(9001, NOW - 3600_000, ten([['pa3', '셋째#KR3', 100, 10], ['pb1', '비#KR1', 100, 11]])),
  mk(9002, NOW - 10 * 86400_000, ten([['pa3', '셋째#KR3', 100, 12]])),
] });
ok(r.status === 200, `ingest ${r.status} ${JSON.stringify(r.data)}`);
mine = await rowsOf(a, A);
const third = mine.find((x) => x.nick === '셋째#KR3');
ok(third?.n === 1 && third.frame === 'frame-gold', `셋째 계정 줄이 새로 생김 (1판, 금빛 테두리) — ${third ? third.n + '판' : '없음'}`);
ok(!(await a('GET', '/api/ranking')).data.rows.some((x) => x.id === A && x.n === 0), '등록 전 판(9002)은 셋째 줄에 안 들어감');

console.log('6. 예전 판 다시 받기: 빈 계정 칸 채움');
const b = call(await login('mB'));
ok(Boolean((await b('GET', '/api/me/games')).data.games.find((g) => g.gameId === 9001)), '비의 기록에도 9001 이 들어감 (함께 한 판)');
SQL("UPDATE participants SET puuid = NULL WHERE game_id = 9001 AND member_id = 'mB'");
r = await a('POST', '/api/ingest', { source: 'lcu', games: [mk(9001, NOW - 3600_000, ten([['pa3', '셋째#KR3', 100, 10], ['pb1', '비#KR1', 100, 11]]))] });
ok(r.data?.duplicate === 1, '같은 판은 다시 저장하지 않음');
ok(SQL("SELECT puuid FROM participants WHERE game_id = 9001 AND member_id = 'mB'")[0].puuid === 'pb1', '비어 있던 계정 칸이 채워짐');

console.log('7. 계정 빼기: 메인을 빼면 다음 계정이 메인, 판은 메인 줄로');
r = await a('POST', '/api/me/riot/remove', { puuid: 'pa2' });
ok(r.status === 200, '메인(부캐) 빼기');
sh = (await a('GET', '/api/shop')).data;
ok(sh.accounts[0].puuid === 'pa1' && sh.deco.bg === 'bg-starry', `pa1 이 다시 메인, 꾸밈도 pa1 것 (${JSON.stringify(sh.deco)})`);
mine = await rowsOf(a, A);
ok(mine.find((x) => x.main)?.n === 19, `뺀 계정의 6판은 메인 줄로 합쳐짐 (${mine.find((x) => x.main)?.n}판)`);
ok(!sh.accounts.some((x) => x.deco.bg === 'bg-dusk'), '뺀 계정에 달려 있던 노을 협곡은 어디에도 안 달림 (다시 달 수 있음)');
r = await a('POST', '/api/me/equip', { slot: 'bg', id: 'bg-dusk', account: 'pa3' });
ok(r.status === 200, '노을 협곡을 다른 계정에 다시 달 수 있음');

console.log('8. 준회원: 5줄 + 내 줄');
const l = call(await login('mL', '793740647227588612'));
const lr = (await l('GET', '/api/ranking?by=score')).data;
ok(lr.rows.length === 5 && lr.limited, `5줄만 (${lr.rows.length}), 전체 ${lr.limited?.total}`);
ok(lr.limited.mine === null || (lr.limited.mine.id === 'mL' && lr.limited.mine.rank > 5), `내 줄 ${lr.limited.mine ? lr.limited.mine.rank + '위' : '(5위 안)'}`);

console.log(`\n통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
