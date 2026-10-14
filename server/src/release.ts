/**
 * 앱 설치 파일 배포: GitHub Release 를 이 서버가 대신 내준다 (저장소를 비공개로 돌려도 앱 업데이트·웹 다운로드가 그대로).
 *  - GET /app/latest                     최신 버전 정보 (앱 업데이트 확인용)
 *  - GET /app/download                   최신 설치 파일 (웹 '앱 받기')
 *  - GET /app/download/:tag/:file        그 버전의 설치 파일 (버전마다 바뀌지 않는 주소 — 스토어 등록용)
 * 저장소가 비공개면 RELEASE_TOKEN(읽기 전용 GitHub 토큰, 서버 비밀값)으로 읽는다. 공개면 없어도 된다.
 * 설치 파일은 버전 주소 기준으로 Cloudflare 캐시에 둔다 (GitHub 요청을 줄인다).
 */
import { HttpError, json, type Env } from './util.js';

const ASSET = 'Prism-Setup.exe';
const repo = (env: Env) => env.RELEASE_REPO || 'b1x91/prism';
const origin = (req: Request, env: Env) => (env.PUBLIC_URL || new URL(req.url).origin).replace(/\/$/, '');

function gh(env: Env, path: string, accept = 'application/vnd.github+json', redirect: RequestRedirect = 'follow') {
  const headers: Record<string, string> = { Accept: accept, 'User-Agent': 'prism-server', 'X-GitHub-Api-Version': '2022-11-28' };
  if (env.RELEASE_TOKEN) headers.Authorization = `Bearer ${env.RELEASE_TOKEN}`;
  return fetch(`${env.RELEASE_API || 'https://api.github.com'}/repos/${repo(env)}${path}`, { headers, redirect });
}

/** 설치 파일 받기: GitHub 는 서명된 파일 저장소 주소로 보낸다. 그 주소에는 토큰을 보내지 않는다 */
async function asset(env: Env, id: number) {
  const r = await gh(env, `/releases/assets/${id}`, 'application/octet-stream', 'manual');
  const to = r.status >= 300 && r.status < 400 ? r.headers.get('Location') : null;
  return to ? fetch(to, { headers: { 'User-Agent': 'prism-server' } }) : r;
}

type Rel = { tag_name: string; body?: string; assets: { id: number; name: string; size: number }[] };

async function release(env: Env, tag?: string): Promise<Rel> {
  const r = await gh(env, tag ? `/releases/tags/${encodeURIComponent(tag)}` : '/releases/latest');
  if (r.status === 404) throw new HttpError(404, '배포된 버전을 찾지 못했습니다.');
  if (!r.ok) throw new HttpError(502, `배포 정보를 가져오지 못했습니다 (${r.status}).`);
  return r.json<Rel>();
}

/** 최신 버전 정보. 5분 캐시 */
export async function latest(req: Request, env: Env) {
  const cache = (caches as unknown as { default: Cache }).default;
  const key = new Request(new URL('/app/latest', req.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;
  const rel = await release(env);
  const a = rel.assets.find((x) => x.name === ASSET);
  const res = json({
    version: rel.tag_name.replace(/^app-v/, '').replace(/^v/, ''),
    tag: rel.tag_name,
    notes: (rel.body ?? '').slice(0, 600),
    size: a?.size ?? 0,
    url: a ? `${origin(req, env)}/app/download/${encodeURIComponent(rel.tag_name)}/${ASSET}` : '',
  });
  res.headers.set('Cache-Control', 'public, max-age=300');
  await cache.put(key, res.clone());
  return res;
}

/** 설치 파일. 태그가 없으면 최신판으로 보낸다 (버전 주소로 이동) */
export async function download(req: Request, env: Env, tag?: string, file?: string) {
  if (!tag) {
    const rel = await release(env);
    return Response.redirect(`${origin(req, env)}/app/download/${encodeURIComponent(rel.tag_name)}/${ASSET}`, 302);
  }
  if (file !== ASSET) throw new HttpError(404, 'not found');
  const cache = (caches as unknown as { default: Cache }).default;
  const key = new Request(new URL(`/app/download/${encodeURIComponent(tag)}/${ASSET}`, req.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;
  const rel = await release(env, tag);
  const a = rel.assets.find((x) => x.name === ASSET);
  if (!a) throw new HttpError(404, '설치 파일이 없습니다.');
  const r = await asset(env, a.id);
  if (!r.ok || !r.body) throw new HttpError(502, `설치 파일을 가져오지 못했습니다 (${r.status}).`);
  const res = new Response(r.body, {
    headers: {
      'Content-Type': 'application/vnd.microsoft.portable-executable',
      'Content-Disposition': `attachment; filename="${ASSET}"`,
      'Content-Length': String(a.size),
      // 버전 주소의 내용은 바뀌지 않는다
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
  await cache.put(key, res.clone());
  return res;
}
