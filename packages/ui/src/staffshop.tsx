/**
 * 운영 › 상점관리 (CLAUDE.md v3.186, 관리자만 — 메뉴도 관리자에게만 보인다).
 *  - 머리: 판매 중 상품 수 · 최근 30일 쓴 피스 · 품절(희귀템) 수
 *  - 잘 팔리는 / 안 팔리는 상품: 최근 30일 구매 수와 조회 수(구매 확인 창을 연 수)를 함께 본다
 *  - 상품: 종류로 거르기 · 조회/구매/보유/받은 피스 · '희귀템으로'(판매 종료 = 더는 살 수 없음, 이미 산 회원은 그대로) / '다시 판매'
 *  - 최근 구매: 누가 · 무엇을 · 언제 · 얼마에 (구매 · 랜덤박스 · 선물 · 이용권)
 */
import { useState } from 'react';
import { RARITY_SHOP_KO, SLOT_KO, type Api, type ShopRarity, type ShopSlot } from '@prism/core';
import { Empty, MemberFace } from './basics';
import { PieceIcon } from './shop';
import { Icon } from './icons';
import { useLoad } from './crew';
import { useKept } from './kept';
import { Bone, SkeletonFrame, Swap, fadeCls, useReveal } from './skeleton';

type Item = { id: string; name: string; slot: ShopSlot; rarity: ShopRarity; price: number; retired: boolean; baseRetired: boolean; sellable: boolean;
  owners: number; bought30: number; paid: number; revenue: number; last: number | null; views: number; views30: number };
type Row = { type: 'buy' | 'box' | 'gift' | 'use'; item: string; label: string; ref?: string; price: number; at: number; memberId: string; nick: string; skin: number | null; main: number | null; fromNick: string | null };
type Data = { items: Item[]; recent: Row[]; spent30: number; onSale: number };

const RC: Record<ShopRarity, string> = { common: '#a3abbd', rare: '#4a8cff', epic: '#a46bff', legendary: '#f2a93b', mythic: '#ff4d6d' };
const TYPE_KO: Record<Row['type'], string> = { buy: '구매', box: '랜덤박스', gift: '선물', use: '이용권' };
const when = (t: number) => {
  const m = Math.round((Date.now() - t) / 60_000);
  if (m < 60) return `${Math.max(1, m)}분 전`;
  if (m < 60 * 24) return `${Math.round(m / 60)}시간 전`;
  const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
/** 잘 팔리는 정도: 최근 30일 구매를 조회보다 무겁게 (구매 1 = 조회 4) */
const heat = (x: Item) => x.bought30 * 4 + x.views30;
const conv = (x: Item) => (x.views30 ? `${Math.round((x.bought30 / x.views30) * 100)}%` : '–');

export function StaffShopView({ api, onOpen }: { api: Api; onOpen?: (id: string) => void }) {
  const { data, error, reload } = useLoad<Data>(api, '/api/admin/shop');
  const rv = useReveal(Boolean(data));
  const [slot, setSlot] = useKept<ShopSlot | ''>('staff.shop.slot', '');
  const [kind, setKind] = useKept<Row['type'] | ''>('staff.shop.type', '');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [more, setMore] = useState(false);
  if (error) return <Empty>{error}</Empty>;
  if (!data) return <ShopAdminSkeleton />;
  const sale = data.items.filter((x) => x.sellable && !x.retired);
  const hot = [...sale].sort((a, b) => heat(b) - heat(a) || b.owners - a.owners).slice(0, 5);
  const cold = [...sale].sort((a, b) => heat(a) - heat(b) || a.owners - b.owners).slice(0, 5);
  const items = data.items.filter((x) => x.sellable && (!slot || x.slot === slot)).sort((a, b) => heat(b) - heat(a) || b.owners - a.owners);
  const recent = data.recent.filter((r) => !kind || r.type === kind);
  const shown = more ? recent : recent.slice(0, 30);
  const toggle = async (x: Item) => {
    setBusy(x.id); setErr('');
    try { await api.post('/api/admin/shop/retire', { id: x.id, retired: !x.retired }); await reload(); } catch (e) { setErr(e instanceof Error ? e.message : '바꾸지 못했어요'); } finally { setBusy(null); }
  };
  const slots = (Object.keys(SLOT_KO) as ShopSlot[]).filter((k) => k !== 'title' && data.items.some((x) => x.slot === k));
  return (
    <Swap on={rv} skeleton={<ShopAdminSkeleton />}>
      <div className={`sv ssa ${fadeCls(rv)}`}>
        <section className="ssa-stats">
          <div className="card ssa-stat"><small>판매 중</small><b>{sale.length}<span>개</span></b></div>
          <div className="card ssa-stat"><small>30일 쓴 피스</small><b>{data.spent30.toLocaleString()}<PieceIcon /></b></div>
          <div className="card ssa-stat"><small>희귀템</small><b>{data.items.filter((x) => x.sellable && x.retired).length}<span>개</span></b></div>
        </section>

        <div className="ssa-duo">
          <Rank title="잘 팔리는 상품" hint="최근 30일 · 구매와 조회" icon="trophy" list={hot} />
          <Rank title="안 팔리는 상품" hint="판매 중인 것 중 · 구매와 조회가 적은 순" icon="moon" list={cold} cold busy={busy} onToggle={toggle} />
        </div>

        <section className="card sv-card ssa-items">
          <div className="sv-head"><h2>상품 <span className="ssa-n">{items.length}</span></h2>
            <div className="ssa-chips">{slots.map((k) => <button key={k} type="button" className={`chip ${slot === k ? 'on' : ''}`} onClick={() => setSlot(slot === k ? '' : k)}>{SLOT_KO[k]}</button>)}</div>
          </div>
          {err && <p className="sv-err">{err}</p>}
          <div className="ssa-table">
            <div className="ssa-tr ssa-th"><span>상품</span><span>가격</span><span>조회 30일</span><span>구매 30일</span><span>보유</span><span>받은 피스</span><span>마지막 구매</span><span /></div>
            {items.map((x) => (
              <div key={x.id} className={`ssa-tr ${x.retired ? 'off' : ''}`}>
                <span className="ssa-nm"><i style={{ background: RC[x.rarity] }} /><b>{x.name}</b><small>{SLOT_KO[x.slot]} · {RARITY_SHOP_KO[x.rarity]}</small></span>
                <span className="num">{x.price.toLocaleString()}</span>
                <span className="num">{x.views30}<small> / {x.views}</small></span>
                <span className="num">{x.bought30}<small> · {conv(x)}</small></span>
                <span className="num">{x.owners}</span>
                <span className="num">{x.revenue.toLocaleString()}</span>
                <span className="meta">{x.last ? when(x.last) : '–'}</span>
                <span className="ssa-act">
                  <button type="button" className={`ssa-btn ${x.retired ? 'sell' : 'stop'}`} disabled={busy === x.id} onClick={() => toggle(x)}>
                    {busy === x.id ? <i className="act-spin" /> : <Icon name={x.retired ? 'bag' : 'lock'} />}{x.retired ? '다시 판매' : '희귀템으로'}
                  </button>
                </span>
              </div>
            ))}
          </div>
          <p className="meta ssa-note">희귀템으로 바꾸면 상점·랜덤박스·선물에서 빠져 더는 살 수 없어요. 이미 산 회원은 그대로 쓰고, 카드에 '품절'이 붙어요.</p>
        </section>

        <section className="card sv-card ssa-log">
          <div className="sv-head"><h2>최근 구매 <span className="ssa-n">{recent.length}</span></h2>
            <div className="ssa-chips">{(Object.keys(TYPE_KO) as Row['type'][]).map((k) => <button key={k} type="button" className={`chip ${kind === k ? 'on' : ''}`} onClick={() => setKind(kind === k ? '' : k)}>{TYPE_KO[k]}</button>)}</div>
          </div>
          {shown.length ? <div className="ssa-rows">{shown.map((r, i) => (
            <div key={`${r.at}-${r.memberId}-${r.item}-${i}`} className="ssa-row">
              <button type="button" className="ssa-who" onClick={() => onOpen?.(r.memberId)}><MemberFace nick={r.nick} skin={r.skin} champion={r.main} size={32} /><b>{r.nick.split('#')[0]}</b></button>
              <span className={`ssa-type t-${r.type}`}>{TYPE_KO[r.type]}</span>
              <span className="ssa-what"><b>{r.label}</b>{r.type === 'gift' && r.fromNick && <small>{r.fromNick.split('#')[0]}님이 보냄</small>}</span>
              <span className="num ssa-price">{r.price ? <>{r.price.toLocaleString()}<PieceIcon /></> : <small>무료</small>}</span>
              <span className="meta ssa-at">{when(r.at)}</span>
            </div>
          ))}</div> : <Empty>아직 구매 기록이 없어요.</Empty>}
          {recent.length > 30 && !more && <button type="button" className="btn ghost ssa-more" onClick={() => setMore(true)}>더 보기 · {recent.length - 30}개</button>}
        </section>
      </div>
    </Swap>
  );
}

function Rank({ title, hint, icon, list, cold, busy, onToggle }: { title: string; hint: string; icon: 'trophy' | 'moon'; list: Item[]; cold?: boolean; busy?: string | null; onToggle?: (x: Item) => void }) {
  return (
    <section className="card sv-card ssa-rank">
      <div className="sv-head"><h2><span className={`ssa-ic ${cold ? 'cold' : 'hot'}`}><Icon name={icon} /></span>{title}</h2><span className="meta">{hint}</span></div>
      {list.length ? <ol className="ssa-rlist">{list.map((x, i) => (
        <li key={x.id}>
          <span className="ssa-rk">{i + 1}</span>
          <span className="ssa-nm"><i style={{ background: RC[x.rarity] }} /><b>{x.name}</b><small>{SLOT_KO[x.slot]} · {x.price.toLocaleString()}</small></span>
          <span className="ssa-fig"><b>{x.bought30}</b><small>구매</small></span>
          <span className="ssa-fig"><b>{x.views30}</b><small>조회</small></span>
          {cold && onToggle && <button type="button" className="ssa-btn stop" title="희귀템으로" aria-label={`${x.name} 희귀템으로`} disabled={busy === x.id} onClick={() => onToggle(x)}>{busy === x.id ? <i className="act-spin" /> : <Icon name="lock" />}<span>희귀템으로</span></button>}
        </li>
      ))}</ol> : <Empty>판매 중인 상품이 없어요.</Empty>}
    </section>
  );
}

function ShopAdminSkeleton() {
  return (
    <SkeletonFrame className="sv ssa">
      <section className="ssa-stats">{['판매 중', '30일 쓴 피스', '희귀템'].map((l) => <div key={l} className="card ssa-stat"><small>{l}</small><Bone w={72} h={28} /></div>)}</section>
      <div className="ssa-duo">{['잘 팔리는 상품', '안 팔리는 상품'].map((t) => (
        <section key={t} className="card sv-card ssa-rank"><div className="sv-head"><h2>{t}</h2></div>
          <ol className="ssa-rlist">{[0, 1, 2, 3, 4].map((i) => <li key={i}><span className="ssa-rk">{i + 1}</span><span className="ssa-nm"><Bone w="60%" h={14} /></span><Bone w={32} h={28} /><Bone w={32} h={28} /></li>)}</ol>
        </section>))}</div>
      <section className="card sv-card ssa-items"><div className="sv-head"><h2>상품</h2></div>
        <div className="ssa-table">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="ssa-tr"><span className="ssa-nm"><Bone w="70%" h={14} /></span><Bone w={40} h={14} /><Bone w={40} h={14} /><Bone w={40} h={14} /><Bone w={24} h={14} /><Bone w={48} h={14} /><Bone w={56} h={14} /><Bone w={96} h={32} r="m" /></div>)}</div>
      </section>
    </SkeletonFrame>
  );
}
