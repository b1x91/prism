/**
 * 장인: 도감 마스터 여정을 모두 이룬 회원. 챔피언·증강 상세에 이름이 오르고, 랭킹에 장인 순위가 따로 있다.
 * 기준은 도감과 같다 (packages/core/src/mastery.ts, 서버 server/src/artisans.ts).
 */
import { useMemo } from 'react';
import { AUGMENT, CHAMPIONS, WIN_STEPS, type Api, type ArtisanRank, type ArtisanRanking, type Artisans as ArtisansData } from '@prism/core';
import { ChampImg, Empty, MemberFace, useSkins } from './basics';
import { AugRing } from './augment';
import { useLoad } from './crew';
import { PrismMark } from './dex';

/** 챔피언·증강 상세의 장인 칸: 장인(마스터)은 크게 빛나게, 그 아래 장인의 길에 오른 회원 */
export function Artisans({ api, kind, id, onMember }: { api: Api; kind: 'champion' | 'augment'; id: number; onMember?: (id: string) => void }) {
  const { data } = useLoad<ArtisansData>(api, `/api/artisans/${kind}/${id}`);
  const skins = useSkins();
  if (!data) return null;
  const masters = data.artisans.filter((a) => a.master);
  const road = data.artisans.filter((a) => !a.master && a.done > 0).slice(0, 5);
  const what = kind === 'champion' ? '챔프' : '증강';
  if (!masters.length && !road.length) return null;
  return (
    <section className="card pad artisans">
      <div className="card-head"><h2><PrismMark size={20} />장인</h2><span className="sp" /><span className="meta">이 {what}의 마스터 여정을 모두 이룬 회원</span></div>
      <div className={`art-body ${road.length ? 'two' : ''}`}>
      {masters.length ? <div className="art-hall">{masters.map((a) => (
        <button key={a.id} type="button" className="art-card" onClick={() => onMember?.(a.id)}>
          <span className="art-face"><MemberFace nick={a.nick} skin={a.skin} champion={a.main} size={64} skins={skins} /></span>
          <span className="art-tag"><PrismMark size={14} />장인</span>
          <b className="art-nm">{a.nick}</b>
          <span className="art-st">{a.w}승 · {a.n}판</span>
        </button>
      ))}</div> : <p className="art-empty">아직 장인이 없어요. 첫 장인의 영광은 누가 차지할까요?</p>}
      {road.length > 0 && <div className="art-road">
        <span className="k">장인의 길</span>
        {road.map((a) => (
          <button key={a.id} type="button" className="art-row" onClick={() => onMember?.(a.id)}>
            <MemberFace nick={a.nick} skin={a.skin} champion={a.main} size={32} skins={skins} />
            <span className="nm">{a.nick}</span>
            <span className="pips" aria-label={`${a.done}/${a.total}`}><i className={`pip s ${a.special ? 'on' : ''}`} />{WIN_STEPS.map((t) => <i key={t} className={`pip ${a.w >= t ? 'on' : ''}`} />)}</span>
            <span className="meta">{a.done}/{a.total} · {a.w}승</span>
          </button>
        ))}
      </div>}
      </div>
    </section>
  );
}

/** 랭킹: 챔피언 장인 / 증강 장인 (마스터 수 → 이룬 목표 수) */
export function ArtisanRankingView({ api, kind, meId, onOpen }: { api: Api; kind: 'champions' | 'augments'; meId?: string; onOpen: (id: string) => void }) {
  const { data, error } = useLoad<ArtisanRanking>(api, '/api/ranking/artisans');
  const skins = useSkins();
  const rows = useMemo(() => data?.[kind] ?? [], [data, kind]);
  if (error) return <p className="l">{error}</p>;
  if (!data) return null;
  if (!rows.length) return <Empty>아직 마스터 여정을 시작한 회원이 없습니다.</Empty>;
  return (
    <div className="card rank-list art-rank">
      {rows.map((r, i) => <ArtRow key={r.id} r={r} rank={i + 1} kind={kind} me={r.id === meId} skins={skins} onOpen={onOpen} />)}
    </div>
  );
}

function ArtRow({ r, rank, kind, me, skins, onOpen }: { r: ArtisanRank; rank: number; kind: 'champions' | 'augments'; me: boolean; skins: ReturnType<typeof useSkins>; onOpen: (id: string) => void }) {
  const icon = (id: number) => (kind === 'champions' ? <ChampImg key={id} id={id} size={24} /> : <AugRing key={id} id={id} size={24} />);
  return (
    <button type="button" className={`rank-row ${me ? 'me' : ''} ${rank === 1 && r.masters > 0 ? 'first' : ''}`} onClick={() => onOpen(r.id)}>
      <span className="rk">{rank}</span>
      <MemberFace nick={r.nick} skin={r.skin} champion={r.main} skins={skins} size={40} />
      <span className="who"><b>{r.nick}</b>
        {r.masterIds.length ? <span className="art-icons">{r.masterIds.map(icon)}</span>
          : r.best ? <span className="meta">가장 가까운 {(kind === 'champions' ? CHAMPIONS[r.best.id]?.name : AUGMENT[r.best.id]?.name) ?? ''} · {r.best.done}/6</span> : null}</span>
      <span className="num key">{r.masters > 0 && <PrismMark size={16} />}{r.masters}<small>장인</small></span>
      <span className="num">{r.goals}<small>목표</small></span>
    </button>
  );
}
