/**
 * Prism 공개 사이트 (prism.web.app).
 * 로그인 없이 보는 층: 증강 가이드·증강 도감·모임 소개. 회원 데이터는 단 한 줄도 넣지 않는다 (CLAUDE.md 2-11).
 * 데이터는 게임 파일에서 만든 app/data/*.json 을 그대로 묶는다.
 */
import augData from '../../app/data/mayhem-augments.json';
import champData from '../../app/data/mayhem-champions.json';
import { guideOf, type ChampionProfile, type FitLevel, type MayhemAugment, type Rarity } from '../../app/synergy-core';
import { LINKS } from './config';

const AUGS = augData.augments as MayhemAugment[];
const CHAMPS = champData.champions as unknown as Record<string, ChampionProfile>;
const DATA = { augments: AUGS, champions: CHAMPS as unknown as Record<number, ChampionProfile> };
const AUG = Object.fromEntries(AUGS.map((a) => [a.id, a]));
const CHAMP_LIST = Object.entries(CHAMPS)
  .map(([id, c]) => ({ id: Number(id), ...c }))
  .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
const VERSION = augData.version.split('.').slice(0, 2).join('.');

const RARITY_KO: Record<Rarity, string> = { prismatic: '프리즘', gold: '골드', silver: '실버' };
const LEVEL_KO: Record<FitLevel, string> = { best: '잘 맞음', good: '무난', weak: '안 맞음', none: '조건 없음' };
const ROLE_KO: Record<string, string> = { marksman: '원딜', mage: '마법사', assassin: '암살자', fighter: '전사', tank: '탱커', support: '서포터' };

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const CDRAGON = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/';
/** 클라이언트 자원 경로 → CommunityDragon 주소 (일러스트처럼 큰 그림만 바로 불러온다) */
const cdragon = (p: string | null) => (p ? CDRAGON + p.replace('/lol-game-data/assets/', '').toLowerCase() : '');
const champImg = (id: number, cls = '') => `<img class="${cls}" loading="lazy" alt="" src="/img/champ/${id}.png">`;
const augImg = (a: MayhemAugment) => (a.icon ? `<img loading="lazy" alt="" src="/img/aug/${a.id}.png">` : '<span class="noimg"></span>');
/** 한글 초성 검색: "ㅇㄹ" → 아리 */
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const initials = (s: string) => [...s].map((ch) => { const c = ch.charCodeAt(0) - 0xac00; return c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : ch; }).join('');
const matchName = (name: string, q: string) => !q || name.includes(q) || initials(name).includes(q) || name.replace(/\s/g, '').includes(q.replace(/\s/g, ''));

// ───── 테마 ─────
const applyTheme = (t: string | null) => (t ? document.documentElement.setAttribute('data-theme', t) : document.documentElement.removeAttribute('data-theme'));
try { applyTheme(localStorage.getItem('prism-theme')); } catch { /* 저장소 없음 */ }
$('theme').onclick = () => {
  const cur = document.documentElement.getAttribute('data-theme') ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = cur === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try { localStorage.setItem('prism-theme', next); } catch { /* 저장소 없음 */ }
};

// ───── 바로가기 ─────
const channelLinks = (cls = '') =>
  [
    LINKS.discord && `<a class="ch discord ${cls}" href="${esc(LINKS.discord)}" target="_blank" rel="noopener"><svg><use href="#i-discord"/></svg><span>디스코드</span></a>`,
    LINKS.kakao && `<a class="ch kakao ${cls}" href="${esc(LINKS.kakao)}" target="_blank" rel="noopener"><svg><use href="#i-talk"/></svg><span>카카오톡</span></a>`,
  ].filter(Boolean).join('');
$('chan').innerHTML = channelLinks();

// ───── 화면 ─────
const TABS = [['guide', '증강 가이드'], ['augments', '증강 도감'], ['prism', 'Prism']] as const;
let current = '';

function home() {
  const picks = ['아리', '징크스', '가렌', '럭스', '야스오', '말파이트', '세라핀', '이즈리얼'].map((n) => CHAMP_LIST.find((c) => c.name === n)).filter(Boolean) as typeof CHAMP_LIST;
  return `<section class="hero"><div class="beam"></div><div class="wrap">
      <span class="gem float" style="--size:88px"><img src="/brand/prism-256.png" alt=""></span>
      <h1>아수라장 증강, 내 챔피언에 맞는 걸로</h1>
      <p>세 개 중에 뭘 골라야 할지 모를 때. 챔피언을 고르면 프리즘·골드·실버별로 어울리는 증강을 바로 보여드려요.</p>
      ${searchBox()}
      <div class="quick">${picks.map((c) => `<a href="#/guide/${c.id}">${champImg(c.id)}${esc(c.name)}</a>`).join('')}</div>
    </div></section>
    <section class="section"><div class="wrap"><div class="grid3">
      <div class="card feature"><span class="ic"><svg><use href="#i-spark"/></svg></span><h3>챔피언별 증강 가이드</h3><p>챔피언 역할·피해 유형·스킬과 증강 효과를 맞춰, 등급마다 어울리는 증강과 그 이유를 보여줍니다.</p></div>
      <div class="card feature"><span class="ic"><svg><use href="#i-book"/></svg></span><h3>증강 도감</h3><p>현재 아수라장 증강 ${AUGS.filter((a) => !a.disabled).length}개를 한국어 설명 그대로. 이름이나 효과(치명타, 보호막…)로 찾을 수 있어요.</p></div>
      <div class="card feature"><span class="ic"><svg><use href="#i-users"/></svg></span><h3>Prism 모임</h3><p>매일 밤 같이 증바람 하는 모임. 회원이 되면 우리끼리의 실전 증강 승률과 기록이 열립니다.</p></div>
    </div></div></section>`;
}

let searchIdx = 0;
function searchBox() {
  return `<div class="search"><svg><use href="#i-search"/></svg><input id="q" autocomplete="off" placeholder="챔피언 이름 (초성도 돼요: ㅇㄹ)"><div class="suggest" id="suggest" hidden></div></div>`;
}
function bindSearch() {
  const q = document.getElementById('q') as HTMLInputElement | null;
  if (!q) return;
  const box = $('suggest');
  const hits = () => CHAMP_LIST.filter((c) => matchName(c.name, q.value.trim())).slice(0, 6);
  const paint = () => {
    const h = q.value.trim() ? hits() : [];
    box.hidden = !h.length;
    box.innerHTML = h.map((c, i) => `<a href="#/guide/${c.id}" class="${i === searchIdx ? 'on' : ''}">${champImg(c.id)}${esc(c.name)}<span class="meta">${esc(ROLE_KO[c.roles[0]] ?? '')}</span></a>`).join('');
  };
  q.oninput = () => { searchIdx = 0; paint(); };
  q.onkeydown = (e) => {
    const h = hits();
    if (e.key === 'ArrowDown') { searchIdx = Math.min(searchIdx + 1, h.length - 1); paint(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { searchIdx = Math.max(searchIdx - 1, 0); paint(); e.preventDefault(); }
    else if (e.key === 'Enter' && h[searchIdx]) location.hash = `#/guide/${h[searchIdx].id}`;
  };
}

let pickerQuery = '';
function picker() {
  const list = CHAMP_LIST.filter((c) => matchName(c.name, pickerQuery));
  return `<section class="section"><div class="wrap">
    <h2>증강 가이드</h2><p class="lead">챔피언을 고르면 등급별로 어울리는 증강이 나옵니다.</p>
    <div class="card"><div class="picker-bar"><input class="input" id="pq" placeholder="챔피언 검색 (초성 가능)" value="${esc(pickerQuery)}"><span class="meta">${list.length}명</span></div>
    <div class="champs">${list.map((c) => `<a href="#/guide/${c.id}">${champImg(c.id)}${esc(c.name)}</a>`).join('')}</div></div>
  </div></section>`;
}

let guideAll = false;
const guideMore: Record<Rarity, boolean> = { prismatic: false, gold: false, silver: false };
function guide(id: number) {
  const g = guideOf(DATA, id);
  const c = CHAMPS[id];
  if (!g || !c) return `<div class="wrap empty">챔피언을 찾을 수 없습니다.</div>`;
  const row = (f: (typeof g.gold)[number]) => {
    const a = AUG[f.id];
    if (!a) return '';
    const why = f.missing ? `<b>${esc(f.missing)}</b>` : f.reasons.map((r) => `<span>${esc(r)}</span>`).join('');
    return `<div class="ga ${f.level}">${augImg(a)}<span class="nm">${esc(a.name)}</span>${guideAll ? `<span class="lv ${f.level}">${LEVEL_KO[f.level]}</span>` : '<span></span>'}
      <div class="why">${why}</div><details><summary>${esc(a.note || '효과 보기')}</summary><p>${esc(a.desc)}</p></details></div>`;
  };
  const col = (r: Rarity) => {
    const all = guideAll ? g[r] : g[r].filter((f) => f.level === 'best');
    const limit = guideMore[r] ? all.length : 8;
    return `<div class="card col ${r}"><h3><i></i>${RARITY_KO[r]}<span class="meta">잘 맞음 ${g[r].filter((f) => f.level === 'best').length}개</span></h3>
      ${all.slice(0, limit).map(row).join('') || '<p class="meta">없음</p>'}
      ${all.length > limit ? `<button type="button" class="btn ghost sm" data-more="${r}">${all.length - limit}개 더 보기</button>` : ''}</div>`;
  };
  const tags = [ROLE_KO[c.roles[0]], c.roles[1] && ROLE_KO[c.roles[1]], c.damage === 'MIX' ? 'AP·AD' : c.damage, c.range === 'ranged' ? '원거리' : '근접'].filter(Boolean);
  return `<section class="section" style="padding-top:var(--s6)"><div class="wrap">
    <div class="banner"><img alt="" src="${cdragon(c.splash)}"><a class="btn sm back" href="#/guide">다른 챔피언</a>
      <div class="in"><span class="meta" style="color:rgba(255,255,255,.7)">아수라장 증강 가이드</span><h1>${esc(c.name)}</h1><div class="tags">${tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div></div></div>
    <div class="guide-bar"><div class="seg"><button type="button" data-all="0" class="${guideAll ? '' : 'on'}">잘 맞는 것</button><button type="button" data-all="1" class="${guideAll ? 'on' : ''}">전체 비교</button></div>
      <span class="sp"></span><span class="meta">게임 데이터 ${esc(VERSION)} 기준</span></div>
    <div class="cols">${(['prismatic', 'gold', 'silver'] as Rarity[]).map(col).join('')}</div>
    <div class="card locked"><span class="gem"><img src="/brand/prism-64.png" alt=""></span>
      <div><b>실제로 이겼을까?</b><span>Prism 회원끼리의 실전 기록으로 이 챔피언·증강의 승률을 봅니다. 회원에게만 열려요.</span></div>
      <a class="btn primary" href="#/prism">Prism 알아보기</a></div>
    <p class="meta" style="margin-top:var(--s4)">"잘 맞음"은 챔피언 역할·피해 유형·스킬과 증강 효과를 맞춰 본 어울림입니다. 증강 자체의 세기와는 다를 수 있어요.</p>
  </div></section>`;
}

let adexQuery = '';
let adexRarity: 'all' | Rarity = 'all';
function augments() {
  const order: Rarity[] = ['prismatic', 'gold', 'silver'];
  const list = AUGS.filter((a) => !a.disabled && (adexRarity === 'all' || a.rarity === adexRarity) && (!adexQuery || a.name.includes(adexQuery) || a.desc.includes(adexQuery) || a.note.includes(adexQuery)))
    .sort((a, b) => order.indexOf(a.rarity) - order.indexOf(b.rarity) || a.name.localeCompare(b.name, 'ko'));
  return `<section class="section"><div class="wrap">
    <h2>아수라장 증강 도감</h2><p class="lead">현재 아수라장 증강 ${AUGS.filter((a) => !a.disabled).length}개 · 게임 데이터 ${esc(VERSION)} 기준</p>
    <div class="picker-bar"><input class="input" id="aq" placeholder="이름·효과 검색 (예: 치명타, 보호막)" value="${esc(adexQuery)}">
      <div class="seg">${(['all', ...order] as const).map((k) => `<button type="button" data-r="${k}" class="${adexRarity === k ? 'on' : ''}">${k === 'all' ? '전체' : RARITY_KO[k]}</button>`).join('')}</div>
      <span class="meta">${list.length}개</span></div>
    ${list.length ? `<div class="adex">${list.map((a) => `<div class="ai">${augImg(a)}<span class="nm"><i class="rdot ${a.rarity}"></i>${esc(a.name)}</span><span class="note2">${esc(a.note)}</span><p>${esc(a.desc)}</p></div>`).join('')}</div>` : '<div class="empty">찾는 증강이 없습니다.</div>'}
  </div></section>`;
}

function prism() {
  const sk = (n: number) => `<div class="sk">${Array.from({ length: n }, (_, i) => `<i style="width:${90 - ((i * 17) % 45)}%"></i>`).join('')}</div>`;
  return `<section class="hero" style="padding-bottom:var(--s7)"><div class="beam"></div><div class="wrap">
      <span class="gem float" style="--size:72px"><img src="/brand/prism-256.png" alt=""></span>
      <h1>매일 밤, 같이 증바람</h1>
      <p>Prism은 칼바람 아수라장을 같이 하는 모임입니다. 게임보다 사람이 먼저인 곳. 아는 분의 추천으로 들어올 수 있어요.</p>
      ${channelLinks() ? `<div class="cta">${channelLinks()}</div>` : ''}
    </div></section>
    <section class="section" style="padding-top:var(--s6)"><div class="wrap">
      <h2>들어오는 길</h2><p class="lead">세 단계면 됩니다.</p>
      <div class="join">
        <div class="card"><h3>디스코드에 들어오기</h3><p>아는 회원에게 초대를 부탁하거나, 위 버튼으로 들어와 인사를 남겨주세요.</p></div>
        <div class="card"><h3>Prism 앱 켜기</h3><p>롤 옆에 켜두는 동반 앱. 챔프 선택 때 팀 구성과 어울리는 증강을, 게임 중에는 내 챔피언 증강 가이드를 띄워줍니다.</p></div>
        <div class="card"><h3>같이 한 판</h3><p>판이 쌓이면 내 기록과 모임 기록이 자동으로 채워집니다. 같이 하면 이기는 사람도 보여요.</p></div>
      </div>
    </div></section>
    <section class="section" style="padding-top:0"><div class="wrap">
      <h2>회원에게 열리는 것</h2><p class="lead">기록은 회원에게만 보입니다.</p>
      <div class="grid3">
        ${[['실전 증강 승률', '우리가 실제로 고른 증강이 얼마나 이겼는지'], ['같이 하면 이기는 사람', '모임 판에서 승률이 높은 조합'], ['모임 기록', '최다 킬, 가장 긴 판, 이달 최다 출전, 도감 1위']]
          .map(([t, d]) => `<div class="card preview"><div class="blur"><h3 style="margin:0 0 var(--s4)">${t}</h3>${sk(5)}</div><div class="over"><div><b>${t}</b><div class="meta" style="margin-top:var(--s1)">${d}</div></div></div></div>`).join('')}
      </div>
    </div></section>`;
}

function render() {
  const [, view = '', arg] = location.hash.split('/');
  current = view;
  $('tabs').innerHTML = $('tabs-m').innerHTML = TABS.map(([k, l]) => `<a href="#/${k}" class="${current === k ? 'on' : ''}">${l}</a>`).join('');
  const main = $('main');
  main.innerHTML = view === 'guide' ? (arg ? guide(Number(arg)) : picker()) : view === 'augments' ? augments() : view === 'prism' ? prism() : home();
  document.title = view === 'guide' && arg && CHAMPS[arg] ? `${CHAMPS[arg].name} 아수라장 증강 · Prism` : view === 'augments' ? '아수라장 증강 도감 · Prism' : view === 'prism' ? 'Prism 모임' : 'Prism · 아수라장 증강 가이드';
  bind();
}

function bind() {
  bindSearch();
  document.querySelectorAll<HTMLButtonElement>('[data-all]').forEach((b) => (b.onclick = () => { guideAll = b.dataset.all === '1'; keep(render); }));
  document.querySelectorAll<HTMLButtonElement>('[data-more]').forEach((b) => (b.onclick = () => { guideMore[b.dataset.more as Rarity] = true; keep(render); }));
  document.querySelectorAll<HTMLButtonElement>('[data-r]').forEach((b) => (b.onclick = () => { adexRarity = b.dataset.r as typeof adexRarity; keep(render); }));
  live('pq', (v) => (pickerQuery = v));
  live('aq', (v) => (adexQuery = v));
}
/** 검색어 입력: 다시 그린 뒤에도 커서 위치를 지킨다 */
function live(id: string, set: (v: string) => void) {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (!el) return;
  el.oninput = () => {
    set(el.value.trim());
    const pos = el.selectionStart ?? el.value.length;
    keep(render);
    const n = document.getElementById(id) as HTMLInputElement;
    n.focus();
    n.setSelectionRange(pos, pos);
  };
}
/** 다시 그려도 스크롤 위치 유지 */
function keep(fn: () => void) { const y = scrollY; fn(); scrollTo(0, y); }

addEventListener('hashchange', () => { guideMore.prismatic = guideMore.gold = guideMore.silver = false; render(); scrollTo(0, 0); });
render();
