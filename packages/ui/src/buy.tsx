// Lucian UX/UI Prompt #081 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#081
/**
 * 상점 구매 창 (v3.42). '구매'를 누르면 이 창이 뜬다: 상품·가격·보유 피스 확인 → '구매'를 누르면 단추가 원으로 오므라들며
 * 링이 한 바퀴 그려지고 단계(피스 확인 → 보관함에 담기 → 완료)가 차례로 켜진다. 링이 다 차면 초록 체크,
 * 영수증이 아래에서 올라와 '바로 착용할까요?'를 묻는다. 서버 응답이 링보다 늦으면 링이 끝 근처에서 기다린다.
 * 원본(#081)의 구조·모션 값(시간·곡선)을 따르고, 크기와 색은 프로젝트 토큰에 맞췄다 (styles.css .u081).
 */
import { useEffect, useRef, useState } from 'react';
import { PIECE, RARITY_SHOP_KO, SLOT_KO, itemDiscount, priceWith, saleOf, type Api, type Deco, type Shop, type ShopItem } from '@prism/core';
import { PieceIcon, ProfileHero } from './shop';

type Phase = 'confirm' | 'run' | 'ok' | 'rec' | 'error';

export function BuyDialog({ api, item, data, me, onClose, onDone }: {
  api: Api; item: ShopItem; data: Shop; me: { nick: string; skin?: number | null; champion?: number | null };
  onClose: () => void; onDone: (s: Shop) => void;
}) {
  // 출시 기간 새 상품·일반 배경 할인은 상품마다 (itemDiscount, v3.123)
  const disc = itemDiscount(item.id, data.rates?.discount ?? 0, data.rates?.admin);
  const price = priceWith(item.price, disc);
  const after = data.balance - price;
  const [phase, setPhase] = useState<Phase>('confirm');
  const [p, setP] = useState(0);
  const [msg, setMsg] = useState('');
  const [result, setResult] = useState<Shop | null>(null);
  const [wearing, setWearing] = useState(false);
  const goRef = useRef<HTMLButtonElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const raf = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const rm = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    goRef.current?.focus({ preventScroll: true });
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && phase !== 'run') onClose(); };
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  }, [onClose, phase]);
  useEffect(() => () => { cancelAnimationFrame(raf.current); timers.current.forEach(clearTimeout); }, []);

  // 링은 처음엔 빠르게, 끝에 가까워질수록 천천히 차오른다. 서버 응답이 오기 전에는 92%에서 기다린다
  const buy = () => {
    setPhase('run'); setMsg('');
    let done: Shop | null = null, failed: string | null = null;
    api.post<Shop>('/api/shop/buy', { id: item.id, equip: false }).then((s) => { done = s; }).catch((e) => { failed = e instanceof Error ? e.message : String(e); });
    const t0 = performance.now(), DUR = rm ? 600 : 2600, delay = rm ? 0 : 350;
    const step = (now: number) => {
      const k = Math.max(0, Math.min(1, (now - t0 - delay) / DUR));
      let e = 1 - Math.pow(1 - k, 2.2);
      if (failed) { setPhase('error'); setMsg(failed); setP(0); return; }
      if (!done) e = Math.min(e, 0.92);
      setP(e);
      if (k < 1 || !done) { raf.current = requestAnimationFrame(step); return; }
      setResult(done);
      setPhase('ok');
      timers.current.push(setTimeout(() => { setPhase('rec'); setTimeout(() => backRef.current?.focus({ preventScroll: true }), 50); }, rm ? 0 : 900));
    };
    raf.current = requestAnimationFrame(step);
  };
  const wear = async () => {
    if (!result) return;
    setWearing(true);
    try { onDone(await api.post<Shop>('/api/me/equip', { slot: item.slot, id: item.id })); }
    catch { onDone(result); }
  };
  const later = () => { if (result) onDone(result); else onClose(); };

  const look: Deco = { [item.slot]: item.id };
  const steps = ['피스 확인', '보관함에 담기', '완료'];
  const on = (i: number) => (phase === 'ok' || phase === 'rec') || p >= [0.02, 0.45, 0.999][i];
  const cls = phase === 'run' ? 'is-run' : phase === 'ok' ? 'is-ok' : phase === 'rec' ? 'is-ok is-rec' : '';
  return (
    <div className="md-wrap" role="dialog" aria-modal="true" aria-label={`${item.name} 구매`}>
      <button type="button" className="md-scrim" aria-label="닫기" onClick={phase === 'run' ? undefined : later} />
      <div className={`u081 ${cls}`}>
        <div className="u081-prev"><ProfileHero stage nick={me.nick} skin={me.skin ?? null} champion={me.champion ?? null} deco={look} /></div>
        <div className="u081-sum">
          <div><span>{item.name}</span><span className="u081-n">{item.price.toLocaleString()}<PieceIcon size={12} /></span></div>
          {disc > 0 && <div><span>{disc === saleOf(item.id) && disc > (data.rates?.discount ?? 0) ? '일반 배경 할인' : '특별회원 할인'}</span><span className="u081-n">−{(item.price - price).toLocaleString()}<PieceIcon size={12} /></span></div>}
          <div className="t"><span>사용할 {PIECE}</span><span className="u081-n">{price.toLocaleString()}<PieceIcon size={14} /></span></div>
        </div>
        <div className="u081-card"><i aria-hidden="true"><PieceIcon size={16} /></i>보유 {PIECE}<small>{data.balance.toLocaleString()} → <b>{after.toLocaleString()}</b></small></div>
        <div className="u081-opt"><span>종류</span><b>{SLOT_KO[item.slot]}</b></div>
        <div className="u081-opt"><span>등급</span><b className="m">{RARITY_SHOP_KO[item.rarity]}</b></div>
        <div className="u081-steps" aria-hidden="true">{steps.map((s, i) => <span key={s} className={on(i) ? 'on' : ''}>{s}</span>)}</div>
        {phase === 'error' && <p className="u081-err" role="alert">{msg}</p>}
        <div className="u081-stage">
          <button ref={goRef} className="u081-go" type="button" disabled={phase !== 'confirm' && phase !== 'error'} onClick={buy}>
            <span>{price.toLocaleString()} {PIECE}로 구매</span>
          </button>
          <svg className="u081-ring" viewBox="0 0 80 80" aria-hidden="true" style={{ ['--p' as string]: p.toFixed(4) }}><circle className="t" cx="40" cy="40" r="36" /><circle className="p" cx="40" cy="40" r="36" pathLength={100} /></svg>
          <svg className="u081-ck" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        </div>
        <p className="u081-sr" role="status" aria-live="polite">{phase === 'run' ? '구매하는 중이에요' : phase === 'ok' || phase === 'rec' ? '구매를 마쳤어요' : ''}</p>
        <div className="u081-rec" aria-hidden={phase !== 'rec'}>
          <i aria-hidden="true"><svg viewBox="0 0 30 30"><path d="M8 15.5l5 5L23 10" /></svg></i>
          <b>구매를 마쳤어요</b>
          <p>바로 착용할까요?</p>
          <dl><dt>상품</dt><dd>{item.name}</dd><dt>사용한 {PIECE}</dt><dd>{price.toLocaleString()}</dd><dt>남은 {PIECE}</dt><dd>{(result?.balance ?? after).toLocaleString()}</dd></dl>
          <div className="u081-rec-act">
            <button ref={backRef} type="button" tabIndex={phase === 'rec' ? 0 : -1} disabled={wearing} onClick={wear}>{wearing ? '착용하는 중…' : '바로 착용'}</button>
            <button type="button" className="ghost" tabIndex={phase === 'rec' ? 0 : -1} onClick={later}>나중에</button>
          </div>
        </div>
        {phase === 'confirm' && <button type="button" className="u081-x" aria-label="닫기" onClick={onClose}>취소</button>}
      </div>
    </div>
  );
}
