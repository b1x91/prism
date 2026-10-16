/**
 * 불러오는 동안의 자리표시 (v3.51). 실제 화면과 같은 틀·크기로 자리를 잡아 두고, 빛 한 줄기가 화면 전체를 한 번에 지나간다
 * (뼈대마다 따로 번쩍이지 않게 — 배경을 화면 기준으로 고정). 0.12초 안에 끝나는 빠른 불러오기에서는 보이지 않게 늦게 나타난다.
 * 데이터가 오면 같은 자리에서 자리표시가 사라지며 실제 화면이 서서히 나타난다 (`Swap`, 사이에 빈 화면·깜빡임 없이).
 */
import { useEffect, useLayoutEffect, useState, type CSSProperties, type ReactNode, type SyntheticEvent } from 'react';

/* 지금 떠 있는 자리표시들 (언제부터 실제로 보이는지). 넘겨받기·겹쳐 사라지기 판단에 쓴다 */
let seq = 0, goneAt = -1e9;
const shown = new Map<number, number>();
/** 자리표시가 지금 화면에 실제로 보이는가 (늦게 나타나기 0.12초가 지났는가) */
export function skeletonVisible(): boolean {
  const t = performance.now();
  for (const v of shown.values()) if (v <= t) return true;
  return false;
}

/**
 * 데이터가 도착한 그 렌더에서 바로 '겹쳐 바꾸기'를 켠다 (그린 뒤에 켜면 실제 화면이 한 프레임 보였다가 사라지며 깜빡인다).
 * 자리표시가 실제로 보이고 있었을 때만 켠다 — 빠른 불러오기는 그냥 바로 보인다.
 */
export function useReveal(ready: boolean): boolean {
  const [s, setS] = useState({ ready, fade: false });
  if (s.ready !== ready) setS({ ready, fade: ready && skeletonVisible() });
  useEffect(() => {
    if (!s.fade) return;
    const t = setTimeout(() => setS((x) => ({ ...x, fade: false })), 420);
    return () => clearTimeout(t);
  }, [s.fade]);
  return s.fade;
}

/**
 * 자리표시 → 실제 화면을 같은 자리에서 겹쳐 바꾼다: 자리표시가 위에서 서서히 사라지는 동안 실제 화면이 아래에서 서서히 나타난다
 * (그 사이 빈 화면이 끼지 않게). 실제 화면의 맨 바깥 요소에 `fadeCls(on)` 을 준다.
 */
export function Swap({ on, skeleton, children }: { on: boolean; skeleton: ReactNode; children: ReactNode }) {
  return <div className="swap">{children}{on && <div className="swap-sk" aria-hidden="true">{skeleton}</div>}</div>;
}
export const fadeCls = (on: boolean) => (on ? 'fade-in' : '');

/** 그림이 다 받아지면 서서히 (img 에 className="fi" 와 함께) */
export const imgIn = { onLoad: (e: SyntheticEvent<HTMLImageElement>) => e.currentTarget.classList.add('ld'), onError: (e: SyntheticEvent<HTMLImageElement>) => e.currentTarget.classList.add('ld') };

type BoneProps = { w?: number | string; h?: number | string; r?: 's' | 'm' | 'l' | 'pill' | 'round'; dark?: boolean; className?: string; style?: CSSProperties };

/** 뼈대 한 조각 */
export function Bone({ w, h, r = 's', dark, className = '', style }: BoneProps) {
  // 높이를 안 주면: 클래스가 정한 크기(그림 칸 등)를 따르고, 클래스도 없으면 글 한 줄 높이
  const height = h ?? (className ? undefined : 12);
  return <i className={`sk r-${r} ${dark ? 'dk' : ''} ${className}`} style={{ width: w, height, ...style }} aria-hidden="true" />;
}

/** 자리표시 묶음: 화면 읽기에는 '불러오는 중' 하나로, 보이기는 늦게 */
export function SkeletonFrame({ children, className = '', label = '불러오는 중' }: { children: ReactNode; className?: string; label?: string }) {
  // 다른 자리표시가 이미 보이고 있었으면(페이지 자리표시 → 화면 자리표시) 늦게 나타나지 않고 그대로 이어받는다 — 사이에 빈 화면이 끼지 않게
  const [now] = useState(() => skeletonVisible() || performance.now() - goneAt < 250);
  useLayoutEffect(() => {
    const id = ++seq;
    shown.set(id, now ? 0 : performance.now() + 120);
    return () => { shown.delete(id); goneAt = performance.now(); };
  }, [now]);
  return <div className={`skf ${now ? 'now' : ''} ${className}`} role="status" aria-busy="true" aria-label={label}>{children}</div>;
}

/** 글 줄 여러 개 (길이가 조금씩 다르게) */
export function Lines({ n = 3, h = 12, gap = 8, first = 70 }: { n?: number; h?: number; gap?: number; first?: number }) {
  return <div className="sk-lines" style={{ gap }}>{Array.from({ length: n }, (_, i) => <Bone key={i} h={h} w={`${i === 0 ? first : 92 - ((i * 23) % 38)}%`} />)}</div>;
}

/** 목록 한 줄: 얼굴 + 이름·설명 + 오른쪽 숫자 */
function Row({ face = 40, round = false, nums = 2 }: { face?: number; round?: boolean; nums?: number }) {
  return (
    <div className="sk-row">
      <Bone w={face} h={face} r={round ? 'round' : 'm'} />
      <span className="sk-row-t"><Bone w="46%" h={14} /><Bone w="28%" h={10} /></span>
      {Array.from({ length: nums }, (_, i) => <Bone key={i} w={i ? 40 : 56} h={i ? 12 : 16} />)}
    </div>
  );
}

/** 목록 카드 (함께한 친구들·장인 순위 같은 줄 목록) */
export function RowsSkeleton({ n = 5, face = 40, round = false, nums = 2, card = true }: { n?: number; face?: number; round?: boolean; nums?: number; card?: boolean }) {
  const rows = <div className="sk-rows">{Array.from({ length: n }, (_, i) => <Row key={i} face={face} round={round} nums={nums} />)}</div>;
  return <SkeletonFrame>{card ? <div className="card pad">{rows}</div> : rows}</SkeletonFrame>;
}

/** 카드 머리 (제목 + 오른쪽 설명) */
function Head({ w = 120 }: { w?: number }) {
  return <div className="sk-head"><Bone w={w} h={18} /><span className="sp" /><Bone w={96} h={10} /></div>;
}

/** 회원 페이지: 좌우 끝까지 닿는 머리 + 숫자 넷 + 최근 판 + 두 칸 */
export function MemberSkeleton({ public: pub = false }: { public?: boolean }) {
  return (
    <SkeletonFrame className="stack sk-member">
      <div className={`phero sk-hero ${pub ? '' : 'lift'}`}>
        <div className="sk-hero-in">
          <Bone w={112} h={112} r="l" dark />
          <div className="sk-hero-t">
            <Bone w={220} h={36} dark />
            <Bone w={300} h={12} dark style={{ maxWidth: '80%' }} />
            <div className="sk-chips">{[64, 72, 56, 80].map((w, i) => <Bone key={i} w={w} h={24} r="pill" dark />)}</div>
          </div>
        </div>
      </div>
      {pub ? <div className="grid4">{[0, 1, 2, 3].map((i) => <section key={i} className="card stat sk-stat"><Bone w={56} h={10} /><Bone w={88} h={28} /></section>)}</div>
        : <section className="card pdash">
          <div className="pd-head"><Bone w={72} h={16} /><Bone w={140} h={10} /><span className="sp" /><Bone w={112} h={24} r="pill" /><Bone w={112} h={24} r="pill" /></div>
          <div className="pd-grid">
            {[0, 1, 2, 3].map((i) => <div key={i} className="pd-tile"><Bone w={48} h={10} /><Bone w={96} h={28} /><Bone w="100%" h={8} r="pill" />{i > 0 && <Bone w="70%" h={10} />}</div>)}
            <div className="pd-tile pd-trend"><Bone w={140} h={12} /><Bone w="100%" h={120} r="m" /><Bone w="80%" h={10} /></div>
          </div>
        </section>}
      {!pub && <section className="card pad"><Head w={88} /><div className="rstrip">{Array.from({ length: 10 }, (_, i) => <Bone key={i} r="m" className="sk-tile" />)}</div></section>}
      <div className="grid2">
        {[0, 1].map((k) => <section key={k} className="card pad"><Head w={k ? 104 : 72} /><div className="sk-rows">{Array.from({ length: 5 }, (_, i) => <Row key={i} face={32} nums={1} />)}</div></section>)}
      </div>
    </SkeletonFrame>
  );
}

/** 랭킹: 어두운 무대의 세 카드 + 아래 줄 목록 */
export function RankingSkeleton() {
  return (
    <SkeletonFrame className="stack">
      <section className="lb still sk-lb" aria-hidden="true">
        <div className="lb-row">{[2, 1, 3].map((rank) => (
          <div key={rank} className={`lb-slot p${rank}`}>
            <div className="lb-card sk-lbcard">
              <Bone w={rank === 1 ? 88 : 72} h={rank === 1 ? 88 : 72} r="round" dark />
              <Bone w="62%" h={16} dark />
              <Bone w={rank === 1 ? 88 : 64} h={rank === 1 ? 28 : 20} dark />
              <Bone w={56} h={10} dark />
            </div>
            <div className="lb-ped sk-ped" />
          </div>
        ))}</div>
      </section>
      <div className="card rank-list sk-rows">{Array.from({ length: 6 }, (_, i) => <Row key={i} face={40} nums={2} />)}</div>
    </SkeletonFrame>
  );
}

/** 이번 주 미션: 머리(제목 + 진척 고리) + 카드 셋 + 처음 해 볼 챔프 한 줄 + 역할 표 */
export function MissionsSkeleton() {
  return (
    <SkeletonFrame className="msn">
      <header className="msn-head"><div className="sk-lines" style={{ gap: 8 }}><Bone w={140} h={10} /><Bone w={180} h={28} /></div><span className="sp" /><Bone w={72} h={72} r="round" /></header>
      <div className="msn-cards">{[0, 1, 2].map((i) => (
        <div key={i} className="card msn-card sk-msn"><Bone w={72} h={20} r="pill" /><Bone w="80%" h={18} /><Lines n={2} h={10} first={95} /><Bone w="100%" h={8} r="pill" /><Bone w="100%" h={40} r="m" /></div>
      ))}</div>
      <section className="msn-try"><Bone w={160} h={14} /><div className="msn-strip">{Array.from({ length: 8 }, (_, i) => <Bone key={i} r="l" className="sk-msn-champ" />)}</div></section>
      <section className="card pad"><Head w={48} /><div className="sk-rows">{Array.from({ length: 6 }, (_, i) => <div key={i} className="sk-row sk-role"><Bone w={72} h={14} /><Bone w="100%" h={8} r="pill" /><Bone w="100%" h={8} r="pill" /></div>)}</div></section>
    </SkeletonFrame>
  );
}

/** 상점: 제목 + 종류 탭 + 진열장 카드 */
export function ShopSkeleton() {
  return (
    <SkeletonFrame className="shop">
      <header className="shop-head"><Bone w={80} h={28} /></header>
      <div className="shop-bar"><div className="shop-tabs">{[64, 92, 84, 84, 84, 64].map((w, i) => <Bone key={i} w={w} h={40} r="pill" />)}</div></div>
      <div className="shop-grid">{Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="card sk-shopcard"><Bone w="100%" h={168} r="m" /><div className="sk-lines" style={{ gap: 8, padding: 'var(--s4)' }}><Bone w="60%" h={16} /><Bone w="40%" h={10} /><Bone w="100%" h={36} r="m" style={{ marginTop: 8 }} /></div></div>
      ))}</div>
    </SkeletonFrame>
  );
}

/** 모임 기록 판 (기록 카드 묶음) */
export function BoardSkeleton() {
  return (
    <SkeletonFrame className="stack">
      <div className="grid4">{[0, 1, 2, 3].map((i) => <section key={i} className="card stat sk-stat"><Bone w={56} h={10} /><Bone w={72} h={28} /></section>)}</div>
      <div className="grid2">{[0, 1].map((k) => <section key={k} className="card pad"><Head w={96} /><div className="sk-rows">{Array.from({ length: 4 }, (_, i) => <Row key={i} face={32} nums={1} />)}</div></section>)}</div>
    </SkeletonFrame>
  );
}

/** 챔프 상세의 모임 기록 두 칸 */
export function ChampionCrewSkeleton() {
  return (
    <SkeletonFrame className="grid2">
      <section className="card pad"><Head w={80} /><div className="grid2" style={{ gap: 12 }}>{[0, 1].map((i) => <div key={i} className="sk-lines" style={{ gap: 8 }}><Bone w={48} h={10} /><Bone w={72} h={24} /></div>)}</div><div className="sk-rows" style={{ marginTop: 16 }}>{[0, 1, 2].map((i) => <Row key={i} face={32} nums={1} />)}</div></section>
      <section className="card pad"><Head w={64} /><div className="sk-rows">{[0, 1, 2, 3].map((i) => <Row key={i} face={28} round nums={1} />)}</div></section>
    </SkeletonFrame>
  );
}

/** 웹: 로그인 확인 전에 그 페이지 모양을 미리 (빈 화면이 깜빡이지 않게) */
export function PageSkeleton({ kind }: { kind: 'member' | 'ranking' | 'missions' | 'shop' | 'crew' | 'dex' }) {
  if (kind === 'member') return <MemberSkeleton />;
  if (kind === 'missions') return <MissionsSkeleton />;
  if (kind === 'shop') return <ShopSkeleton />;
  const title = <div className="sk-lines" style={{ gap: 8, marginBottom: 'var(--s2)' }}><Bone w={120} h={28} /><Bone w={280} h={12} style={{ maxWidth: '80%' }} /></div>;
  if (kind === 'ranking') return <div className="stack" style={{ gap: 24 }}>{title}<RankingSkeleton /></div>;
  if (kind === 'dex') return (
    <SkeletonFrame className="stack">{title}
      <section className="card pad"><Head w={140} /><Bone w="100%" h={8} r="pill" /></section>
      <div className="sk-dexgrid">{Array.from({ length: 24 }, (_, i) => <Bone key={i} r="m" className="sk-tile" />)}</div>
    </SkeletonFrame>
  );
  return <div className="stack" style={{ gap: 24 }}>{title}<SkeletonFrame className="stack"><section className="card pad"><Head w={120} /><div className="grid3">{[0, 1, 2].map((i) => <Bone key={i} h={120} r="m" />)}</div></section></SkeletonFrame><RowsSkeleton n={4} round /></div>;
}
