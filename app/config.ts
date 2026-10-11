/** 앱 설정·로그인 토큰 저장 (사용자 홈의 .prism/config.json). 다른 곳으로 보내지 않는다. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

// 배포 후 실제 Worker 주소로 바꾼다. 환경변수 PRISM_SERVER 가 있으면 그걸 쓴다.
const DEFAULT_SERVER = '';
export const SERVER_URL = (process.env.PRISM_SERVER ?? DEFAULT_SERVER).replace(/\/$/, '');
export const DEV_LOGIN = process.env.PRISM_DEV_LOGIN === '1';

export const PRISM_DIR = process.env.PRISM_HOME ?? join(homedir(), '.prism');
const FILE = join(PRISM_DIR, 'config.json');
const MAX_UPLOADED = 3000;

export type Config = {
  token: string | null;
  uploaded: number[]; // 서버에 보낸 gameId (중복 전송 방지용. 서버도 중복을 거른다)
  lastCrewSyncAt: number;
};

let cache: Config | null = null;

export async function loadConfig(): Promise<Config> {
  if (cache) return cache;
  try {
    cache = { token: null, uploaded: [], lastCrewSyncAt: 0, ...JSON.parse(await readFile(FILE, 'utf8')) };
  } catch {
    cache = { token: null, uploaded: [], lastCrewSyncAt: 0 };
  }
  return cache!;
}

export async function saveConfig(patch: Partial<Config>) {
  const c = { ...(await loadConfig()), ...patch };
  c.uploaded = c.uploaded.slice(-MAX_UPLOADED);
  cache = c;
  await mkdir(PRISM_DIR, { recursive: true });
  await writeFile(FILE, JSON.stringify(c, null, 2));
}
