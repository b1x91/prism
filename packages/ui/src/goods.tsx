/**
 * 꾸밈 밖 상품 (CLAUDE.md v3.99). 웹·앱 공용.
 *  - 상점 '이용권' 칸: 인사이트권 · 명장면 액자 · 도감 돋보기 · 미션 다시 뽑기
 *  - 랜덤박스: 상점 맨 위 진열 + 여는 창 (흔들림 → 등급 빛 예고 → 터짐 → 상품 공개)
 *  - 선물 창 (앱을 쓰는 멤버끼리) · 받은 선물 알림
 *  - 인사이트 리포트 (내 페이지) · 명장면 카드 (회원 페이지)
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  AUGMENT, CHAMPIONS, GIFT_NOTE_MAX, INSIGHTS, INSIGHT_DAYS, INSIGHT_EACH_SUM, MULTI_KO, insightBundleOk, RARITY_SHOP_KO, REROLL_PER_WEEK, SHOP_ITEM, SLOT_KO, USE_PRICE, BOX_ODDS, boxPool, cdragon, itemDiscount, josa, priceWith, storyOf,
  type Api, type AugReport, type GoldenReport, type Highlight, type InsightKind, type PartnerNear, type PartnerPick, type PartnerReport, type Shop, type ShopItem, type ShopRarity,
} from '@prism/core';
import { AugImg, ChampImg, Empty, GlassBtn, MemberFace, useSkins } from './basics';
import { AugmentLink } from './augment';
import { Icon } from './icons';
import { PieceIcon, ProfileHero } from './shop';
import { Bone, imgIn } from './skeleton';
import { ActBtn, pause, type ActState } from './motion';
import { cancelFrame, nextFrame } from './frame';

type Me = { nick: string; skin?: number | null; champion?: number | null };
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const msgOf = (e: unknown) => (e instanceof Error ? e.message : String(e));
const pct = (v: number) => `${Math.round(v * 100)}%`;
const daysLeft = (until: number) => Math.max(1, Math.ceil((until - Date.now()) / 86_400_000));

/** 값 + 피스 아이콘 */
function Price({ n, lack }: { n: number; lack?: boolean }) {
  return <span className={`sc-price ${lack ? 'lack' : ''}`}><b>{n.toLocaleString()}</b><PieceIcon size={16} /></span>;
}

// ───────── 상점 '이용권' 칸 ─────────

/** 이용권 칸. onOpenInsight: 열린 리포트 보기 (내 페이지로) */
export function GoodsGrid({ api, data, onChange, onOpenInsight, onGo }: {
  api: Api; data: Shop; onChange: (s: Shop) => void;
  onOpenInsight?: (k: InsightKind) => void;
  /** 다른 화면으로 (도감·미션·내 페이지) */
  onGo?: (to: 'dex' | 'missions' | 'me') => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const disc = data.rates?.discount ?? 0;
  const u = data.uses;
  const buy = async (key: string, body: object) => {
    setBusy(key); setErr('');
    try { onChange(await api.post<Shop>('/api/shop/use', body)); } catch (e) { setErr(msgOf(e)); } finally { setBusy(null); }
  };
  if (!u) return <Empty>앱을 새 버전으로 업데이트하면 이용권이 보여요.</Empty>;
  return (
    <div className="stack" style={{ gap: 12 }}>
      {err && <p className="l" role="alert" style={{ margin: 0 }}>{err}</p>}
      <div className="goods-grid">
        {/* 셋을 한 번에: 하나도 열지 않았을 때만 (v3.181) */}
        {insightBundleOk(u.insight) && (() => {
          const price = priceWith(USE_PRICE.insightAll, disc), each = priceWith(INSIGHT_EACH_SUM, disc), lack = price > data.balance;
          return (
            <article className="goods-card r-legendary gc-bundle">
              <div className="gc-art ins all" aria-hidden="true">{INSIGHTS.map((x) => <span key={x.id}><InsightGlyph k={x.id} /></span>)}</div>
              <div className="gc-body">
                <span className="sc-rar r-legendary"><i />인사이트권 3종 · {INSIGHT_DAYS}일</span>
                <b className="sc-nm">인사이트 3종 한 번에</b>
                <span className="sc-desc">증강 습관 · 베스트 파트너 · 골든타임을 함께 열어요</span>
                <div className="sc-act">
                  {each > price && <s className="gc-was">{each.toLocaleString()}</s>}<Price n={price} lack={lack} />
                  <button type="button" className={`btn sm ${lack ? 'lack' : 'primary'}`} disabled={busy === 'all' || lack} onClick={() => buy('all', { kind: 'insight', ref: 'all' })}>{lack ? `${(price - data.balance).toLocaleString()} 부족` : '모두 열기'}</button>
                </div>
              </div>
            </article>
          );
        })()}
        {INSIGHTS.map((x) => {
          const until = u.insight[x.id], price = priceWith(USE_PRICE.insight[x.id], disc), lack = price > data.balance;
          return (
            <article key={x.id} className={`goods-card r-${x.rarity} ${until ? 'on' : ''}`}>
              <div className="gc-art ins" aria-hidden="true"><InsightGlyph k={x.id} /></div>
              <div className="gc-body">
                <span className={`sc-rar r-${x.rarity}`}><i />인사이트권 · {INSIGHT_DAYS}일</span>
                <b className="sc-nm">{x.name}</b>
                <span className="sc-desc">{x.desc}</span>
                <div className="sc-act">
                  {until
                    ? <><span className="gc-left">{daysLeft(until)}일 남음</span><button type="button" className="btn sm equip" onClick={() => onOpenInsight?.(x.id)}>리포트 보기</button></>
                    : <><Price n={price} lack={lack} /><button type="button" className={`btn sm ${lack ? 'lack' : 'primary'}`} disabled={busy === x.id || lack} onClick={() => buy(x.id, { kind: 'insight', ref: x.id })}>{lack ? `${(price - data.balance).toLocaleString()} 부족` : '열기'}</button></>}
                </div>
              </div>
            </article>
          );
        })}
        {(() => {
          const price = priceWith(USE_PRICE.frame, disc), lack = price > data.balance;
          return (
            <article className={`goods-card r-epic ${u.frame ? 'on' : ''}`}>
              <div className="gc-art frm" aria-hidden="true"><Icon name="frame" /></div>
              <div className="gc-body">
                <span className="sc-rar r-epic"><i />한 번 사면 계속</span>
                <b className="sc-nm">명장면 액자</b>
                <span className="sc-desc">쿼드라·펜타킬 판 하나를 이야기와 함께 내 페이지에 걸어 둬요</span>
                <div className="sc-act">
                  {u.frame
                    ? <><span className="gc-left">{u.pinned ? '걸어 둠' : '보유'}</span><button type="button" className="btn sm equip" onClick={() => onGo?.('me')}>{u.pinned ? '내 페이지에서 보기' : '명장면 고르기'}</button></>
                    : <><Price n={price} lack={lack} /><button type="button" className={`btn sm ${lack ? 'lack' : 'primary'}`} disabled={busy === 'frame' || lack} onClick={() => buy('frame', { kind: 'frame' })}>{lack ? `${(price - data.balance).toLocaleString()} 부족` : '구매'}</button></>}
                </div>
              </div>
            </article>
          );
        })()}
        <article className="goods-card r-rare">
          <div className="gc-art lens" aria-hidden="true"><Icon name="search" /></div>
          <div className="gc-body">
            <span className="sc-rar r-rare"><i />도감에서 · 칸마다</span>
            <b className="sc-nm">도감 돋보기</b>
            <span className="sc-desc">아직 안 해 본 챔프·증강의 마스터 조건과 팁을 미리 봐요 · 연 칸 {u.lens.length}개</span>
            <div className="sc-act"><Price n={priceWith(USE_PRICE.lens, disc)} /><button type="button" className="btn sm" onClick={() => onGo?.('dex')}>도감으로</button></div>
          </div>
        </article>
        <article className="goods-card r-rare">
          <div className="gc-art reroll" aria-hidden="true"><Icon name="shuffle" /></div>
          <div className="gc-body">
            <span className="sc-rar r-rare"><i />미션에서 · 주 {REROLL_PER_WEEK}회</span>
            <b className="sc-nm">미션 다시 뽑기</b>
            <span className="sc-desc">이번 주 미션 하나를 다른 미션으로 · 이번 주 {u.rerollsLeft}번 남음</span>
            <div className="sc-act"><Price n={priceWith(USE_PRICE.reroll, disc)} /><button type="button" className="btn sm" onClick={() => onGo?.('missions')}>미션으로</button></div>
          </div>
        </article>
      </div>
    </div>
  );
}

function InsightGlyph({ k }: { k: InsightKind }) {
  if (k === 'golden') return <svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="15" /><path d="M24 14v10l7 5" /></svg>;
  if (k === 'partner') return <svg viewBox="0 0 48 48"><circle cx="18" cy="19" r="6" /><circle cx="31" cy="19" r="6" /><path d="M8 36a10 10 0 0 1 20 0M21 36a10 10 0 0 1 20 0" /></svg>;
  return <svg viewBox="0 0 48 48"><path d="M24 7l14 8v18l-14 8-14-8V15z" /><path d="M24 7v34M10 15l28 18M38 15 10 33" /></svg>;
}

// ───────── 받은 선물 알림 ─────────

const SEEN_GIFT = 'prism-gift-seen';
export function GiftNotice({ data }: { data: Shop }) {
  const [seen, setSeen] = useState<number>(() => { try { return Number(localStorage.getItem(SEEN_GIFT) ?? 0); } catch { return 0; } });
  const g = data.uses?.gifts.find((x) => x.at > seen);
  if (!g) return null;
  const item = SHOP_ITEM[g.item];
  const close = () => { try { localStorage.setItem(SEEN_GIFT, String(g.at)); } catch { /* 없음 */ } setSeen(g.at); };
  return (
    <div className="gift-note" role="status">
      <span className="gn-ic" aria-hidden="true"><Icon name="gift" /></span>
      <div className="gn-txt"><b>{g.fromNick.split('#')[0]}님이 {item ? josa(item.name, '을/를') : '꾸밈을'} 선물했어요</b>{g.note && <span>“{g.note}”</span>}</div>
      <button type="button" className="btn sm" onClick={close}>고마워요</button>
    </div>
  );
}

// ───────── 선물 창 ─────────

type Target = { id: string; nick: string; skin: number | null; main: number | null; owned: string[] };
export function GiftDialog({ api, item, data, onClose, onDone }: { api: Api; item: ShopItem; data: Shop; onClose: () => void; onDone: (s: Shop) => void }) {
  const skins = useSkins();
  const [list, setList] = useState<Target[] | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const price = priceWith(item.price, itemDiscount(item.id, data.rates?.discount ?? 0, data.rates?.admin)), lack = price > data.balance;
  useEffect(() => { api.get<{ members: Target[] }>('/api/shop/gift').then((r) => setList(r.members)).catch((e) => setErr(msgOf(e))); }, [api]);
  useEffect(() => { const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); }; addEventListener('keydown', esc); return () => removeEventListener('keydown', esc); }, [busy, onClose]);
  const send = async () => {
    if (!to) return;
    setBusy(true); setErr('');
    try { const s = await api.post<Shop>('/api/shop/gift', { to, id: item.id, note }); setDone(list?.find((x) => x.id === to)?.nick ?? ''); onDone(s); }
    catch (e) { setErr(msgOf(e)); } finally { setBusy(false); }
  };
  return createPortal(
    <div className="md-wrap" role="dialog" aria-modal="true" aria-label={`${item.name} 선물하기`}>
      <button type="button" className="md-scrim" aria-label="닫기" onClick={busy ? undefined : onClose} />
      <div className="gift-dlg">
        <header className="gd-head"><Icon name="gift" /><b>{josa(item.name, '을/를')} 선물해요</b><span className="sp" /><button type="button" className="gd-x" aria-label="닫기" onClick={onClose}><Icon name="x" /></button></header>
        {done !== null ? (
          <div className="gd-done">
            <span className="gd-ok" aria-hidden="true"><Icon name="check" /></span>
            <b>{done.split('#')[0]}님께 선물했어요</b>
            <p className="meta">디스코드에도 알려 드렸어요.</p>
            <button type="button" className="btn primary" onClick={onClose}>닫기</button>
          </div>
        ) : <>
          <p className="meta" style={{ margin: 0 }}>Prism 앱을 쓰는 멤버에게만 보낼 수 있어요. 이미 가진 멤버는 고를 수 없어요.</p>
          <div className="gd-list">
            {!list ? Array.from({ length: 6 }, (_, i) => <span key={i} className="gd-who sk" aria-hidden="true" />)
              : list.length ? list.map((m) => {
                const has = m.owned.includes(item.id);
                return (
                  <button key={m.id} type="button" className={`gd-who ${to === m.id ? 'on' : ''}`} disabled={has} onClick={() => setTo(m.id)}>
                    <MemberFace nick={m.nick} skin={m.skin} champion={m.main} skins={skins} size={32} />
                    <span className="gd-nm">{m.nick.split('#')[0]}</span>
                    {has && <small>이미 가짐</small>}
                  </button>
                );
              }) : <Empty>앱을 쓰는 다른 멤버가 아직 없어요.</Empty>}
          </div>
          <label className="gd-note"><span>한마디 <small>{note.length}/{GIFT_NOTE_MAX}</small></span>
            <input value={note} maxLength={GIFT_NOTE_MAX} placeholder="어제 펜타 축하해요!" onChange={(e) => setNote(e.target.value)} />
          </label>
          {err && <p className="l" role="alert" style={{ margin: 0 }}>{err}</p>}
          <footer className="gd-foot">
            <Price n={price} lack={lack} /><span className="meta">보유 {data.balance.toLocaleString()}</span><span className="sp" />
            <button type="button" className={`btn ${lack ? 'lack' : 'primary'}`} disabled={!to || busy || lack} onClick={send}><Icon name="gift" />{busy ? '보내는 중…' : lack ? `${(price - data.balance).toLocaleString()} 부족` : '선물하기'}</button>
          </footer>
        </>}
      </div>
    </div>, document.body,
  );
}

// ───────── 랜덤박스 ─────────

/** 상점 맨 위 진열 */
export function BoxBanner({ data, onOpen }: { data: Shop; onOpen: () => void }) {
  const price = priceWith(USE_PRICE.box, data.rates?.discount ?? 0), left = boxPool(data.owned).length, lack = price > data.balance;
  return (
    <section className="box-banner">
      <div className="bb-art" aria-hidden="true"><PrismBox icon /></div>
      <div className="bb-txt">
        <span className="bb-k">RANDOM BOX</span>
        <h2>프리즘 상자</h2>
        <p>아직 없는 꾸밈 하나가 나와요. 겹치지 않아요.</p>
        <div className="bb-odds">{(['common', 'rare', 'epic', 'legendary'] as ShopRarity[]).map((r) => <span key={r} className={`r-${r}`}><i />{RARITY_SHOP_KO[r]} {Math.round(BOX_ODDS[r] * 100)}%</span>)}</div>
      </div>
      <div className="bb-act">
        <Price n={price} lack={lack} />
        <button type="button" className={`btn ${lack || !left ? 'lack' : 'primary'}`} disabled={lack || !left} onClick={onOpen}>{!left ? '모두 모았어요' : lack ? `${(price - data.balance).toLocaleString()} 부족` : '열어 보기'}</button>
        <small className="meta">남은 꾸밈 {left}개</small>
      </div>
    </section>
  );
}

/** 상자 그림: 닫힌 상자 · 열린 상자 두 장(같은 틀)을 겹쳐 두고, 열리는 순간 섬광 아래에서 바꾼다 */
const CHEST = '/box/chest-v1.webp', CHEST_OPEN = '/box/chest-open-v1.webp', CHEST_ICON = '/box/chest-icon-v1.webp';
function PrismBox({ icon, open }: { icon?: boolean; open?: boolean }) {
  return (
    <span className={`pbox${icon ? ' icon' : ''}${open ? ' open' : ''}`}>
      <span className="pb-glow" />
      <img className="pb-img" src={icon ? CHEST_ICON : CHEST} alt="" draggable={false} />
      {!icon && <img className="pb-img pb-open" src={CHEST_OPEN} alt="" draggable={false} />}
      <span className="pb-sheen" />
      <span className="pb-leak" />
    </span>
  );
}

type BoxPhase = 'idle' | 'charge' | 'tease' | 'burst' | 'reveal' | 'error';
/** 여는 창: 모으기(서버가 고르는 동안, 최소 1.6초, 흔들림이 점점 세짐) → 등급 예고(등급마다 한 번 뛰고 빛 고리) → 섬광 속에서 뚜껑이 열리고 결정 조각이 터짐 → 상자에서 상품이 떠오름 */
export function BoxDialog({ api, data, me, onClose, onDone }: { api: Api; data: Shop; me: Me; onClose: () => void; onDone: (s: Shop) => void }) {
  const [phase, setPhase] = useState<BoxPhase>('idle');
  const [cur, setCur] = useState<Shop>(data);
  const [item, setItem] = useState<ShopItem | null>(null);
  const [tease, setTease] = useState<ShopRarity>('common');
  const [err, setErr] = useState('');
  const [wearing, setWearing] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (ms: number, f: () => void) => { timers.current.push(setTimeout(f, ms)); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  // 열린 상자 그림을 미리 받아 둔다 — 터지는 순간 바꿔 끼울 때 비지 않게
  useEffect(() => { const i = new Image(); i.src = CHEST_OPEN; i.decode?.().catch(() => {}); }, []);
  useEffect(() => { const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && (phase === 'idle' || phase === 'reveal' || phase === 'error')) onClose(); }; addEventListener('keydown', esc); return () => removeEventListener('keydown', esc); }, [onClose, phase]);
  const price = priceWith(USE_PRICE.box, cur.rates?.discount ?? 0), left = boxPool(cur.owned).length, lack = price > cur.balance;
  const open = () => {
    setPhase('charge'); setErr(''); setItem(null); setTease('common');
    const t0 = performance.now();
    api.post<{ item: string; state: Shop }>('/api/shop/box', {}).then((r) => {
      const it = SHOP_ITEM[r.item];
      const rm = reduced();
      const wait = rm ? 0 : Math.max(0, 1600 - (performance.now() - t0));
      later(wait, () => {
        setItem(it); setCur(r.state); onDone(r.state);
        if (rm) { setTease(it.rarity); setPhase('reveal'); return; }
        // 등급 예고: 일반부터 차례로 올라가 그 상품의 등급에서 멈춘다 (희귀 이상은 단계마다 0.35초)
        const ladder = (['common', 'rare', 'epic', 'legendary'] as ShopRarity[]).slice(0, ['common', 'rare', 'epic', 'legendary'].indexOf(it.rarity) + 1);
        setPhase('tease');
        ladder.forEach((r, i) => later(i * 480, () => setTease(r)));
        const t = ladder.length * 480 + 220;
        later(t, () => setPhase('burst'));
        later(t + 900, () => setPhase('reveal'));
      });
    }).catch((e) => { setErr(msgOf(e)); setPhase('error'); });
  };
  const wear = async () => {
    if (!item) return;
    setWearing(true);
    try { const s = await api.post<Shop>('/api/me/equip', { slot: item.slot, id: item.id }); setCur(s); onDone(s); onClose(); }
    catch (e) { setErr(msgOf(e)); } finally { setWearing(false); }
  };
  return createPortal(
    <div className="md-wrap" role="dialog" aria-modal="true" aria-label="프리즘 상자 열기">
      <button type="button" className="md-scrim" aria-label="닫기" onClick={phase === 'idle' || phase === 'reveal' || phase === 'error' ? onClose : undefined} />
      <div className={`box-dlg ph-${phase} t-${tease}`}>
        <div className="bx-stage" aria-hidden={phase === 'reveal'}>
          <span className="bx-dim" />
          <span className="bx-rays" />
          <span className="bx-beam" />
          <span className="bx-sparks">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ ['--i' as string]: i }} />)}</span>
          {phase === 'tease' && <span key={tease} className="bx-ring" />}
          <span className="bx-box"><PrismBox open={phase === 'burst' || phase === 'reveal'} /></span>
          <span className="bx-shards">{Array.from({ length: 16 }, (_, i) => <i key={i} style={{ ['--i' as string]: i }} />)}</span>
          {phase === 'reveal' && item && (item.rarity === 'epic' || item.rarity === 'legendary') && <span className="bx-confetti">{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ ['--i' as string]: i }} />)}</span>}
          <span className="bx-flash" />
          {phase === 'reveal' && item && (
            <div className={`bx-item r-${item.rarity}`}>
              <div className="bx-prev"><ProfileHero stage nick={me.nick} skin={me.skin ?? null} champion={me.champion ?? null} deco={{ [item.slot]: item.id }} /></div>
            </div>
          )}
        </div>
        <div className="bx-info" aria-live="polite">
          {phase === 'idle' && <><b className="bx-t">프리즘 상자</b><p className="meta">아직 없는 꾸밈 하나 · 남은 꾸밈 {left}개</p></>}
          {(phase === 'charge' || phase === 'tease' || phase === 'burst') && <><b className="bx-t">여는 중…</b><p className={`bx-tease r-${tease}`}>{phase === 'charge' ? '빛이 모이고 있어요' : `${RARITY_SHOP_KO[tease]}의 빛`}</p></>}
          {phase === 'reveal' && item && <>
            <span className={`sc-rar r-${item.rarity}`}><i />{RARITY_SHOP_KO[item.rarity]} · {SLOT_KO[item.slot]}</span>
            <b className="bx-t">{item.name}</b>
            <p className="meta">{item.desc}</p>
          </>}
          {phase === 'error' && <p className="l" role="alert">{err}</p>}
        </div>
        <div className="bx-act">
          {phase === 'idle' || phase === 'error'
            ? <><Price n={price} lack={lack} /><span className="sp" /><button type="button" className="btn" onClick={onClose}>닫기</button><button type="button" className={`btn ${lack || !left ? 'lack' : 'primary'}`} disabled={lack || !left} onClick={open}><Icon name="box" />{lack ? `${(price - cur.balance).toLocaleString()} 부족` : '열기'}</button></>
            : phase === 'reveal'
              ? <><button type="button" className="btn" onClick={onClose}>닫기</button><span className="sp" />
                {left > 0 && !lack && <button type="button" className="btn" onClick={open}>하나 더 <small>{price.toLocaleString()}</small></button>}
                <button type="button" className="btn equip" disabled={wearing} onClick={wear}>{wearing ? '장착하는 중…' : '바로 장착'}</button></>
              : <span className="meta">잠시만요…</span>}
        </div>
      </div>
    </div>, document.body,
  );
}

// ───────── 인사이트 리포트 (내 페이지) ─────────

type Person = { id: string; nick: string; skin: number | null; main: number | null };
type InsightRes = { kind: InsightKind; until: number; report: AugReport | GoldenReport | PartnerReport; people?: Person[] };
type Viewer = { nick: string; skin?: number | null; champion?: number | null };
type BuyRef = InsightKind | 'all';
const IN_EASE = 'cubic-bezier(.16, 1, .3, 1)';
const vi = (i: number) => ({ ['--i' as string]: i });

/**
 * 담는 칸의 높이가 바뀌면 그 프레임에 이전 높이 → 새 높이로 미끄러진다 (탭을 바꾸거나 자리표시가 실제 리포트로 바뀔 때).
 * ResizeObserver 는 그리기 전에 불리므로 높이가 툭 바뀌는 프레임이 보이지 않는다. 움직이는 동안만 넘치는 부분을 감춘다.
 */
function useAutoHeight() {
  const outer = useRef<HTMLDivElement>(null), inner = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const o = outer.current, i = inner.current;
    if (!o || !i || typeof ResizeObserver === 'undefined') return;
    let last = i.offsetHeight, anim: Animation | null = null, tok = 0;
    const ro = new ResizeObserver(() => {
      const h = i.offsetHeight;
      const from = anim?.playState === 'running' ? o.getBoundingClientRect().height : last;
      last = h;
      if (Math.abs(h - from) < 2 || reduced()) return;
      anim?.cancel();
      const my = ++tok;
      o.style.overflow = 'hidden';
      anim = o.animate([{ height: `${from}px` }, { height: `${h}px` }], { duration: 480, easing: IN_EASE });
      anim.finished.then(() => { if (my === tok) o.style.overflow = ''; }, () => undefined);
    });
    ro.observe(i);
    return () => { ro.disconnect(); anim?.cancel(); o.style.overflow = ''; };
  }, []);
  return { outer, inner };
}

/** 0 → 값으로 차오르는 숫자 (첫 공개 때만) */
function Count({ to, play, fmt = (v: number) => String(Math.round(v)), delay = 0 }: { to: number; play: boolean; fmt?: (v: number) => string; delay?: number }) {
  const [v, setV] = useState(play && !reduced() ? 0 : to);
  useEffect(() => {
    if (!play || reduced()) { setV(to); return; }
    let id = 0; const t0 = performance.now() + delay, D = 900;
    const step = (t: number) => {
      const x = Math.min(1, Math.max(0, (t - t0) / D));
      setV(to * (1 - Math.pow(1 - x, 3)));
      if (x < 1) id = nextFrame(step);
    };
    id = nextFrame(step);
    return () => cancelFrame(id);
  }, [to, play, delay]);
  return <>{fmt(v)}</>;
}

/** 탭: 고른 표시가 다음 탭으로 미끄러진다. 잠긴 탭의 자물쇠는 열리면 접히며 사라진다 */
function InsightTabs({ k, open, onPick }: { k: InsightKind; open: (x: InsightKind) => boolean; onPick: (x: InsightKind) => void }) {
  const box = useRef<HTMLElement>(null);
  const [ind, setInd] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const measure = () => { const el = box.current?.querySelector<HTMLButtonElement>('button.on'); if (el) setInd({ x: el.offsetLeft, w: el.offsetWidth }); };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' && box.current ? new ResizeObserver(measure) : null;
    if (ro && box.current) { ro.observe(box.current); box.current.querySelectorAll('button').forEach((b) => ro.observe(b)); }
    return () => ro?.disconnect();
  }, [k]);
  // 좁은 화면에서 가로로 밀리는 탭: 고른 탭이 보이게
  useEffect(() => { box.current?.querySelector<HTMLButtonElement>('button.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduced() ? 'auto' : 'smooth' }); }, [k]);
  return (
    <nav ref={box} className={`ins-tabs ${ind ? 'live' : ''}`} aria-label="리포트" role="tablist">
      {ind && <span className="it-ind" aria-hidden="true" style={{ transform: `translateX(${ind.x}px)`, width: ind.w }} />}
      {INSIGHTS.map((x) => (
        <button key={x.id} type="button" role="tab" aria-selected={k === x.id} className={k === x.id ? 'on' : ''} onClick={() => onPick(x.id)}>
          <span className={`it-lock ${open(x.id) ? 'gone' : ''}`} aria-hidden="true"><LockGlyph /></span>{x.name}
        </button>
      ))}
    </nav>
  );
}

/** 고리가 열리는 자물쇠 (잠금 해제 연출) */
function LockGlyph() {
  return <svg className="lk" viewBox="0 0 24 24" aria-hidden="true"><path className="lk-sh" d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /><rect className="lk-bd" x="4.5" y="10.5" width="15" height="10" rx="2.5" /></svg>;
}

/** 내 페이지 '인사이트' 칸: 세 리포트 탭. 열리지 않은 리포트는 잠금 + 하나씩/셋을 한 번에 열기 (v3.181) */
export function InsightPanel({ api, data, me, focus, onShop, onChange }: { api: Api; data: Shop; me?: Viewer; focus?: InsightKind | null; onShop?: () => void; onChange?: (s: Shop) => void }) {
  const u = data.uses;
  const isOpen = (x: InsightKind) => (u?.insight[x] ?? 0) > Date.now();
  const first = (focus && isOpen(focus) ? focus : INSIGHTS.find((x) => isOpen(x.id))?.id) ?? focus ?? 'aug';
  const [k, setK] = useState<InsightKind>(first);
  // 보이는 리포트: 탭을 바꾸면 지금 것이 살짝 물러난 뒤(0.15초) 바뀐다
  const [view, setView] = useState<InsightKind>(first);
  const [leaving, setLeaving] = useState(false);
  const [res, setRes] = useState<Partial<Record<InsightKind, InsightRes>>>({});
  const [act, setAct] = useState<{ ref: BuyRef; st: ActState } | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [err, setErr] = useState('');
  // 리포트가 처음 보인 시각 — 그 뒤 2.6초 동안만 '첫 공개' 연출(다른 리포트가 늦게 도착해 다시 그려져도 연출이 끊기지 않게)
  const firstAt = useRef(new Map<InsightKind, number>());
  const flight = useRef(new Map<InsightKind, Promise<void>>());
  const { outer, inner } = useAutoHeight();
  useEffect(() => { if (focus) setK(focus); }, [focus]);
  useEffect(() => {
    if (k === view) { setLeaving(false); return; }
    if (reduced()) { setView(k); return; }
    setLeaving(true);
    const t = setTimeout(() => { setView(k); setLeaving(false); }, 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- k 가 바뀔 때만
  }, [k]);
  const load = (x: InsightKind) => {
    const f = flight.current.get(x);
    if (f) return f;
    const p = api.get<InsightRes>(`/api/me/insight/${x}`).then((r) => setRes((m) => ({ ...m, [x]: r }))).catch((e) => { flight.current.delete(x); setErr(msgOf(e)); });
    flight.current.set(x, p);
    return p;
  };
  // 열린 리포트는 모두 미리 받아 둔다 — 탭을 바꿀 때 기다림 없이 바로 넘어가게
  const openKey = INSIGHTS.filter((x) => isOpen(x.id)).map((x) => x.id).join(',');
  useEffect(() => { for (const x of INSIGHTS) if (isOpen(x.id)) void load(x.id); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [openKey]);
  const disc = data.rates?.discount ?? 0;
  const bundle = insightBundleOk(u?.insight);
  const buy = async (ref: BuyRef) => {
    setErr(''); setAct({ ref, st: 'busy' });
    let next: Shop;
    try { next = await api.post<Shop>('/api/shop/use', { kind: 'insight', ref }); } catch (e) { setErr(msgOf(e)); setAct(null); return; }
    // 자물쇠가 열리는 동안 리포트를 받아 둔다 → 열리자마자 리포트가 차오른다
    const kinds = ref === 'all' ? INSIGHTS.map((x) => x.id) : [ref];
    const pre = Promise.all(kinds.map(load));
    setAct({ ref, st: 'done' });
    await pause(560);
    setUnlocking(true);
    await Promise.all([pause(720), Promise.race([pre, pause(2500)])]);
    onChange?.(next);
    setUnlocking(false); setAct(null);
  };
  const open = isOpen(view);
  const r = res[view];
  if (open && r && !firstAt.current.has(view)) firstAt.current.set(view, performance.now());
  const fresh = Boolean(open && r) && performance.now() - (firstAt.current.get(view) ?? 0) < 2600;
  const info = INSIGHTS.find((x) => x.id === view)!;
  const state = !open ? 'lock' : r ? 'ready' : 'load';
  return (
    <section className="card pad ins-panel" id="insight">
      <div className="card-head"><h2>인사이트</h2><span className="sp" />
        <InsightTabs k={k} open={(x) => isOpen(x) || (unlocking && (act?.ref === 'all' || act?.ref === x))} onPick={setK} />
      </div>
      <div ref={outer} className="ins-stage">
        <div ref={inner} className="ins-stage-in">
          <div key={`${view}:${state}`} className={`ins-view ${leaving ? 'iv-out' : 'iv-in'} ${state === 'ready' && fresh ? 'iv-fresh' : ''}`}>
            {state === 'lock' ? (
              <InsightLock k={view} name={info.name} desc={info.desc} rarity={info.rarity} price={priceWith(USE_PRICE.insight[view], disc)}
                all={bundle ? { price: priceWith(USE_PRICE.insightAll, disc), each: priceWith(INSIGHT_EACH_SUM, disc) } : null}
                balance={data.balance} act={act} unlocking={unlocking} err={err} onBuy={buy} onShop={onShop} />
            ) : state === 'load' ? <InsightSkeleton k={view} /> : (
              <div className="ins-body">
                <span className="meta ins-until"><Icon name="clock" />{daysLeft(r!.until)}일 남음 · 내 기록 {r!.report.games.toLocaleString()}판</span>
                {view === 'aug' && <AugView r={r!.report as AugReport} />}
                {view === 'golden' && <GoldenView r={r!.report as GoldenReport} />}
                {view === 'partner' && <PartnerView r={r!.report as PartnerReport} people={r!.people ?? []} me={me} play={fresh} />}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/** 잠긴 리포트: 흐린 미리 보기 위에 열기 칸. 하나도 안 열었으면 '셋을 한 번에'도 (v3.181) */
function InsightLock({ k, name, desc, rarity, price, all, balance, act, unlocking, err, onBuy, onShop }: {
  k: InsightKind; name: string; desc: string; rarity: ShopRarity; price: number; all: { price: number; each: number } | null;
  balance: number; act: { ref: BuyRef; st: ActState } | null; unlocking: boolean; err: string; onBuy: (r: BuyRef) => void; onShop?: () => void;
}) {
  const lack = price > balance, lackAll = all ? all.price > balance : true;
  const busy = Boolean(act);
  return (
    <div className={`ins-lock ${unlocking ? 'unlocking' : ''}`}>
      <InsightGhost k={k} />
      <span className="ins-sweep" aria-hidden="true" />
      <div className="ins-lock-in">
        <span className={`il-ic r-${rarity}`} aria-hidden="true"><InsightGlyph k={k} /><span className="il-lk"><LockGlyph /></span></span>
        <b className="il-t">{name}</b>
        <p className="meta">{desc} · {INSIGHT_DAYS}일 동안 열려요</p>
        {err && <p className="l" role="alert">{err}</p>}
        <div className="il-opts">
          <div className="il-opt">
            <span className="il-o-t"><b>이 리포트만</b><Price n={price} lack={lack} /></span>
            <ActBtn state={act?.ref === k ? act.st : undefined} disabled={(busy && act?.ref !== k) || lack} className={`btn ${lack ? 'lack' : all ? '' : 'primary'}`}
              label={lack ? `${(price - balance).toLocaleString()} 부족` : '열기'} busy="여는 중" done="열렸어요" onClick={() => onBuy(k)} />
          </div>
          {all && (
            <div className="il-opt all">
              <span className="il-o-t"><b>인사이트 3종 한 번에</b><span className="il-save"><s>{all.each.toLocaleString()}</s><Price n={all.price} lack={lackAll} />{all.each > all.price && <em>{(all.each - all.price).toLocaleString()} 아껴요</em>}</span></span>
              <ActBtn state={act?.ref === 'all' ? act.st : undefined} disabled={(busy && act?.ref !== 'all') || lackAll} className={`btn ${lackAll ? 'lack' : 'primary'}`}
                label={lackAll ? `${(all.price - balance).toLocaleString()} 부족` : '모두 열기'} busy="여는 중" done="열렸어요" onClick={() => onBuy('all')} />
            </div>
          )}
        </div>
        {onShop && <button type="button" className="il-shop" onClick={onShop}>상점에서 보기<Icon name="chevR" /></button>}
      </div>
    </div>
  );
}

/** 잠긴 리포트 뒤에 흐리게 깔리는 그 리포트의 모양 (내용 없음) */
function InsightGhost({ k }: { k: InsightKind }) {
  return (
    <div className={`ins-ghost g-${k}`} aria-hidden="true">
      <i className="gh-line hi" /><i className="gh-line" />
      {k === 'partner' ? <div className="gh-cards">{[0, 1, 2].map((i) => <span key={i} className="gh-card"><i /><i /></span>)}</div>
        : k === 'golden' ? <div className="gh-cols"><div className="gh-bars">{[72, 54, 86, 40].map((w, i) => <i key={i} style={{ width: `${w}%` }} />)}</div><div className="gh-days">{[50, 72, 38, 88, 64, 46, 70].map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}</div></div>
          : <div className="gh-cols"><div className="gh-bars">{[80, 46, 64, 58, 30].map((w, i) => <i key={i} style={{ width: `${w}%` }} />)}</div><div className="gh-bars">{[66, 52, 74, 40, 58].map((w, i) => <i key={i} style={{ width: `${w}%` }} />)}</div></div>}
    </div>
  );
}

/** 불러오는 동안: 그 리포트와 같은 틀 */
function InsightSkeleton({ k }: { k: InsightKind }) {
  return (
    <div className="ins-body" aria-hidden="true">
      <Bone w={160} h={12} style={{ justifySelf: 'end' }} />
      {k === 'partner' ? <>
        <Bone w="60%" h={16} />
        <div className="pt-grid">{[0, 1, 2].map((i) => <div key={i} className="pt-card sk-card"><Bone w={112} h={56} r="pill" dark /><Bone w={96} h={14} dark /><Bone w={64} h={28} dark /><Bone w="100%" h={6} r="pill" dark /><Bone w="100%" h={40} dark /></div>)}</div>
      </> : <>
        <Bone w="100%" h={52} r="m" />
        <div className="ins-cols">
          <div className="ins-sec">{[0, 1, 2, 3].map((i) => <Bone key={i} w="100%" h={16} />)}</div>
          <div className="ins-sec">{k === 'golden' ? <Bone w="100%" h={140} r="m" /> : [0, 1, 2, 3].map((i) => <Bone key={i} w="100%" h={16} />)}</div>
        </div>
      </>}
    </div>
  );
}

function Lines({ lines }: { lines: string[] }) {
  if (!lines.length) return <p className="meta">아직 말할 만큼 차이가 나는 게 없어요. 판이 더 쌓이면 보여요.</p>;
  return <ul className="ins-lines">{lines.map((l, i) => <li key={i} className={i === 0 ? 'top' : ''} style={vi(i)}>{l}</li>)}</ul>;
}
function Bar({ label, n, w, base, sub, i = 0 }: { label: ReactNode; n: number; w: number; base: number; sub?: ReactNode; i?: number }) {
  const r = n ? w / n : 0;
  return (
    <div className="ins-bar" style={vi(i)}>
      <span className="ib-l">{label}</span>
      <span className="ib-track"><i style={{ width: `${Math.round(r * 100)}%` }} className={n && r >= base ? 'up' : 'down'} /><em style={{ left: `${Math.round(base * 100)}%` }} /></span>
      <span className="ib-v">{n ? pct(r) : '—'}<small>{sub ?? `${n}판`}</small></span>
    </div>
  );
}

function AugView({ r }: { r: AugReport }) {
  return (
    <>
      <Lines lines={r.lines} />
      <div className="ins-cols">
        <div className="ins-sec">
          <h3>잘 맞는 증강 vs 다른 증강</h3>
          <Bar i={0} label="챔프에 S·A" n={r.fit.good.n} w={r.fit.good.w} base={r.base} sub={`${r.fit.good.n}개`} />
          <Bar i={1} label="그 밖" n={r.fit.other.n} w={r.fit.other.w} base={r.base} sub={`${r.fit.other.n}개`} />
          <h3>등급별</h3>
          {r.rarity.map((x, i) => <Bar key={x.r} i={i + 2} label={{ silver: '실버', gold: '골드', prismatic: '프리즘' }[x.r]} n={x.n} w={x.w} base={r.base} sub={`${x.n}개`} />)}
        </div>
        <div className="ins-sec">
          <h3>가장 잘 이긴 증강</h3>
          {r.best.length ? r.best.map((x, i) => <AugmentLink key={x.id} id={x.id} className="ins-aug"><span className="ia-in" style={vi(i)}><AugImg id={x.id} size={28} /><span>{AUGNAME(x.id)}</span><b>{pct(x.w / x.n)}</b><small>{x.n}번</small></span></AugmentLink>) : <p className="meta">같은 증강을 3번 이상 고르면 보여요.</p>}
          {r.worst.length > 0 && <><h3>조심할 증강</h3>{r.worst.map((x, i) => <AugmentLink key={x.id} id={x.id} className="ins-aug low"><span className="ia-in" style={vi(i + 3)}><AugImg id={x.id} size={28} /><span>{AUGNAME(x.id)}</span><b>{pct(x.w / x.n)}</b><small>{x.n}번</small></span></AugmentLink>)}</>}
        </div>
      </div>
      {r.tags.length > 0 && <div className="ins-sec"><h3>성향별 (내 평균 {pct(r.base)} 대비)</h3><div className="ins-tags">{r.tags.map((t, i) => <span key={t.key} className={t.delta >= 0 ? 'up' : 'down'} style={vi(i)}>{t.label}<b>{t.delta >= 0 ? '+' : ''}{Math.round(t.delta * 100)}%p</b><small>{t.n}개</small></span>)}</div></div>}
      {r.combos.length > 0 && <div className="ins-sec"><h3>최고의 챔프 + 증강</h3><div className="ins-combos">{r.combos.map((c, i) => <span key={`${c.champ}:${c.aug}`} className="ins-combo" style={vi(i)}><ChampImg id={c.champ} size={32} /><span className="plus">+</span><AugImg id={c.aug} size={28} /><span className="cm-t"><b>{CHAMPIONS[c.champ]?.name} · {AUGNAME(c.aug)}</b><small>{c.n}판 {c.w}승</small></span></span>)}</div></div>}
    </>
  );
}
const AUGNAME = (id: number) => AUGMENT[id]?.name ?? '증강';

function GoldenView({ r }: { r: GoldenReport }) {
  return (
    <>
      <Lines lines={r.lines} />
      <div className="ins-cols">
        <div className="ins-sec"><h3>시간대</h3>{r.bands.filter((b) => b.n).map((b, i) => <Bar key={b.key} i={i} label={b.label} n={b.n} w={b.w} base={r.base} />)}</div>
        <div className="ins-sec"><h3>요일</h3><div className="ins-days">{r.days.map((d, i) => { const v = d.n ? d.w / d.n : 0; return <span key={d.d} className={`ins-day ${d.n >= 5 ? (v >= r.base ? 'up' : 'down') : 'few'}`} style={vi(i)}><i style={{ height: `${Math.max(6, Math.round(v * 100))}%` }} /><b>{d.label}</b><small>{d.n ? pct(v) : '—'}</small></span>; })}</div></div>
      </div>
      <div className="ins-sec"><h3>이어서 할 때 몇 판째</h3><div className="ins-seq">{r.seq.map((st, i) => { const v = st.n ? st.w / st.n : 0; return <span key={st.k} className={`ins-step ${r.dropAt && st.k >= r.dropAt ? 'down' : ''}`} style={vi(i)}><b>{st.k === 5 ? '5판째~' : `${st.k}판째`}</b><em>{st.n ? pct(v) : '—'}</em><small>{st.n}판</small></span>; })}</div></div>
    </>
  );
}

const RANK_KO = ['', '1위', '2위', '3위'];
const md = (t: number) => new Date(t).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });

/**
 * 베스트 파트너 TOP 3 (v3.181): 늘 세 칸. 두 얼굴이 이어진 무대 — 함께한 사이(듀오 등급·함께한 날·처음 함께한 날)를 먼저,
 * 그다음 함께할 때 승률(내 평균과 한 막대에서 비교) · KDA · 최고의 조합. 세 칸이 안 차면 '다음 파트너' 칸에 가장 가까운 멤버와 남은 판수.
 */
function PartnerView({ r, people, me, play }: { r: PartnerReport; people: Person[]; me?: Viewer; play: boolean }) {
  const skins = useSkins();
  const who = (id: string) => people.find((x) => x.id === id);
  const need = r.need ?? 5;
  type Slot = { kind: 'pick'; p: PartnerPick } | { kind: 'near'; n: PartnerNear | null };
  const slots: Slot[] = [...r.list.map((p): Slot => ({ kind: 'pick', p })), ...(r.near ?? []).map((n): Slot => ({ kind: 'near', n }))];
  while (slots.length < 3) slots.push({ kind: 'near', n: null });
  const art = (x?: Person) => (x?.skin && skins?.[x.skin]?.splash) || (x?.main ? cdragon(CHAMPIONS[x.main]?.splash) : '');
  const meFace = <MemberFace nick={me?.nick ?? '나'} skin={me?.skin} champion={me?.champion} skins={skins} size={56} />;
  return (
    <>
      {r.lines[0] && <p className="pt-head" style={vi(0)}><Icon name="users" /><span>{r.lines[0]}</span></p>}
      <div className="pt-grid">
        {slots.slice(0, 3).map((sl, i) => {
          if (sl.kind === 'near') {
            const n = sl.n, x = n ? who(n.id) : undefined;
            return (
              <article key={`n${i}`} className="pt-card next" style={vi(i)}>
                <span className="pt-rk">{RANK_KO[i + 1]}</span>
                <div className="pt-pair"><span className="pt-f me">{meFace}</span><span className="pt-link dash" aria-hidden="true" /><span className="pt-f them">{x ? <MemberFace nick={x.nick} skin={x.skin} champion={x.main} skins={skins} size={56} /> : <span className="pt-q">?</span>}</span></div>
                <b className="pt-nm">{x ? `${shortName(x.nick)}님` : '다음 파트너'}</b>
                {n ? <>
                  <span className="pt-prog"><i style={{ width: `${Math.round((n.n / need) * 100)}%` }} /></span>
                  <span className="pt-next-t">같은 팀 <b>{n.n}</b> / {need}판 · {n.w}승</span>
                  <span className="pt-next-d">{need - n.n}판 더 함께하면 TOP 3에 올라요</span>
                </> : <span className="pt-next-d">같은 팀으로 {need}판을 함께한 멤버가<br />이 자리에 올라요</span>}
              </article>
            );
          }
          const p = sl.p, x = who(p.id), rate = p.w / p.n, delta = rate - r.base, src = art(x);
          return (
            <article key={p.id} className={`pt-card n${i + 1}`} style={vi(i)}>
              {src && <img className="pt-art fi" {...imgIn} src={src} alt="" loading="lazy" />}
              <span className="pt-shade" aria-hidden="true" />
              <span className="pt-rk">{RANK_KO[i + 1]}</span>
              {p.bond && <span className={`pt-bond g${p.bond.grade}`} title="함께한 판·이긴 판·함께한 주로 오르는 듀오 등급">{p.bond.name}</span>}
              <div className="pt-pair"><span className="pt-f me">{meFace}</span><span className="pt-link" aria-hidden="true"><Icon name="link" /></span><span className="pt-f them"><MemberFace nick={x?.nick ?? '멤버'} skin={x?.skin} champion={x?.main} skins={skins} size={56} /></span></div>
              <b className="pt-nm">{shortName(x?.nick ?? '멤버')}</b>
              <span className="pt-since">함께 {p.n}판{p.days ? ` · ${p.days}일` : ''}{p.first ? ` · ${md(p.first)}부터` : ''}</span>
              <div className="pt-rate"><b><Count to={Math.round(rate * 100)} play={play} delay={200 + i * 90} />%</b><small>함께할 때 승률</small></div>
              <div className="pt-cmp">
                <span className="pt-track"><i style={{ width: `${Math.round(rate * 100)}%` }} /><em style={{ left: `${Math.round(r.base * 100)}%` }} /></span>
                <span className="pt-cmp-t"><span>내 평균 {pct(r.base)}</span><b className={delta >= 0 ? 'up' : 'down'}>{delta >= 0 ? '+' : ''}{Math.round(delta * 100)}%p</b></span>
              </div>
              <div className="pt-foot">
                <span className="pt-cell"><small>함께 KDA</small><b>{p.kda.toFixed(2)}{p.kda > p.kdaBase + 0.05 && <Icon name="arrowUp" />}</b><em>평소 {p.kdaBase.toFixed(2)}</em></span>
                {p.combo
                  ? <span className="pt-cell"><small>최고의 조합</small><span className="pt-combo"><ChampImg id={p.combo.mine} size={24} /><ChampImg id={p.combo.theirs} size={24} /></span><em>{p.combo.n}판 {p.combo.w}승</em></span>
                  : <span className="pt-cell"><small>함께 최고</small><b>{p.run ?? 0}연승</b><em>{p.last ? `최근 ${md(p.last)}` : ''}</em></span>}
              </div>
            </article>
          );
        })}
      </div>
      <p className="meta pt-note">같은 팀으로 {need}판 이상 함께한 멤버 중에서 골라요 · 판이 적으면 내 평균 쪽으로 당겨서 순위를 매겨요</p>
    </>
  );
}
const shortName = (nick: string) => nick.split('#')[0];

// ───────── 명장면 ─────────

/** 명장면 카드 (회원 페이지). 어두운 무대 + 챔프 그림 + 처치 순서 + 이야기 */
export function HighlightCard({ h, action }: { h: Highlight; action?: ReactNode }) {
  const s = storyOf(h);
  const art = cdragon(CHAMPIONS[h.champ]?.splash);
  const run = h.seq ? [...h.seq].sort((a, b) => a.t - b.t) : null;
  return (
    <section className={`hl-card m${h.multi} ${h.win ? 'win' : 'loss'}`}>
      {art && <img className="hl-art fi" {...imgIn} src={art} alt="" />}
      <span className="hl-shade" aria-hidden="true" />
      {action && <span className="hl-act">{action}</span>}
      <div className="hl-in">
        <div className="hl-top"><span className="hl-k">{MULTI_KO[h.multi]}</span><span className="hl-date">{new Date(h.playedAt).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}</span></div>
        <h2 className="hl-title">{s.title}</h2>
        {run && <div className="hl-seq" aria-label="처치 순서">{run.slice(0, 5).map((k, i) => <span key={i} className="hl-v"><ChampImg id={k.v} size={36} /><small>{i + 1}</small></span>)}</div>}
        <div className="hl-story">{s.lines.map((l, i) => <p key={i}>{l}</p>)}</div>
      </div>
    </section>
  );
}

/** 내 페이지의 명장면 칸: 걸어 둔 판 · 고르기 (명장면 액자가 있을 때) */
export function MyHighlight({ api, pinned, frame, onShop }: { api: Api; pinned: Highlight | null | undefined; frame: boolean; onShop?: () => void }) {
  const [list, setList] = useState<Highlight[] | null>(null);
  const [pick, setPick] = useState(false);
  const [cur, setCur] = useState<Highlight | null>(pinned ?? null);
  const [err, setErr] = useState('');
  useEffect(() => setCur(pinned ?? null), [pinned]);
  const load = () => { setPick(true); if (!list) api.get<{ list: Highlight[] }>('/api/me/highlights').then((r) => setList(r.list)).catch((e) => setErr(msgOf(e))); };
  const choose = async (h: Highlight | null) => { setErr(''); try { await api.post('/api/me/pin', { gameId: h?.gameId ?? null }); setCur(h); setPick(false); } catch (e) { setErr(msgOf(e)); } };
  if (!frame) {
    return (
      <section className="card pad hl-empty">
        <span className="hl-ic" aria-hidden="true"><Icon name="frame" /></span>
        <div><b>명장면 액자</b><p className="meta">쿼드라·펜타킬 판을 이야기와 함께 내 페이지에 걸어 둘 수 있어요.</p></div>
        {onShop && <button type="button" className="btn" onClick={onShop}>상점에서 보기</button>}
      </section>
    );
  }
  return (
    <>
      {cur ? <HighlightCard h={cur} action={<GlassBtn icon="edit" label="명장면 바꾸기" onClick={load} />} />
        : <section className="card pad hl-empty"><span className="hl-ic" aria-hidden="true"><Icon name="frame" /></span><div><b>명장면을 걸어 보세요</b><p className="meta">쿼드라·펜타킬 판 중 하나를 고르면 이 자리에 걸려요.</p></div><button type="button" className="btn primary" onClick={load}>명장면 고르기</button></section>}
      {pick && createPortal(
        <div className="md-wrap" role="dialog" aria-modal="true" aria-label="명장면 고르기">
          <button type="button" className="md-scrim" aria-label="닫기" onClick={() => setPick(false)} />
          <div className="gift-dlg hl-pick">
            <header className="gd-head"><Icon name="frame" /><b>명장면 고르기</b><span className="sp" /><button type="button" className="gd-x" aria-label="닫기" onClick={() => setPick(false)}><Icon name="x" /></button></header>
            {err && <p className="l" role="alert" style={{ margin: 0 }}>{err}</p>}
            {!list ? <div className="hl-list">{Array.from({ length: 3 }, (_, i) => <span key={i} className="hl-row sk" aria-hidden="true" />)}</div>
              : list.length ? <div className="hl-list">{list.map((h) => (
                <button key={h.gameId} type="button" className={`hl-row ${cur?.gameId === h.gameId ? 'on' : ''}`} onClick={() => choose(h)}>
                  <ChampImg id={h.champ} size={40} />
                  <span className="hr-t"><b>{CHAMPIONS[h.champ]?.name} · {MULTI_KO[h.multi]}</b><small>{new Date(h.playedAt).toLocaleDateString('ko-KR')} · {h.kills}/{h.deaths}/{h.assists} · {h.win ? '승리' : '패배'}{h.seq ? ' · 처치 순서 있음' : ''}</small></span>
                </button>
              ))}</div> : <Empty>아직 쿼드라·펜타킬 판이 없어요. 기록되면 여기에 나타나요.</Empty>}
            {cur && <footer className="gd-foot"><span className="sp" /><button type="button" className="btn" onClick={() => choose(null)}>내리기</button></footer>}
          </div>
        </div>, document.body,
      )}
    </>
  );
}

// ───────── 도감 돋보기 ─────────

/** 아직 안 해 본 도감 칸: 돋보기로 열기 (열면 children 이 보인다) */
export function LensGate({ api, data, refKey, onChange, children }: { api: Api; data: Shop | null; refKey: string; onChange: (s: Shop) => void; children: ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!data?.uses) return null;
  if (data.uses.lens.includes(refKey)) return <div className="lens-open">{children}</div>;
  const price = priceWith(USE_PRICE.lens, data.rates?.discount ?? 0), lack = price > data.balance;
  const open = async () => { setBusy(true); setErr(''); try { onChange(await api.post<Shop>('/api/shop/use', { kind: 'lens', ref: refKey })); } catch (e) { setErr(msgOf(e)); } finally { setBusy(false); } };
  return (
    <div className="lens-gate">
      <span className="lens-ic" aria-hidden="true"><Icon name="search" /></span>
      <div className="lens-txt"><b>도감 돋보기</b><span className="meta">마스터 조건과 팁을 미리 볼 수 있어요.</span>{err && <span className="l">{err}</span>}</div>
      <button type="button" className={`btn sm ${lack ? 'lack' : 'primary'}`} disabled={busy || lack} onClick={open}>{lack ? `${(price - data.balance).toLocaleString()} 부족` : <>열어 보기 <b>{price}</b><PieceIcon size={14} /></>}</button>
    </div>
  );
}

