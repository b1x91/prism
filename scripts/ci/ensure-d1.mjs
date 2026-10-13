/**
 * CI 전용: Cloudflare 에 D1 데이터베이스 "prism" 이 없으면 만들고, 그 ID 를 server/wrangler.toml 에 채운다 (CI 작업 폴더에서만, 커밋하지 않음).
 * 필요: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const NAME = 'prism';
const TOML = 'server/wrangler.toml';
const wrangler = (...a) => execFileSync('npx', ['wrangler', ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
const find = () => JSON.parse(wrangler('d1', 'list', '--json')).find((d) => d.name === NAME);

let db = find();
if (!db) {
  console.log(`D1 "${NAME}" 이 없어 새로 만듭니다.`);
  wrangler('d1', 'create', NAME);
  db = find();
}
if (!db?.uuid) throw new Error('D1 ID 를 찾지 못했습니다.');
const toml = readFileSync(TOML, 'utf8').replace(/database_id = "[^"]*"/, `database_id = "${db.uuid}"`);
writeFileSync(TOML, toml);
console.log(`D1 "${NAME}" = ${db.uuid}`);
