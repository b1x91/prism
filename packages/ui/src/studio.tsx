/**
 * 프로필 꾸미기 창 (CLAUDE.md v3.35). 내 페이지의 '프로필 꾸미기'에서 연다.
 *  - 위: 지금 고른 모습 그대로의 미리 보기 (저장 전)
 *  - 탭: 대표 스킨 · 배경 · 머리 테두리 · 머리 효과 · 이름 효과 · 칭호 · 소개
 *  - 이름은 바꿀 수 없다 — 롤 계정 이름(이름#태그)을 따라간다.
 * 꾸밈은 가진 것만 고를 수 있고, 안 가진 것은 잠금 + 가격으로 보여 준다 (상점에서 산다).
 */
import { useEffect, useMemo, useState } from 'react';
import {
  CHAMPIONS, CHAMPION_LIST, PIECE, RARITY_SHOP_KO, SHOP, SKIN_TIERS, SLOT_KO, baseSkin, matchName, priceWith, skinNeed,
  type About, type Api, type Deco, type MemberPage, type Shop, type ShopSlot, type Skin, josa } from '@prism/core';
import { ChampImg } from './basics';
import { Icon } from './icons';
import { BgScene } from './bgscene';
import { PieceIcon, ProfileHero, baseTint } from './shop';
import { AboutPick } from './about';

type Tab = 'skin' | ShopSlot | 'intro';
const TABS: [Tab, string][] = [['skin', '대표 스킨'], ['bg', SLOT_KO.bg], ['frame', SLOT_KO.frame], ['fx', SLOT_KO.fx], ['name', SLOT_KO.name], ['title', SLOT_KO.title], ['intro', '소개']];
const SLOTS: ShopSlot[] = ['bg', 'frame', 'fx', 'name', 'title'];
const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary'] as const;

/** 이름#태그 — 태그는 흐리게 (같은 이름도 태그로 구분된다) */
export function NickName({ nick }: { nick: string }) {
  const i = nick.lastIndexOf('#');
  if (i <= 0) return <>{nick}</>;
  return <>{nick.slice(0, i)}<span className="nick-tag">#{nick.slice(i + 1)}</span></>;
}

export function ProfileStudio({ api, page, skins, onClose, onSaved, start = 'skin' }: {
  api: Api; page: MemberPage; skins: Record<number, Skin> | null; onClose: () => void; onSaved: () => void; start?: 'skin' | 'intro';
}) {
  const m = page.member;
  const n = page.total.n;
  const [tab, setTab] = useState<Tab>(start);
  const [shop, setShop] = useState<Shop | null>(null);
  const [intro, setIntro] = useState(m.intro);
  const [about, setAbout] = useState<About | null>(m.about ?? null);
  const [skin, setSkin] = useState<number | null>(m.skin);
  const [deco, setDeco] = useState<Deco>(m.deco ?? {});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => { api.get<Shop>('/api/shop').then((s) => { setShop(s); setDeco(s.deco); }).catch(() => {}); }, [api]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', esc);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { removeEventListener('keydown', esc); document.body.style.overflow = prev; };
  }, [onClose]);

  const main = page.champions[0]?.id ?? null;
  const save = async () => {
    setBusy(true); setMsg('');
    try {
      await api.post('/api/me/profile', { intro, skin });
      if (about && JSON.stringify(about) !== JSON.stringify(m.about ?? null)) await api.post('/api/me/about', { about });
      const was = shop?.deco ?? m.deco ?? {};
      for (const sl of SLOTS) if ((was[sl] ?? null) !== (deco[sl] ?? null)) await api.post('/api/me/equip', { slot: sl, id: deco[sl] ?? null });
      onSaved();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const count = (sl: ShopSlot) => SHOP.filter((x) => x.slot === sl && shop?.owned.includes(x.id)).length;

  return (
    <div className="md-wrap" role="dialog" aria-modal="true" aria-label="프로필 꾸미기">
      <button type="button" className="md-scrim" aria-label="닫기" onClick={onClose} />
      <div className="pst">
        <div className="pst-prev">
          <ProfileHero nick={m.nick} intro={intro} skin={skin} champion={main} deco={deco} />
          <button type="button" className="pst-x" aria-label="닫기" onClick={onClose}><Icon name="x" /></button>
          <span className="pst-live">미리 보기</span>
        </div>
        <nav className="pst-tabs" aria-label="꾸밀 곳">{TABS.map(([k, l]) => (
          <button key={k} type="button" className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {l}{k !== 'skin' && k !== 'intro' && shop && <small>{count(k as ShopSlot)}</small>}
          </button>
        ))}</nav>
        <div className="pst-body">
          {tab === 'skin' && <SkinPanel page={page} skins={skins} pick={skin} onPick={setSkin} n={n} />}
          {tab === 'intro' && <IntroPanel api={api} nick={m.nick} intro={intro} onIntro={setIntro} about={m.about ?? null} onAbout={setAbout} />}
          {tab !== 'skin' && tab !== 'intro' && (shop
            ? <DecoPanel slot={tab} shop={shop} deco={deco} me={{ nick: m.nick, skin, champion: main }} onPick={(id) => setDeco((d) => { const x = { ...d }; if (id) x[tab] = id; else delete x[tab]; return x; })} />
            : <div className="pst-load" role="status" aria-label="불러오는 중">{Array.from({ length: 6 }, (_, i) => <i key={i} className="sk" />)}</div>)}
        </div>
        <footer className="pst-foot">
          {msg ? <span className="l">{msg}</span> : <span className="meta">저장하면 내 페이지·랭킹에 바로 보여요.</span>}
          <span className="sp" />
          <button type="button" className="btn ghost" onClick={onClose}>취소</button>
          <button type="button" className="btn primary" disabled={busy} onClick={save}>{busy ? '저장 중…' : '저장'}</button>
        </footer>
      </div>
    </div>
  );
}

function IntroPanel({ api, nick, intro, onIntro, about, onAbout }: { api: Api; nick: string; intro: string; onIntro: (s: string) => void; about: About | null; onAbout: (a: About | null) => void }) {
  return (
    <div className="pst-intro">
      <div className="pst-field">
        <span className="k">이름</span>
        <div className="pst-name"><b><NickName nick={nick} /></b><Icon name="lock" /></div>
        <span className="meta">롤 계정 이름을 그대로 써요. 롤에서 이름을 바꾸면 다음 판이 기록될 때 함께 바뀌어요.</span>
      </div>
      <label className="pst-field">
        <span className="k">한 줄 소개 <small className="meta">{intro.length}/60</small></span>
        <input className="input" maxLength={60} value={intro} onChange={(e) => onIntro(e.target.value)} placeholder="예: 탱커 좋아합니다, 밤 10시 단골" />
      </label>
      <div className="pst-field">
        <span className="k">나를 소개해요</span>
        <AboutPick api={api} initial={about} onChange={onAbout} />
      </div>
    </div>
  );
}

function SkinPanel({ page, skins, pick, onPick, n }: { page: MemberPage; skins: Record<number, Skin> | null; pick: number | null; onPick: (id: number | null) => void; n: number }) {
  const [champ, setChamp] = useState<number | null>(pick ? Math.floor(pick / 1000) : page.champions[0]?.id ?? null);
  const [q, setQ] = useState('');
  const list = useMemo(() => (skins && champ ? Object.values(skins).filter((s) => s.championId === champ).sort((a, b) => a.tier - b.tier || a.id - b.id) : []), [skins, champ]);
  const found = useMemo(() => (q ? CHAMPION_LIST.filter((c) => matchName(c.name, q)).slice(0, 16) : []), [q]);
  const next = SKIN_TIERS.find((t) => t.need > n);
  const mine = page.champions.slice(0, 8);
  return (
    <div className="pst-skin">
      <div className="pst-row">
        <div className="pst-chips">{mine.map((c) => (
          <button key={c.id} type="button" className={`pst-chip ${champ === c.id ? 'on' : ''}`} onClick={() => setChamp(c.id)} title={CHAMPIONS[c.id]?.name}><ChampImg id={c.id} size={28} /></button>
        ))}</div>
        <span className="sp" />
        <input className="input sm pst-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="다른 챔프 (초성 가능)" />
      </div>
      {found.length > 0 && <div className="pst-chips">{found.map((c) => (
        <button key={c.id} type="button" className="pst-chip wide" onClick={() => { setChamp(c.id); setQ(''); }}><ChampImg id={c.id} size={24} />{c.name}</button>
      ))}</div>}
      <p className="meta pst-hint">기록된 {n}판{next ? ` · ${next.need}판이 되면 ${next.name} 스킨까지 열려요` : ' · 모든 스킨을 쓸 수 있어요'}</p>
      {!skins ? <div className="pst-load">{Array.from({ length: 6 }, (_, i) => <i key={i} className="sk" />)}</div> : champ && (
        <div className="pst-grid skins">
          {list.map((s) => {
            const need = skinNeed(s.tier), locked = n < need;
            return (
              <button key={s.id} type="button" className={`pst-tile ${pick === s.id ? 'on' : ''} ${locked ? 'locked' : ''}`} disabled={locked} onClick={() => onPick(s.id)} title={locked ? `${SKIN_TIERS[s.tier].name} · ${need}판부터` : s.name}>
                <span className="pst-art"><img src={s.tile} alt="" loading="lazy" />{locked && <span className="pst-lock"><Icon name="lock" />{need}판</span>}</span>
                <span className="pst-nm">{s.id === baseSkin(champ) ? '기본' : s.name}</span>
                <span className="pst-sub">{SKIN_TIERS[s.tier].name}</span>
              </button>
            );
          })}
        </div>
      )}
      {pick && <button type="button" className="btn ghost sm pst-clear" onClick={() => onPick(null)}>대표 스킨 빼기 (주 챔프 그림으로)</button>}
    </div>
  );
}

function DecoPanel({ slot, shop, deco, me, onPick }: { slot: ShopSlot; shop: Shop; deco: Deco; me: { nick: string; skin: number | null; champion: number | null }; onPick: (id: string | null) => void }) {
  const items = SHOP.filter((x) => x.slot === slot).sort((a, b) => Number(shop.owned.includes(b.id)) - Number(shop.owned.includes(a.id)) || RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity) || a.price - b.price);
  const cur = deco[slot] ?? null;
  const disc = shop.rates?.discount ?? 0;
  const owned = items.filter((x) => shop.owned.includes(x.id)).length;
  return (
    <div className="pst-deco">
      {!owned && <p className="meta pst-hint">아직 가진 {josa(SLOT_KO[slot], '이/가')} 없어요. 상점에서 {PIECE}로 모을 수 있어요.</p>}
      <div className="pst-grid deco">
        <button type="button" className={`pst-tile none ${!cur ? 'on' : ''}`} onClick={() => onPick(null)}>
          {slot === 'bg'
            ? <><span className="pst-art"><span className="phero-tint" style={{ ['--tint' as string]: baseTint(me.nick) }} /></span><span className="pst-nm">기본 색</span><span className="pst-sub">처음 정해진 색</span></>
            : <><span className="pst-art"><span className="pst-none"><Icon name="x" /></span></span><span className="pst-nm">없음</span><span className="pst-sub">기본 모습</span></>}
        </button>
        {items.map((x) => {
          const has = shop.owned.includes(x.id);
          return (
            <button key={x.id} type="button" className={`pst-tile r-${x.rarity} ${cur === x.id ? 'on' : ''} ${has ? '' : 'locked'}`} disabled={!has} onClick={() => onPick(x.id)} title={has ? x.desc : `${x.name} · 상점에서 ${priceWith(x.price, disc).toLocaleString()} ${PIECE}`}>
              <span className="pst-art">
                {slot === 'bg' ? <BgScene id={x.id} /> : <ProfileHero stage nick={me.nick} skin={me.skin} champion={me.champion} deco={{ [slot]: x.id }} />}
                {!has && <span className="pst-lock"><Icon name="lock" />{priceWith(x.price, disc).toLocaleString()}<PieceIcon size={12} /></span>}
              </span>
              <span className="pst-nm">{x.name}</span>
              <span className={`pst-sub r-${x.rarity}`}>{RARITY_SHOP_KO[x.rarity]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
