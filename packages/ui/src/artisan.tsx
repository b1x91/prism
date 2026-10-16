/**
 * 장인: 도감 마스터 여정을 모두 이룬 회원. 챔피언·증강 상세에 이름이 오르고, 랭킹에 장인 순위가 따로 있다.
 * 기준은 도감과 같다 (packages/core/src/mastery.ts, 서버 server/src/artisans.ts).
 */
import { useMemo } from 'react';
import { AUGMENT, CHAMPIONS, type Api, type ArtisanRank, type ArtisanRanking, type Artisans as ArtisansData, shortNick } from '@prism/core';
import { ChampImg, Empty, LockedMore, MemberFace, useSkins } from './basics';
import { NickName } from './studio';
import { AugRing } from './augment';
import { useLoad } from './crew';
import { PrismMark } from './dex';
import { Bone, SkeletonFrame, useReveal, Swap, fadeCls } from './skeleton';

/** 챔피언·증강 상세의 장인 칸 (v3.38): 왼쪽 장인 명패(없으면 빈 자리), 오른쪽 장인의 길 순위. 늘 보인다 */
export function Artisans({ api, kind, id, onMember }: { api: Api; kind: 'champion' | 'augment'; id: number; onMember?: (id: string) => void }) {
  const { data } = useLoad<ArtisansData>(api, `/api/artisans/${kind}/${id}`);
  const skins = useSkins();
  const what = kind === 'champion' ? '챔프' : '증강';
  const masters = data?.artisans.filter((a) => a.master) ?? [];
  const road = data?.artisans.filter((a) => !a.master && a.done > 0).slice(0, 5) ?? [];
  return (
    <section className="card art2" aria-label="장인">
      <div className="art2-hall">
        <span className="art2-k"><PrismMark size={14} />장인</span>
        {!data ? <div className="art2-plaque"><Bone w={64} h={64} r="round" dark /><Bone w={120} h={14} dark /><Bone w={180} h={10} dark /><Bone w={140} h={10} dark /></div> : masters.length ? <div className="art2-masters">{masters.slice(0, 3).map((a) => (
          <button key={a.id} type="button" className="art2-plaque on" onClick={() => onMember?.(a.id)}>
            <span className="art2-ring"><MemberFace nick={a.nick} skin={a.skin} champion={a.main} size={56} skins={skins} /></span>
            <b className="art2-nm"><NickName nick={a.nick} /></b>
            <small>{a.w}승 · {a.n}판</small>
          </button>
        ))}{masters.length > 3 && <span className="art2-more">+{masters.length - 3}</span>}</div>
          : <div className="art2-plaque empty">
            <span className="art2-ring"><span className="art2-q">?</span></span>
            <b className="art2-nm">첫 장인을 기다려요</b>
            <small>이 {what}의 마스터 여정을 모두 이루면 여기에 이름이 올라요</small>
          </div>}
      </div>
      <div className="art2-road">
        <div className="art2-road-h"><b>장인의 길</b><span className="meta">이룬 목표 순</span></div>
        {!data ? <div className="art2-rows">{[0, 1].map((i) => <div key={i} className="art2-row" style={{ cursor: "default" }}><Bone w={12} h={12} /><Bone w={28} h={28} r="round" /><Bone w="60%" h={12} /><Bone w="100%" h={6} r="pill" /><Bone w={28} h={12} /></div>)}</div>
          : road.length ? <ol className="art2-rows">{road.map((a, i) => (
            <li key={a.id}><button type="button" className="art2-row" onClick={() => onMember?.(a.id)}>
              <span className="rk">{i + 1}</span>
              <MemberFace nick={a.nick} skin={a.skin} champion={a.main} size={28} skins={skins} />
              <span className="nm"><NickName nick={a.nick} /></span>
              <span className="art2-prog"><span style={{ width: `${(a.done / Math.max(1, a.total)) * 100}%` }} /></span>
              <span className="art2-n"><b>{a.done}</b>/{a.total}</span>
            </button></li>
          ))}</ol>
          : <p className="art2-none">아직 이 {what}로 목표를 이룬 회원이 없어요. 먼저 길을 열어 보세요.</p>}
      </div>
    </section>
  );
}

/** 랭킹: 챔피언 장인 / 증강 장인 (마스터 수 → 이룬 목표 수) */
export function ArtisanRankingView({ api, kind, meId, onOpen }: { api: Api; kind: 'champions' | 'augments'; meId?: string; onOpen: (id: string) => void }) {
  const { data, error } = useLoad<ArtisanRanking>(api, '/api/ranking/artisans');
  const skins = useSkins();
  const rows = useMemo(() => data?.[kind] ?? [], [data, kind]);
  const rv = useReveal(Boolean(data));
  if (error) return <p className="l">{error}</p>;
  if (!data) return <ArtRankSkeleton />;
  if (!rows.length) return <Empty>아직 마스터 여정을 시작한 회원이 없습니다.</Empty>;
  return (<Swap on={rv} skeleton={<ArtRankSkeleton />}>
    <div className={`card rank-list art-rank ${fadeCls(rv)}`}>
      {rows.map((r, i) => <ArtRow key={r.id} r={r} rank={i + 1} kind={kind} me={r.id === meId} skins={skins} onOpen={onOpen} />)}
      {data.limited && <LockedMore more={data.limited[kind] - rows.length} />}
    </div>
  </Swap>);
}

function ArtRow({ r, rank, kind, me, skins, onOpen }: { r: ArtisanRank; rank: number; kind: 'champions' | 'augments'; me: boolean; skins: ReturnType<typeof useSkins>; onOpen: (id: string) => void }) {
  const icon = (id: number) => (kind === 'champions' ? <ChampImg key={id} id={id} size={24} /> : <AugRing key={id} id={id} size={24} />);
  return (
    <button type="button" className={`rank-row ${me ? 'me' : ''} ${rank === 1 && r.masters > 0 ? 'first' : ''}`} onClick={() => onOpen(r.id)}>
      <span className="rk">{rank}</span>
      <MemberFace nick={r.nick} skin={r.skin} champion={r.main} skins={skins} size={40} />
      <span className="who"><b>{shortNick(r.nick)}</b>
        {r.masterIds.length ? <span className="art-icons">{r.masterIds.map(icon)}</span>
          : r.best ? <span className="meta">가장 가까운 {(kind === 'champions' ? CHAMPIONS[r.best.id]?.name : AUGMENT[r.best.id]?.name) ?? ''} · {r.best.done}/6</span> : null}</span>
      <span className="num key">{r.masters > 0 && <PrismMark size={16} />}{r.masters}<small>장인</small></span>
      <span className="num">{r.goals}<small>목표</small></span>
    </button>
  );
}

function ArtRankSkeleton() {
  return (
    <SkeletonFrame className="card rank-list art-rank">{Array.from({ length: 6 }, (_, i) => (
      <div key={i} className="rank-row" style={{ cursor: 'default' }}><Bone w={16} h={14} /><Bone w={40} h={40} r="round" />
        <span className="who"><Bone w={96} h={14} /><span className="art-icons">{[0, 1, 2].map((k) => <Bone key={k} w={24} h={24} r="round" />)}</span></span>
        <Bone w={48} h={16} /><Bone w={40} h={16} /></div>
    ))}</SkeletonFrame>
  );
}
