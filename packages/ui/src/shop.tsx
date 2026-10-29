/**
 * 피스·상점·꾸민 머리·공개 페이지 (CLAUDE.md v3.24). 웹·앱 공용.
 *  - ProfileHero: 내 페이지·회원 페이지·공개 페이지의 머리 (좌우 끝까지, 꾸밈 적용)
 *  - ShopView: 피스 잔액·버는 법·상품 (사면 바로 장착, 가진 것은 장착/해제)
 *  - PublicProfileView: 로그인 없이 보는 그 사람의 강점 (모임 정보 없음)
 */
import { useKept } from './kept';
import { useEffect, useId, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  CHAMPIONS, DEX_LEVEL_KO, LAUNCH, PIECE, forSale, isNewItem, itemDiscount, priceWith, saleOf, RARITY_SHOP_KO, ROLE_KO, SHOP, SHOP_ITEM, SLOT_KO, cdragon, pct, shareUrl, styleOf,
  type Api, type Deco, type DexLevel, type InsightKind, type Presence, type PublicProfile, type Shop, type ShopItem, type ShopSlot, josa } from '@prism/core';
import { ChampImg, Empty, Gem, MemberFace, PresenceDot, Toggle, useSkins } from './basics';
import { useLoad } from './crew';
import { BgScene } from './bgscene';
import { NickName } from './studio';
import { Icon } from './icons';
import { BuyDialog } from './buy';
import { BoxBanner, BoxDialog, GiftDialog, GiftNotice, GoodsGrid } from './goods';
import { ShopSkeleton, useReveal, Swap, fadeCls } from './skeleton';

/** 상점 칸 (칭호는 팔지 않고 얻는다, v3.99) */
const SLOTS: ShopSlot[] = ['bg', 'frame', 'fx', 'name'];
/** 산 배경이 없을 때 깔리는 기본 색 (회원마다 정해진 색 — 이름으로 고른다, 바뀌지 않는다). 상점의 '배경'으로 바꿀 수 있다 */
const BASE_TINTS = ['#3b5bdb', '#7048e8', '#0c8599', '#2b8a3e', '#c2255c', '#e8590c', '#5f3dc4', '#1971c2'];
export function baseTint(seed: string) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return BASE_TINTS[h % BASE_TINTS.length];
}
const titleOf = (d?: Deco) => (d?.title ? SHOP.find((x) => x.id === d.title)?.name : undefined);

/** 피스 아이콘: 납작한 금빛 마름모 하나 (가장 단순하게, 숫자 오른쪽에 둔다) */
/** ink: 금빛 바탕(받기 버튼) 위에서는 금빛이 묻히므로 글자색으로 그린다 */
export function PieceIcon({ size = 16, ink }: { size?: number; ink?: boolean }) {
  return (
    <svg className="piece-ic" width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 1.5 14.5 8 8 14.5 1.5 8z" fill={ink ? 'currentColor' : '#f2b233'} />
      {!ink && <path d="M8 1.5 14.5 8H1.5z" fill="#ffd970" />}
    </svg>
  );
}

/** 보유 피스 (사이드바·상단 바). 상점에서 사고 나면 바로 맞춘다 */
let pieceBal: number | null = null;
const pieceSubs = new Set<() => void>();
const setPieces = (n: number | null) => { pieceBal = n; pieceSubs.forEach((f) => f()); };
/** 받은 피스를 잔액에 더한다 — 숫자가 dur 동안 차오른다 (미션 받기) */
export function addPieces(n: number, dur = 700) {
  if (pieceBal === null || !n) return;
  const from = pieceBal, to = from + n, t0 = performance.now();
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setPieces(to); return; }
  const step = (t: number) => { const k = Math.min(1, (t - t0) / dur); setPieces(Math.round(from + (to - from) * (1 - (1 - k) ** 3))); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
/** 서버의 잔액을 다시 받아 차이만큼 차오르게 (출석처럼 접속 알림으로 들어온 피스) */
export async function refreshPieces(api: Api, dur = 700) {
  api.forget?.('/api/shop');
  const d = await api.get<Shop>('/api/shop').catch(() => null);
  if (!d) return;
  if (pieceBal === null) { setPieces(d.balance); return; }
  addPieces(d.balance - pieceBal, dur);
}
export function usePieces(api: Api | null, every = 300_000) {
  const n = useSyncExternalStore((f) => { pieceSubs.add(f); return () => { pieceSubs.delete(f); }; }, () => pieceBal);
  useEffect(() => {
    if (!api) { setPieces(null); return; }
    const load = () => api.get<Shop>('/api/shop').then((d) => setPieces(d.balance)).catch(() => {});
    load();
    const t = setInterval(load, every);
    return () => clearInterval(t);
  }, [api, every]);
  return n;
}

/** 피스 아이콘 + 숫자 */
export function Piece({ n, size = 16 }: { n: number; size?: number }) {
  return <span className="piece"><b>{n.toLocaleString()}</b><PieceIcon size={size} /></span>;
}

/** 머리 (좌우 끝까지). 꾸밈: 테두리(frame) · 효과(fx) · 이름(name) · 칭호(title) */
export function ProfileHero({ nick, intro, art, skin, champion, deco, corner, actions, chips, children, mini, stage, lift, presence }: {
  nick: string; intro?: string; art?: string; skin?: number | null; champion?: number | null; deco?: Deco;
  corner?: ReactNode; actions?: ReactNode; chips?: ReactNode; children?: ReactNode; mini?: boolean;
  /** 상점 진열: 배경 그림 없이 가운데에 상품 하나만 */
  stage?: boolean;
  /** 아래 첫 칸이 머리 아래쪽에 겹쳐 올라온다 (회원 페이지 분석판) */
  lift?: boolean;
  /** 접속 상태: 얼굴 오른쪽 아래 점 (앱 파랑 · 웹 회색 · 롤 켜짐 주황/초록, 이름은 마우스를 올리면) */
  presence?: Presence | null;
}) {
  const skins = useSkins();
  const title = titleOf(deco);
  // 배경: 산 배경(bg)이 있으면 그 장면, 없으면 회원마다 정해진 기본 색 (스킨 그림은 얼굴에만 — 배경은 상점에서 산다)
  void art; // 예전 호출부 호환 (배경 그림은 이제 쓰지 않는다)
  const tint = stage || deco?.bg ? '' : baseTint(nick);
  return (
    <header className={`phero ${mini ? 'mini' : ''} ${lift ? 'lift' : ''} ${stage ? 'stage' : ''} ${deco?.bg ? 'has-bg' : ''} ${deco?.frame ?? ''} ${deco?.fx ?? ''}`}>
      {deco?.bg && <BgScene id={deco.bg} />}
      {tint && <span className="phero-tint" style={{ ['--tint' as string]: tint }} aria-hidden="true" />}
      {deco?.fx && <span className="phero-fx" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <i key={i} />)}</span>}
      <div className="phero-in">
        {corner && <div className="phero-corner">{corner}</div>}
        {actions && <div className="phero-actions">{actions}</div>}
        <div className="phero-main">
          <span className="phero-face"><MemberFace nick={nick} skin={skin} champion={champion} skins={skins} size={stage ? 72 : mini ? 48 : 112} /><PresenceDot p={presence} /></span>
          <div className="phero-txt">
            {title && <span className={`phero-title r-${SHOP_ITEM[deco!.title!]?.rarity ?? 'common'}`}>{title}</span>}
            <h1 className={`phero-name ${deco?.name ?? ''}`}><NickName nick={nick} /></h1>
            {intro && <p className="phero-intro">{intro}</p>}
            {chips && <div className="phero-chips">{chips}</div>}
          </div>
        </div>
        {children}
      </div>
    </header>
  );
}

/** 공유 버튼 (v3.86): 누르면 짧은 링크(/p/123)를 복사한다. 끄는 단추는 없다 — 링크로 보이는 것은 꾸민 머리·판수·도감·활약뿐 */
export function ShareButton({ api, id }: { api: Api; id: string; shared?: boolean; onChange?: (on: boolean) => void }) {
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');
  const copy = async () => {
    setErr('');
    try {
      const r = await api.post<{ shared: boolean; code: number | null }>('/api/me/share', { on: true });
      await navigator.clipboard.writeText(shareUrl(r.code ?? id));
      setDone(true); setTimeout(() => setDone(false), 2000);
    } catch (e) { setErr(e instanceof Error ? e.message : '복사하지 못했어요'); }
  };
  return <button type="button" className="btn sm" onClick={copy} title={err || undefined}><Icon name={done ? 'check' : 'link'} />{done ? '링크 복사됨' : err ? '다시 눌러 주세요' : '공유 링크'}</button>;
}

// ───────── 상점 ─────────

type Me = { nick: string; skin?: number | null; champion?: number | null };
const RARITY_ORDER = ['mythic', 'legendary', 'epic', 'rare', 'common'] as const;

/** onGo: 이용권이 쓰이는 화면으로 (도감·미션·내 페이지 — 인사이트는 내 페이지의 '인사이트' 칸) */
export function ShopView({ api, me, open = true, onGo }: { api: Api; me: Me; open?: boolean; onGo?: (to: 'dex' | 'missions' | 'me', insight?: InsightKind) => void }) {
  if (!open) return <ShopSoon api={api} me={me} />;
  return <ShopOpen api={api} me={me} onGo={onGo} />;
}

/** 상점 준비 중 (운영진 외): 흐린 진열장 몇 개 + 모으고 있는 피스 */
function ShopSoon({ me }: { api: Api; me: Me }) {
  const tease: Deco[] = [{ frame: 'frame-prism' }, { bg: 'bg-crystal' }, { title: 'title-ruler', name: 'name-gold' }];
  return (
    <section className="shop-soon">
      <div className="ss-stage" aria-hidden="true">
        {tease.map((d, i) => <div key={i} className={`ss-card c${i}`}><ProfileHero stage nick={me.nick} skin={me.skin} champion={me.champion} deco={d} /></div>)}
      </div>
      <div className="ss-txt">
        <span className="ss-k">PRISM SHOP</span>
        <h1>상점 준비 중</h1>
        <p>배경 · 머리 테두리 · 머리 효과 · 이름 효과 · 칭호를 준비하고 있어요.<br />{PIECE}는 지금도 모이고 있으니, 열리면 모은 {PIECE}로 바로 꾸밀 수 있어요.</p>
      </div>
    </section>
  );
}

/** '인기' 탭에 보이는 상품 수 */
const HOT_MAX = 12;

function ShopOpen({ api, me, onGo }: { api: Api; me: Me; onGo?: (to: 'dex' | 'missions' | 'me', insight?: InsightKind) => void }) {
  const { data: loaded, error, reload } = useLoad<Shop>(api, '/api/shop');
  // 사고 난 뒤 서버가 돌려준 새 상태를 바로 쓴다 (다시 받는 동안 옛 잔액이 보이지 않게)
  const [fresh, setFresh] = useState<Shop | null>(null);
  const data = fresh ?? loaded;
  useEffect(() => { setFresh(null); }, [loaded]);
  const [boxOpen, setBoxOpen] = useState(false);
  const [giving, setGiving] = useState<ShopItem | null>(null);
  const update = (s: Shop) => { setFresh(s); setPieces(s.balance); };
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  // '인기'가 첫 탭. 지금은 판매 기록이 적어 무작위로 섞은 12개 (들어올 때마다 한 번, HOT_MAX)
  const [slot, setSlot] = useKept<ShopSlot | 'hot' | 'use'>('shop.slot', 'hot');
  const [hot] = useState(() => SHOP.filter(forSale).map((x) => [Math.random(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x));
  const [owned, setOwned] = useKept('shop.owned', false);
  const [buying, setBuying] = useState<ShopItem | null>(null);
  const run = async (k: string, f: () => Promise<unknown>) => { setBusy(k); setMsg(''); try { await f(); await reload(); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); } };
  useEffect(() => { if (data) setPieces(data.balance); }, [data]);
  const rv = useReveal(Boolean(data));
  if (error) return <Empty>{error}</Empty>;
  if (!data) return <ShopSkeleton />;
  const list = slot === 'use' ? [] : slot === 'hot' ? hot.filter((x) => !owned || data.owned.includes(x.id)).slice(0, HOT_MAX)
    : SHOP.filter((x) => x.slot === slot && (!owned || data.owned.includes(x.id)))
      .sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity) || b.price - a.price);
  const launchOn = Date.now() >= LAUNCH.from && Date.now() < LAUNCH.until;
  const launchEnd = `${new Date(LAUNCH.until - 1).getMonth() + 1}/${new Date(LAUNCH.until - 1).getDate()}`;
  const count = (sl: ShopSlot) => [SHOP.filter((x) => x.slot === sl && data.owned.includes(x.id)).length, SHOP.filter((x) => x.slot === sl).length];
  return (<Swap on={rv} skeleton={<ShopSkeleton />}>
    <div className={`shop ${fadeCls(rv)}`}>
      <header className="shop-head">
        <h1>상점</h1>
        {(data.rates?.discount ?? 0) > 0 && <span className="shop-sale">특별회원 {Math.round((data.rates!.discount) * 100)}% 할인{launchOn && !data.rates?.admin ? ' · 새 배경 제외' : ''}</span>}
        {launchOn && <span className="shop-sale launch">새 배경 7종 · 일반 배경 {Math.round(LAUNCH.sale * 100)}% 할인 ~{launchEnd}</span>}
      </header>
      {msg && <p className="l" style={{ margin: 0 }}>{msg}</p>}
      <GiftNotice data={data} />
      <BoxBanner data={data} onOpen={() => setBoxOpen(true)} />
      <div className="shop-bar">
        <nav className="shop-tabs" aria-label="종류">
          <button type="button" className={`hot ${slot === 'hot' ? 'on' : ''}`} onClick={() => setSlot('hot')}><Icon name="spark" />인기</button>
          {SLOTS.map((sl) => {
          const [o, t] = count(sl);
          return <button key={sl} type="button" className={slot === sl ? 'on' : ''} onClick={() => setSlot(sl)}>{SLOT_KO[sl]}<small>{o}/{t}</small></button>;
        })}
          <button type="button" className={slot === 'use' ? 'on' : ''} onClick={() => setSlot('use')}>이용권</button>
        </nav>
        <span className="sp" />
        {slot !== 'use' && <label className="shop-own"><span>보유하고 있는 아이템 보기</span><Toggle on={owned} label="보유하고 있는 아이템 보기" onChange={setOwned} /></label>}
      </div>
      {slot === 'use' ? <GoodsGrid api={api} data={data} onChange={update} onOpenInsight={(k) => onGo?.('me', k)} onGo={(to) => onGo?.(to)} />
        : list.length ? <div className="shop-grid">{list.map((x) => <ShopCard key={x.id} x={x} me={me} data={data} busy={busy === x.id}
        onBuy={() => setBuying(x)} onGift={data.uses?.app ? () => setGiving(x) : undefined}
        onEquip={(on) => run(x.id, () => api.post('/api/me/equip', { slot: x.slot, id: on ? x.id : null }))} />)}</div>
        : <Empty>아직 보유한 {slot === 'hot' ? '아이템이' : josa(SLOT_KO[slot], '이/가')} 없어요.</Empty>}
      {boxOpen && <BoxDialog api={api} data={data} me={me} onClose={() => setBoxOpen(false)} onDone={update} />}
      {giving && <GiftDialog api={api} item={giving} data={data} onClose={() => setGiving(null)} onDone={update} />}
      {buying && <BuyDialog api={api} item={buying} data={data} me={me} onClose={() => setBuying(null)} onDone={(s) => { setBuying(null); setPieces(s.balance); reload(); }} />}
    </div>
  </Swap>);
}

function ShopCard({ x, me, data, busy, onBuy, onEquip, onGift }: { x: ShopItem; me: Me; data: Shop; busy: boolean; onBuy: () => void; onEquip: (on: boolean) => void; onGift?: () => void }) {
  const disc = itemDiscount(x.id, data.rates?.discount ?? 0, data.rates?.admin), price = priceWith(x.price, disc);
  const fresh = isNewItem(x.id), sale = saleOf(x.id);
  const own = data.owned.includes(x.id), on = data.deco[x.slot] === x.id, lack = price - data.balance;
  // 진열: 그 상품 하나만 무대 위에 (다른 꾸밈은 빼서 상품마다 다르게 보이게)
  const look: Deco = { [x.slot]: x.id };
  return (
    <article className={`shop-card r-${x.rarity} s-${x.slot} ${on ? 'on' : ''} ${own ? 'own' : ''}`}>
      <div className="sc-prev">
        <ProfileHero stage nick={me.nick} skin={me.skin} champion={me.champion} deco={look} />
        <span className={`sc-rar r-${x.rarity}`}><i />{RARITY_SHOP_KO[x.rarity]}</span>
        {on ? <span className="sc-tag on"><Icon name="check" />장착 중</span> : own ? <span className="sc-tag">보유</span>
          : fresh ? <span className="sc-tag new">NEW</span> : sale > 0 && disc === sale ? <span className="sc-tag sale">{Math.round(sale * 100)}% 할인</span> : null}
      </div>
      <div className="sc-body">
        <b className="sc-nm">{x.name}</b>
        <span className="sc-desc">{x.desc}</span>
        <div className="sc-act">
          {onGift && <button type="button" className="sc-gift" title="앱을 쓰는 멤버에게 선물하기" aria-label={`${x.name} 선물하기`} onClick={onGift}><Icon name="gift" /></button>}
          {own
            ? <button type="button" className={`btn sm ${on ? '' : 'equip'}`} disabled={busy} onClick={() => onEquip(!on)}>{on ? '해제' : '장착'}</button>
            : <><span className={`sc-price ${lack > 0 ? 'lack' : ''}`}><b>{price.toLocaleString()}</b><PieceIcon size={16} />{disc > 0 && <s>{x.price.toLocaleString()}</s>}</span>
              <button type="button" className={`btn sm ${lack > 0 ? 'lack' : 'primary'}`} disabled={busy || lack > 0} onClick={onBuy}>{lack > 0 ? `${lack.toLocaleString()} 부족` : '구매'}</button></>}
        </div>
      </div>
    </article>
  );
}

// ───────── 공개 페이지 (로그인 없이) ─────────

export function PublicProfileView({ data, join }: { data: PublicProfile; join?: ReactNode }) {
  const skins = useSkins();
  const main = data.main;
  const art = data.skin && skins?.[data.skin] ? skins[data.skin].splash : main ? cdragon(CHAMPIONS[main]?.splash) : '';
  const feats: [string, number][] = ([['펜타킬', data.feats.penta], ['쿼드라킬', data.feats.quadra], ['피해량 1위', data.feats.dmgTop], ['받은 피해 1위', data.feats.takenTop]] as [string, number][]).filter(([, n]) => n > 0);
  return (
    <div className="stack" style={{ gap: 16 }}>
      <ProfileHero nick={data.nick} intro={data.intro} art={art} skin={data.skin} champion={main} deco={data.deco}
        chips={<><span className="pill dark">아수라장 {data.total.n}판</span>{data.masters.length > 0 && <span className="pill dark">마스터 {data.masters.length}</span>}</>}
        actions={join} />
      <div className="grid2">
        <section className="card pad">
          <div className="card-head"><h2>도감</h2><span className="sp" /><span className="meta">챔프·증강</span></div>
          <div className="pub-levels">{([5, 4, 3, 2, 1] as DexLevel[]).map((l) => <span key={l} className={`pub-lv l${l}`}><i>Lv{l}</i><b>{data.levels[l]}</b><small>{DEX_LEVEL_KO[l]}</small></span>)}</div>
          {data.masters.length > 0 && <div className="pub-masters">{data.masters.slice(0, 12).map((id) => <ChampImg key={id} id={id} size={36} />)}</div>}
        </section>
        <section className="card pad">
          <div className="card-head"><h2>활약</h2></div>
          {feats.length ? <div className="pub-feats">{feats.map(([k, n]) => <span key={k} className="pub-feat"><b>{n}</b><small>{k}</small></span>)}</div> : <Empty>기록된 활약이 아직 없어요.</Empty>}
        </section>
      </div>
    </div>
  );
}
