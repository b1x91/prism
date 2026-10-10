/**
 * 롤 클라이언트 로컬 API(LCU) 접근 — 읽기 전용.
 *
 * 원칙 (사용자 결정 2026-10-10):
 *   - LCU 는 GET 만 한다. 이 모듈은 lcuGet 외에 요청 함수를 내보내지 않는다.
 *     클라이언트 상태를 바꾸는 호출(초대·수락·픽 등)은 구조적으로 할 수 없다.
 *   - 게임 중에는 LCU 를 포함해 롤 쪽으로 아무 요청도 하지 않는다 (isGameRunning 으로 판단).
 *   - 게임 프로세스·메모리·인게임 API(2999 포트)·오버레이는 쓰지 않는다.
 */
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { Agent, request } from 'node:https';
import { promisify } from 'node:util';

const run = promisify(execFile);
const IS_WIN = process.platform === 'win32';
const TIMEOUT_MS = 8_000;

// LCU 는 Riot 자체 서명 인증서를 쓴다. 접속 대상은 127.0.0.1 로 고정되어 있어 검증을 끈다.
const agent = new Agent({ rejectUnauthorized: false, keepAlive: true });

export type LcuCreds = { port: number; token: string };

const LOCKFILE_CANDIDATES = [
  'C:\\Riot Games\\League of Legends\\lockfile',
  'D:\\Riot Games\\League of Legends\\lockfile',
  'C:\\Program Files\\Riot Games\\League of Legends\\lockfile',
];

/** 실행 중인 클라이언트의 포트·토큰을 찾는다. 없으면 null. */
export async function discover(): Promise<LcuCreds | null> {
  // 테스트용 수동 지정
  if (process.env.PRISM_LCU_PORT && process.env.PRISM_LCU_TOKEN) {
    return { port: Number(process.env.PRISM_LCU_PORT), token: process.env.PRISM_LCU_TOKEN };
  }
  if (!IS_WIN) return null;

  // 1) 프로세스 명령줄에서 읽는다 — 설치 경로와 무관
  try {
    const { stdout } = await run(
      'powershell.exe',
      ['-NoProfile', '-Command', "Get-CimInstance Win32_Process -Filter \"name='LeagueClientUx.exe'\" | Select-Object -ExpandProperty CommandLine"],
      { timeout: TIMEOUT_MS, windowsHide: true },
    );
    const port = stdout.match(/--app-port=(\d+)/)?.[1];
    const token = stdout.match(/--remoting-auth-token=([\w-]+)/)?.[1];
    if (port && token) return { port: Number(port), token };
  } catch {
    /* 아래 lockfile 로 */
  }

  // 2) 기본 설치 경로의 lockfile — 형식 name:pid:port:password:protocol
  for (const path of LOCKFILE_CANDIDATES) {
    try {
      const [, , port, token] = (await readFile(path, 'utf8')).split(':');
      if (port && token) return { port: Number(port), token };
    } catch {
      /* 다음 후보 */
    }
  }
  return null;
}

/** 게임(인게임 프로세스)이 실행 중인지. OS 프로세스 목록만 보고, 롤에는 아무 요청도 하지 않는다. */
export async function isGameRunning(): Promise<boolean> {
  if (process.env.PRISM_FAKE_INGAME) return process.env.PRISM_FAKE_INGAME === '1';
  if (!IS_WIN) return false;
  try {
    const { stdout } = await run('tasklist', ['/FI', 'IMAGENAME eq League of Legends.exe', '/NH'], { timeout: TIMEOUT_MS, windowsHide: true });
    return stdout.includes('League of Legends.exe');
  } catch {
    return false;
  }
}

export class LcuError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** 응답 본문을 Buffer 로 받는다. 메서드는 GET 고정. */
function getRaw(creds: LcuCreds, path: string): Promise<{ status: number; type: string; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port: creds.port,
        path,
        method: 'GET',
        agent,
        timeout: TIMEOUT_MS,
        headers: {
          Authorization: 'Basic ' + Buffer.from(`riot:${creds.token}`).toString('base64'),
          Accept: 'application/json',
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, type: String(res.headers['content-type'] ?? ''), body: Buffer.concat(chunks) }));
      },
    );
    req.on('timeout', () => req.destroy(new LcuError(`LCU 응답 시간 초과: ${path}`)));
    req.on('error', (e) => reject(e instanceof LcuError ? e : new LcuError(`LCU 연결 실패: ${e.message}`)));
    req.end();
  });
}

/** LCU 읽기. 2xx 가 아니면 LcuError. */
export async function lcuGet<T = any>(creds: LcuCreds, path: string): Promise<T> {
  const r = await getRaw(creds, path);
  if (r.status < 200 || r.status >= 300) throw new LcuError(`LCU ${r.status}: ${path}`, r.status);
  return JSON.parse(r.body.toString('utf8')) as T;
}

/** 클라이언트 내장 게임 데이터 에셋(아이콘 등). /lol-game-data/assets/ 아래만 허용. */
export async function lcuAsset(creds: LcuCreds, path: string) {
  if (!path.startsWith('/lol-game-data/assets/')) throw new LcuError('허용되지 않은 에셋 경로');
  const r = await getRaw(creds, path);
  if (r.status !== 200) throw new LcuError(`LCU ${r.status}: ${path}`, r.status);
  return r;
}
