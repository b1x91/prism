/**
 * 앱 설치 파일 배포: GitHub Release 를 이 서버가 대신 내준다 (저장소를 비공개로 돌려도 앱 업데이트·웹 다운로드가 그대로).
 *  - GET /app/latest                     최신 버전 정보 (앱 업데이트 확인용)
 *  - GET /app/download                   최신 설치 파일 (웹 '앱 받기')
 *  - GET /app/download/:tag/:file        그 버전의 설치 파일 (버전마다 바뀌지 않는 주소 — 스토어 등록용)
 * 저장소가 비공개면 RELEASE_TOKEN(읽기 전용 GitHub 토큰, 서버 비밀값)으로 읽는다. 공개면 없어도 된다.
 * 설치 파일은 버전 주소 기준으로 Cloudflare 캐시에 둔다 (GitHub 요청을 줄인다).
 * 토큰이 없으면 GitHub API 를 쓰지 않는다: 무인증 API 는 IP 당 시간 60회라 Cloudflare 에서는 자주 403 이 난다.
 * 대신 공개 주소(github.com/…/releases/…)로 받는다 — 이 주소에는 그런 한도가 없다.
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

const web = (env: Env, path: string, redirect: RequestRedirect = 'follow') =>
  fetch(`https://github.com/${repo(env)}${path}`, { headers: { 'User-Agent': 'prism-server' }, redirect });

/** 최신 태그: /releases/latest 가 /releases/tag/<태그> 로 보내는 것을 읽는다 (API 없이) */
async function tagFromWeb(env: Env): Promise<string | null> {
  const r = await web(env, '/releases/latest', 'manual').catch(() => null);
  const tag = (r?.headers.get('Location') ?? '').match(/\/releases\/tag\/([^/?#]+)/)?.[1];
  return tag ? decodeURIComponent(tag) : null;
}

/**
 * 최신 태그. GitHub 는 Cloudflare 주소에서 오는 요청을 가끔 막는다(403·429) → 공개 주소, API 순서로 묻고,
 * 둘 다 실패하면 마지막으로 알아낸 태그(D1 ext_cache)를 쓴다. 업데이트 확인이 그 때문에 끊기지 않게.
 */
async function latestTag(env: Env): Promise<string> {
  const tag = (await tagFromWeb(env)) ?? (await release(env).then((r) => r.tag_name).catch(() => null));
  if (tag) {
    await env.DB.prepare('INSERT INTO ext_cache (k, v, at) VALUES (?, ?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v, at = excluded.at')
      .bind('release-tag', tag, Date.now()).run().catch(() => {});
    return tag;
  }
  const row = await env.DB.prepare('SELECT v FROM ext_cache WHERE k = ?').bind('release-tag').first<{ v: string }>().catch(() => null);
  if (row?.v) return row.v;
  throw new HttpError(502, '배포 정보를 가져오지 못했습니다. 잠시 뒤 다시 시도해주세요.');
}

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
  // 크기를 모르면 0 (앱은 실행 파일 머리만 확인한다)
  const rel: Rel = env.RELEASE_TOKEN ? await release(env) : { tag_name: await latestTag(env), assets: [{ id: 0, name: ASSET, size: 0 }] };
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
    const t = env.RELEASE_TOKEN ? (await release(env)).tag_name : await latestTag(env);
    return Response.redirect(`${origin(req, env)}/app/download/${encodeURIComponent(t)}/${ASSET}`, 302);
  }
  if (file !== ASSET) throw new HttpError(404, 'not found');
  const cache = (caches as unknown as { default: Cache }).default;
  const key = new Request(new URL(`/app/download/${encodeURIComponent(tag)}/${ASSET}`, req.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;
  let r: Response;
  if (env.RELEASE_TOKEN) {
    const rel = await release(env, tag);
    const a = rel.assets.find((x) => x.name === ASSET);
    if (!a) throw new HttpError(404, '설치 파일이 없습니다.');
    r = await asset(env, a.id);
  } else {
    r = await web(env, `/releases/download/${encodeURIComponent(tag)}/${ASSET}`);
    if (r.status === 404) throw new HttpError(404, '설치 파일이 없습니다.');
    // 공개 주소가 막히면(403·429) API 로 한 번 더
    if (!r.ok) {
      const a = await release(env, tag).then((x) => x.assets.find((y) => y.name === ASSET)).catch(() => undefined);
      if (a) r = await asset(env, a.id);
    }
  }
  if (!r.ok || !r.body) throw new HttpError(502, `설치 파일을 가져오지 못했습니다 (${r.status}).`);
  const len = r.headers.get('Content-Length');
  const res = new Response(r.body, {
    headers: {
      'Content-Type': 'application/vnd.microsoft.portable-executable',
      'Content-Disposition': `attachment; filename="${ASSET}"`,
      ...(len ? { 'Content-Length': len } : {}),
      // 버전 주소의 내용은 바뀌지 않는다
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
  await cache.put(key, res.clone());
  return res;
}
