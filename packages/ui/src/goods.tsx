/**
 * 꾸밈 밖 상품 (CLAUDE.md v3.99). 웹·앱 공용.
 *  - 상점 '이용권' 칸: 인사이트권 · 명장면 액자 · 도감 돋보기 · 미션 다시 뽑기
 *  - 랜덤박스: 상점 맨 위 진열 + 여는 창 (흔들림 → 등급 빛 예고 → 터짐 → 상품 공개)
 *  - 선물 창 (앱을 쓰는 멤버끼리) · 받은 선물 알림
 *  - 인사이트 리포트 (내 페이지) · 명장면 카드 (회원 페이지)
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  AUGMENT, CHAMPIONS, GIFT_NOTE_MAX, INSIGHTS, INSIGHT_DAYS, MULTI_KO, RARITY_SHOP_KO, REROLL_PER_WEEK, SHOP_ITEM, SLOT_KO, USE_PRICE, BOX_ODDS, boxPool, cdragon, itemDiscount, josa, priceWith, storyOf,
  type Api, type AugReport, type GoldenReport, type Highlight, type InsightKind, type PartnerReport, type Shop, type ShopItem, type ShopRarity,
} from '@prism/core';
import { AugImg, ChampImg, Empty, GlassBtn, MemberFace, useSkins } from './basics';
import { AugmentLink } from './augment';
import { Icon } from './icons';
import { PieceIcon, ProfileHero } from './shop';
import { imgIn } from './skeleton';

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

type InsightRes = { kind: InsightKind; until: number; report: AugReport | GoldenReport | PartnerReport; people?: { id: string; nick: string; skin: number | null; main: number | null }[] };

/** 내 페이지 '인사이트' 칸: 세 리포트 탭. 열리지 않은 리포트는 잠금 + 상점으로 */
export function InsightPanel({ api, data, focus, onShop, onChange }: { api: Api; data: Shop; focus?: InsightKind | null; onShop?: () => void; onChange?: (s: Shop) => void }) {
  const u = data.uses;
  const first = (focus && u?.insight[focus] ? focus : INSIGHTS.find((x) => u?.insight[x.id])?.id) ?? focus ?? 'aug';
  const [k, setK] = useState<InsightKind>(first);
  const [res, setRes] = useState<Record<string, InsightRes>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const open = Boolean(u?.insight[k]);
  useEffect(() => { if (focus) setK(focus); }, [focus]);
  useEffect(() => {
    if (!open || res[k]) return;
    api.get<InsightRes>(`/api/me/insight/${k}`).then((r) => setRes((x) => ({ ...x, [k]: r }))).catch((e) => setErr(msgOf(e)));
  }, [api, k, open, res]);
  const price = priceWith(USE_PRICE.insight[k], data.rates?.discount ?? 0), lack = price > data.balance;
  const buy = async () => { setBusy(true); setErr(''); try { onChange?.(await api.post<Shop>('/api/shop/use', { kind: 'insight', ref: k })); } catch (e) { setErr(msgOf(e)); } finally { setBusy(false); } };
  const info = INSIGHTS.find((x) => x.id === k)!;
  return (
    <section className="card pad ins-panel" id="insight">
      <div className="card-head"><h2>인사이트</h2><span className="sp" />
        <nav className="ins-tabs" aria-label="리포트">{INSIGHTS.map((x) => <button key={x.id} type="button" className={k === x.id ? 'on' : ''} onClick={() => setK(x.id)}>{u?.insight[x.id] ? null : <Icon name="lock" />}{x.name}</button>)}</nav>
      </div>
      {!open ? (
        <div className="ins-lock">
          <div className="ins-blur" aria-hidden="true"><span /><span /><span /><span /></div>
          <div className="ins-lock-in">
            <b>{info.name}</b>
            <p className="meta">{info.desc}. 인사이트권으로 {INSIGHT_DAYS}일 동안 열려요.</p>
            {err && <p className="l" role="alert">{err}</p>}
            <div className="ins-buy"><Price n={price} lack={lack} /><button type="button" className={`btn ${lack ? 'lack' : 'primary'}`} disabled={busy || lack} onClick={buy}>{lack ? `${(price - data.balance).toLocaleString()} 부족` : '인사이트권으로 열기'}</button>{onShop && <button type="button" className="btn" onClick={onShop}>상점</button>}</div>
          </div>
        </div>
      ) : !res[k] ? <InsightSkeleton /> : (
        <div className="ins-body">
          <span className="meta ins-until">{daysLeft(res[k].until)}일 남음 · 내 기록 {res[k].report.games}판</span>
          {k === 'aug' && <AugView r={res[k].report as AugReport} />}
          {k === 'golden' && <GoldenView r={res[k].report as GoldenReport} />}
          {k === 'partner' && <PartnerView r={res[k].report as PartnerReport} people={res[k].people ?? []} />}
        </div>
      )}
    </section>
  );
}

function InsightSkeleton() {
  return <div className="ins-body" aria-hidden="true"><span className="sk" style={{ width: 140, height: 12 }} /><span className="sk" style={{ width: '100%', height: 56 }} /><div className="ins-cols"><span className="sk" style={{ height: 120 }} /><span className="sk" style={{ height: 120 }} /></div></div>;
}

function Lines({ lines }: { lines: string[] }) {
  if (!lines.length) return <p className="meta">아직 말할 만큼 차이가 나는 게 없어요. 판이 더 쌓이면 보여요.</p>;
  return <ul className="ins-lines">{lines.map((l, i) => <li key={i} className={i === 0 ? 'top' : ''}>{l}</li>)}</ul>;
}
function Bar({ label, n, w, base, sub }: { label: ReactNode; n: number; w: number; base: number; sub?: ReactNode }) {
  const r = n ? w / n : 0;
  return (
    <div className="ins-bar">
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
          <Bar label="챔프에 S·A" n={r.fit.good.n} w={r.fit.good.w} base={r.base} sub={`${r.fit.good.n}개`} />
          <Bar label="그 밖" n={r.fit.other.n} w={r.fit.other.w} base={r.base} sub={`${r.fit.other.n}개`} />
          <h3>등급별</h3>
          {r.rarity.map((x) => <Bar key={x.r} label={{ silver: '실버', gold: '골드', prismatic: '프리즘' }[x.r]} n={x.n} w={x.w} base={r.base} sub={`${x.n}개`} />)}
        </div>
        <div className="ins-sec">
          <h3>가장 잘 이긴 증강</h3>
          {r.best.length ? r.best.map((x) => <AugmentLink key={x.id} id={x.id} className="ins-aug"><AugImg id={x.id} size={28} /><span>{AUGNAME(x.id)}</span><b>{pct(x.w / x.n)}</b><small>{x.n}번</small></AugmentLink>) : <p className="meta">같은 증강을 3번 이상 고르면 보여요.</p>}
          {r.worst.length > 0 && <><h3>조심할 증강</h3>{r.worst.map((x) => <AugmentLink key={x.id} id={x.id} className="ins-aug low"><AugImg id={x.id} size={28} /><span>{AUGNAME(x.id)}</span><b>{pct(x.w / x.n)}</b><small>{x.n}번</small></AugmentLink>)}</>}
        </div>
      </div>
      {r.tags.length > 0 && <div className="ins-sec"><h3>성향별 (내 평균 {pct(r.base)} 대비)</h3><div className="ins-tags">{r.tags.map((t) => <span key={t.key} className={t.delta >= 0 ? 'up' : 'down'}>{t.label}<b>{t.delta >= 0 ? '+' : ''}{Math.round(t.delta * 100)}%p</b><small>{t.n}개</small></span>)}</div></div>}
      {r.combos.length > 0 && <div className="ins-sec"><h3>최고의 챔프 + 증강</h3><div className="ins-combos">{r.combos.map((c) => <span key={`${c.champ}:${c.aug}`} className="ins-combo"><ChampImg id={c.champ} size={32} /><span className="plus">+</span><AugImg id={c.aug} size={28} /><span className="cm-t"><b>{CHAMPIONS[c.champ]?.name} · {AUGNAME(c.aug)}</b><small>{c.n}판 {c.w}승</small></span></span>)}</div></div>}
    </>
  );
}
const AUGNAME = (id: number) => AUGMENT[id]?.name ?? '증강';

function GoldenView({ r }: { r: GoldenReport }) {
  return (
    <>
      <Lines lines={r.lines} />
      <div className="ins-cols">
        <div className="ins-sec"><h3>시간대</h3>{r.bands.filter((b) => b.n).map((b) => <Bar key={b.key} label={b.label} n={b.n} w={b.w} base={r.base} />)}</div>
        <div className="ins-sec"><h3>요일</h3><div className="ins-days">{r.days.map((d) => { const v = d.n ? d.w / d.n : 0; return <span key={d.d} className={`ins-day ${d.n >= 5 ? (v >= r.base ? 'up' : 'down') : 'few'}`}><i style={{ height: `${Math.max(6, Math.round(v * 100))}%` }} /><b>{d.label}</b><small>{d.n ? pct(v) : '—'}</small></span>; })}</div></div>
      </div>
      <div className="ins-sec"><h3>이어서 할 때 몇 판째</h3><div className="ins-seq">{r.seq.map((s) => { const v = s.n ? s.w / s.n : 0; return <span key={s.k} className={`ins-step ${r.dropAt && s.k >= r.dropAt ? 'down' : ''}`}><b>{s.k === 5 ? '5판째~' : `${s.k}판째`}</b><em>{s.n ? pct(v) : '—'}</em><small>{s.n}판</small></span>; })}</div></div>
    </>
  );
}

function PartnerView({ r, people }: { r: PartnerReport; people: { id: string; nick: string; skin: number | null; main: number | null }[] }) {
  const skins = useSkins();
  return (
    <>
      <Lines lines={r.lines} />
      <div className="ins-partners">
        {r.list.map((p, i) => {
          const who = people.find((x) => x.id === p.id);
          return (
            <article key={p.id} className={`ins-pt n${i + 1}`}>
              <span className="pt-rank">{i + 1}</span>
              <MemberFace nick={who?.nick ?? '멤버'} skin={who?.skin} champion={who?.main} skins={skins} size={48} />
              <b className="pt-nm">{(who?.nick ?? '멤버').split('#')[0]}</b>
              <span className="pt-rate">{pct(p.w / p.n)}<small>{p.n}판 {p.w}승</small></span>
              <span className={`pt-diff ${p.diff >= 0 ? 'up' : 'down'}`}>내 평균 {p.diff >= 0 ? '+' : ''}{Math.round((p.w / p.n - r.base) * 100)}%p</span>
              <span className="pt-kda">함께 KDA {p.kda.toFixed(2)} <small>평소 {p.kdaBase.toFixed(2)}</small></span>
              {p.combo && <span className="pt-combo"><ChampImg id={p.combo.mine} size={24} /><span className="plus">+</span><ChampImg id={p.combo.theirs} size={24} /><small>{p.combo.n}판 {p.combo.w}승</small></span>}
            </article>
          );
        })}
      </div>
    </>
  );
}

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
      <span className="lg-ic" aria-hidden="true"><Icon name="search" /></span>
      <div className="lg-txt"><b>도감 돋보기</b><span className="meta">마스터 조건과 팁을 미리 볼 수 있어요.</span>{err && <span className="l">{err}</span>}</div>
      <button type="button" className={`btn sm ${lack ? 'lack' : 'primary'}`} disabled={busy || lack} onClick={open}>{lack ? `${(price - data.balance).toLocaleString()} 부족` : <>열어 보기 <b>{price}</b><PieceIcon size={14} /></>}</button>
    </div>
  );
}

