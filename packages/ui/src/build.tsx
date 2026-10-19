/**
 * 추천 아이템 (CLAUDE.md v3.88): 신발 · 먼저 갈 세 개 · 그다음 후보.
 * 모임 기록이 충분하면 그 챔프로 실제로 산 순서(판수·승률), 아니면 역할 기본 빌드.
 */
import { ITEM, buildFor, type Api, type Build, type ChampionInfo } from '@prism/core';
import { useLoad } from './crew';
import { ItemIcon } from './game';

const pct = (w: number, n: number) => `${Math.round((w / Math.max(1, n)) * 100)}%`;

function Slot({ id, n, w, rank }: { id: number; n?: number; w?: number; rank?: number }) {
  return (
    <span className="ib-slot">
      <span className="ib-ic">{rank && <i className="ib-rank">{rank}</i>}<ItemIcon id={id} size={40} /></span>
      <b title={ITEM[id]?.name}>{ITEM[id]?.name ?? ''}</b>
      {n ? <small className="num">{n}판 · {pct(w ?? 0, n)}</small> : null}
    </span>
  );
}

export function ItemBuild({ build, title = '추천 아이템' }: { build: Build | null; title?: string }) {
  if (!build || !build.core.length) return null;
  return (
    <div className="ib">
      <div className="ib-h">
        <span className="ib-t">{title}</span>
        <span className="ib-src">{build.source === 'crew' ? `Prism 기록 ${build.games}판 · 자주 산 순서` : `${build.label} 기본 빌드`}</span>
      </div>
      <div className="ib-row">
        {build.boots > 0 && <div className="ib-g boots"><small>신발</small><div className="ib-items"><Slot id={build.boots} /></div></div>}
        <div className="ib-g core"><small>먼저</small><div className="ib-items">{build.core.map((x, i) => <Slot key={x.id} {...x} rank={i + 1} />)}</div></div>
        {build.later.length > 0 && <div className="ib-g later"><small>그다음</small><div className="ib-items">{build.later.slice(0, 3).map((x) => <Slot key={x.id} {...x} />)}</div></div>}
      </div>
      <p className="ib-foot">상대에 따라 바꿀 아이템(치유 감소·관통·방어)은 게임이 시작되면 이번 판 분석에서 알려 드려요.</p>
    </div>
  );
}

/** 챔프 상세 '추천 아이템' 칸: 회원이면 모임 기록으로, 아니면 역할 기본 빌드 (회원 기록은 공개층에 내지 않는다) */
export function ChampItems({ api, championId }: { api: Api | null; championId: number }) {
  const { data } = useLoad<ChampionInfo>(api as Api, api ? `/api/champions/${championId}` : null);
  const build = buildFor(championId, data?.items ?? null);
  return (
    <section className="card pad">
      <ItemBuild build={build} />
      {!api && <p className="ib-foot">Prism 회원이 되면 모임이 실제로 산 아이템으로 바뀌어요.</p>}
    </section>
  );
}
