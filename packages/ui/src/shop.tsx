/**
 * 피스·상점·꾸민 머리·공개 페이지 (CLAUDE.md v3.24). 웹·앱 공용.
 *  - ProfileHero: 내 페이지·회원 페이지·공개 페이지의 머리 (좌우 끝까지, 꾸밈 적용)
 *  - ShopView: 피스 잔액·버는 법·상품 (사면 바로 장착, 가진 것은 장착/해제)
 *  - PublicProfileView: 로그인 없이 보는 그 사람의 강점 (모임 정보 없음)
 */
import { useState, type ReactNode } from 'react';
import {
  CHAMPIONS, DEX_LEVEL_KO, EARN, LEVEL_REWARD, PIECE, ROLE_KO, SHOP, SLOT_KO, cdragon, pct, shareUrl, styleOf,
  type Api, type Deco, type DexLevel, type PublicProfile, type Shop, type ShopItem, type ShopSlot,
} from '@prism/core';
import { ChampImg, Empty, Gem, MemberFace, useSkins } from './basics';
import { useLoad } from './crew';
import { Icon } from './icons';

const SLOTS: ShopSlot[] = ['frame', 'fx', 'name', 'title'];
const titleOf = (d?: Deco) => (d?.title ? SHOP.find((x) => x.id === d.title)?.name : undefined);

/** 피스 아이콘 + 숫자 */
export function Piece({ n, size = 16 }: { n: number; size?: number }) {
  return <span className="piece"><Gem size={size} src="/brand/prism-32.png" /><b>{n.toLocaleString()}</b><small>{PIECE}</small></span>;
}

/** 머리 (좌우 끝까지). 꾸밈: 테두리(frame) · 효과(fx) · 이름(name) · 칭호(title) */
export function ProfileHero({ nick, intro, art, skin, champion, deco, corner, actions, chips, children }: {
  nick: string; intro?: string; art?: string; skin?: number | null; champion?: number | null; deco?: Deco;
  corner?: ReactNode; actions?: ReactNode; chips?: ReactNode; children?: ReactNode;
}) {
  const skins = useSkins();
  const title = titleOf(deco);
  // 배경: 넘겨준 그림 → 대표 스킨 → 주 챔피언
  const bg = art || (skin && skins?.[skin]?.splash) || (champion ? cdragon(CHAMPIONS[champion]?.splash) : '');
  return (
    <header className={`phero ${deco?.frame ?? ''} ${deco?.fx ?? ''}`}>
      {bg && <img className="phero-bg" alt="" src={bg} />}
      {deco?.fx && <span className="phero-fx" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <i key={i} />)}</span>}
      <div className="phero-in">
        {corner && <div className="phero-corner">{corner}</div>}
        {actions && <div className="phero-actions">{actions}</div>}
        <div className="phero-main">
          <span className="phero-face"><MemberFace nick={nick} skin={skin} champion={champion} skins={skins} size={112} /></span>
          <div className="phero-txt">
            {title && <span className="phero-title">{title}</span>}
            <h1 className={`phero-name ${deco?.name ?? ''}`}>{nick}</h1>
            {intro && <p className="phero-intro">{intro}</p>}
            {chips && <div className="phero-chips">{chips}</div>}
          </div>
        </div>
        {children}
      </div>
    </header>
  );
}

/** 공유 버튼: 처음 누르면 공개를 켜고 링크를 복사한다 */
export function ShareButton({ api, id, shared, onChange }: { api: Api; id: string; shared: boolean; onChange?: (on: boolean) => void }) {
  const [done, setDone] = useState(false);
  const [open, setOpen] = useState(false);
  const copy = async () => {
    if (!shared) { await api.post('/api/me/share', { on: true }).catch(() => {}); onChange?.(true); }
    try { await navigator.clipboard.writeText(shareUrl(id)); setDone(true); setTimeout(() => setDone(false), 2000); } catch { /* 클립보드 막힘 */ }
  };
  return (
    <span className="share">
      <button type="button" className="btn sm" onClick={copy}><Icon name={done ? 'check' : 'link'} />{done ? '링크 복사됨' : '공유 링크'}</button>
      {shared && <button type="button" className="btn sm ghost" onClick={() => setOpen(!open)} aria-expanded={open}>공개 중</button>}
      {open && shared && <span className="share-pop">
        <span className="meta">로그인하지 않은 사람도 이 링크로 내 강점(판수·승률·잘하는 챔피언·마스터·활약)을 볼 수 있어요. 모임 정보는 보이지 않아요.</span>
        <button type="button" className="btn sm" onClick={async () => { await api.post('/api/me/share', { on: false }).catch(() => {}); onChange?.(false); setOpen(false); }}>공개 끄기</button>
      </span>}
    </span>
  );
}

// ───────── 상점 ─────────

export function ShopView({ api, preview }: { api: Api; preview?: (deco: Deco) => ReactNode }) {
  const { data, error, reload } = useLoad<Shop>(api, '/api/shop');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [hover, setHover] = useState<ShopItem | null>(null);
  const [slot, setSlot] = useState<ShopSlot>('frame');
  const run = async (k: string, f: () => Promise<unknown>) => { setBusy(k); setMsg(''); try { await f(); reload(); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); } };
  if (error) return <Empty>{error}</Empty>;
  if (!data) return <p className="meta">불러오는 중…</p>;
  const e = data.earned;
  const rows: [string, string, number][] = [
    ['기록된 판', `${e.games}판 × ${EARN.game}`, e.games * EARN.game],
    ['이긴 판', `${e.wins}승 × ${EARN.win}`, e.wins * EARN.win],
    ['모임 판 (회원 2명 이상)', `${e.crew}판 × ${EARN.crew}`, e.crew * EARN.crew],
    ['도감 레벨', `실버 ${LEVEL_REWARD[1]} · 골드 +${LEVEL_REWARD[2]} · 플래티넘 +${LEVEL_REWARD[3]} · 다이아몬드 +${LEVEL_REWARD[4]} · 마스터 +${LEVEL_REWARD[5]}`, e.levels],
    ['함께 해요 참여', `${e.together}번 × ${EARN.together}`, e.together * EARN.together],
    ['매일 첫 접속', `${e.daily}일 × ${EARN.daily}`, e.daily * EARN.daily],
  ];
  // 미리 보기: 마우스를 올린 상품을 지금 꾸밈 위에 얹어 본다
  const look: Deco = hover ? { ...data.deco, [hover.slot]: hover.id } : data.deco;
  return (
    <div className="stack" style={{ gap: 16 }}>
      {preview?.(look)}
      <div className="shop-top">
        <section className="card pad shop-bal">
          <span className="k">내 {PIECE}</span>
          <Piece n={data.balance} size={28} />
          <span className="meta">지금까지 {(data.balance + data.spent).toLocaleString()} 모았고 {data.spent.toLocaleString()} 썼어요</span>
        </section>
        <section className="card pad shop-earn">
          <div className="card-head"><h2>{PIECE} 모으는 법</h2><span className="sp" /><span className="meta">기록에서 자동으로 쌓여요</span></div>
          <div className="earn-list">{rows.map(([k, how, v]) => <div key={k} className="earn-row"><b>{k}</b><span className="meta">{how}</span><span className="num">+{v.toLocaleString()}</span></div>)}</div>
        </section>
      </div>
      {msg && <p className="l" style={{ margin: 0 }}>{msg}</p>}
      <section className="card pad">
        <div className="card-head"><h2>상점</h2><span className="sp" />
          <div className="seg">{SLOTS.map((s) => <button key={s} type="button" className={slot === s ? 'on' : ''} onClick={() => setSlot(s)}>{SLOT_KO[s]}</button>)}</div>
        </div>
        <div className="shop-grid">{SHOP.filter((x) => x.slot === slot).map((x) => {
          const own = data.owned.includes(x.id), on = data.deco[x.slot] === x.id, lack = x.price - data.balance;
          return (
            <article key={x.id} className={`shop-item ${on ? 'on' : ''}`} onMouseEnter={() => setHover(x)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(x)} onBlur={() => setHover(null)}>
              <span className={`shop-sw ${x.slot} ${x.id}`} aria-hidden="true">{x.slot === 'title' ? x.name : x.slot === 'name' ? '이름' : <i />}</span>
              <span className="shop-nm"><b>{x.name}</b><span className="meta">{x.desc}</span></span>
              <span className="shop-act">
                {own
                  ? <button type="button" className={`btn sm ${on ? '' : 'primary'}`} disabled={busy === x.id} onClick={() => run(x.id, () => api.post('/api/me/equip', { slot: x.slot, id: on ? null : x.id }))}>{on ? '해제' : '장착'}</button>
                  : <button type="button" className="btn sm primary" disabled={busy === x.id || lack > 0} title={lack > 0 ? `${lack.toLocaleString()} ${PIECE} 모자라요` : undefined} onClick={() => run(x.id, () => api.post('/api/shop/buy', { id: x.id }))}><Gem size={14} src="/brand/prism-32.png" />{x.price.toLocaleString()}</button>}
              </span>
            </article>
          );
        })}</div>
        <p className="meta" style={{ margin: 0 }}>사면 바로 장착돼요. 마우스를 올리면 위에서 미리 볼 수 있어요.</p>
      </section>
    </div>
  );
}

// ───────── 공개 페이지 (로그인 없이) ─────────

export function PublicProfileView({ data, join }: { data: PublicProfile; join?: ReactNode }) {
  const skins = useSkins();
  const main = data.champions[0]?.id ?? null;
  const art = data.skin && skins?.[data.skin] ? skins[data.skin].splash : main ? cdragon(CHAMPIONS[main]?.splash) : '';
  const t = data.total;
  const kda = t.n ? ((t.k + t.a) / Math.max(1, t.d)).toFixed(2) : '–';
  const S = styleOf(data.champions);
  const feats: [string, number][] = ([['펜타킬', data.feats.penta], ['쿼드라킬', data.feats.quadra], ['피해량 1위', data.feats.dmgTop], ['받은 피해 1위', data.feats.takenTop]] as [string, number][]).filter(([, n]) => n > 0);
  return (
    <div className="stack" style={{ gap: 16 }}>
      <ProfileHero nick={data.nick} intro={data.intro} art={art} skin={data.skin} champion={main} deco={data.deco}
        chips={<><span className="pill dark">아수라장 {t.n}판</span><span className="pill dark">승률 {pct(t.w, t.n)}</span><span className="pill dark">KDA {kda}</span>{data.masters.length > 0 && <span className="pill dark">마스터 {data.masters.length}</span>}</>}
        actions={join} />
      <div className="grid2">
        <section className="card pad">
          <div className="card-head"><h2>잘하는 챔피언</h2><span className="sp" /><span className="meta">3판 이상 · 승수 순</span></div>
          {data.best.length ? <div className="list">{data.best.map((c) => (
            <div key={c.id} className="item"><ChampImg id={c.id} size={36} /><span className="title">{CHAMPIONS[c.id]?.name}{data.masters.includes(c.id) && <span className="pill">마스터</span>}</span><span><b>{c.w}승</b> <span className="meta">{c.n}판 · {pct(c.w, c.n)}</span></span></div>
          ))}</div> : <p className="meta">아직 3판 넘게 한 챔피언이 없어요.</p>}
        </section>
        <section className="card pad">
          <div className="card-head"><h2>플레이 성향</h2></div>
          <div className="pub-roles">{S.roles.slice(0, 4).map((r) => <span key={r.key} className="pub-role"><b>{ROLE_KO[r.key] ?? r.key}</b><span className="bar"><span style={{ width: `${Math.round(r.share * 100)}%` }} /></span><small>{Math.round(r.share * 100)}%</small></span>)}</div>
        </section>
      </div>
      <div className="grid2">
        <section className="card pad">
          <div className="card-head"><h2>도감</h2><span className="sp" /><span className="meta">챔피언·증강</span></div>
          <div className="pub-levels">{([5, 4, 3, 2, 1] as DexLevel[]).map((l) => <span key={l} className={`pub-lv l${l}`}><i>Lv{l}</i><b>{data.levels[l]}</b><small>{DEX_LEVEL_KO[l]}</small></span>)}</div>
          {data.masters.length > 0 && <div className="pub-masters">{data.masters.slice(0, 12).map((id) => <ChampImg key={id} id={id} size={36} />)}</div>}
        </section>
        <section className="card pad">
          <div className="card-head"><h2>활약</h2></div>
          {feats.length ? <div className="pub-feats">{feats.map(([k, n]) => <span key={k} className="pub-feat"><b>{n}</b><small>{k}</small></span>)}</div> : <p className="meta">기록된 활약이 아직 없어요.</p>}
        </section>
      </div>
    </div>
  );
}
