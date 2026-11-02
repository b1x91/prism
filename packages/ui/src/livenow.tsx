/**
 * 회원 페이지 맨 위 '지금 게임 중' (CLAUDE.md v3.136).
 * 앱이 알린 단계·챔프 + 같은 판의 NOW 줄에서 같은 팀·상대 팀 회원. 30초마다(화면이 보일 때만) 다시 본다.
 */
import { useEffect, useState } from 'react';
import { AUGMENT, CHAMPIONS, cdragon, shortNick, type Api, type LiveBoardPlayer, type MemberLive } from '@prism/core';
import { ChampImg, MemberFace } from './basics';
import { AugRing, AugmentLink } from './augment';
import { ItemIcon } from './game';
import { imgIn } from './skeleton';

const POLL = 30_000;
const FIRST_WAIT = 1200; // 페이지가 이만큼은 기다려 준다 — 늦게 끼어들며 밀리지 않게 (v3.93)

/** 지금 이 회원의 판. ready = 첫 답이 왔거나 기다릴 만큼 기다림 */
export function useMemberLive(api: Api, id: string) {
  const [live, setLive] = useState<MemberLive | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let dead = false;
    setLive(null); setReady(false);
    const wait = setTimeout(() => !dead && setReady(true), FIRST_WAIT);
    const load = () => api.get<{ live: MemberLive | null }>(`/api/now/member/${encodeURIComponent(id)}`)
      .then((r) => { if (!dead) setLive(r.live); }).catch(() => {}).finally(() => { if (!dead) setReady(true); });
    void load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, POLL);
    const onVis = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { dead = true; clearTimeout(wait); clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [api, id]);
  return { live, ready };
}

const minsOf = (t: number) => Math.max(1, Math.round((Date.now() - t) / 60_000));

export function LiveNow({ live, meId, over, onMember }: { live: MemberLive; meId?: string; over?: boolean; onMember?: (id: string) => void }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), POLL); return () => clearInterval(t); }, []);
  const c = live.champ ? CHAMPIONS[live.champ] : null;
  const game = live.phase === 'game';
  const withMe = meId ? live.allies.some((x) => x.id === meId) : false;
  const vsMe = meId ? live.foes.some((x) => x.id === meId) : false;
  const side = (list: MemberLive['allies'], total: number, foe?: boolean) => {
    const rest = Math.max(0, total - list.length);
    return (
      <div className={`ln-side ${foe ? 'foe' : ''}`}>
        <span className="ln-k">{foe ? '상대 팀' : '같은 팀'}</span>
        <div className="ln-faces">
          {list.map((f) => (
            <button key={f.id} type="button" className={`ln-face ${f.id === meId ? 'me' : ''}`} title={f.nick} onClick={() => onMember?.(f.id)}>
              <MemberFace nick={f.nick} skin={f.skin} champion={f.main} size={40} />
              {f.champ ? <span className="ln-fc"><ChampImg id={f.champ} size={20} /></span> : null}
            </button>
          ))}
          {rest > 0 && <span className="ln-rest">{list.length ? `+${rest}` : `${rest}명`}</span>}
        </div>
      </div>
    );
  };
  const board = game ? live.board : null;
  const teams = !board && game && (live.allies.length > 0 || live.foes.length > 0);
  const gameMin = board && board.time > 0 ? Math.max(1, Math.floor(board.time / 60)) : minsOf(live.since);
  return (
    <section className={`card live-now ${game ? 'game' : 'select'} ${over ? 'over' : ''}`} aria-live="polite">
      {c?.splash && <img className="ln-bg fi" src={cdragon(c.splash)} alt="" {...imgIn} />}
      <div className="ln-in">
        <div className="ln-main">
          {live.champ ? <ChampImg id={live.champ} size={56} className="ln-icon" /> : <span className="ln-icon ln-wait" />}
          <div className="ln-t">
            <span className="ln-state"><i className="ln-dot" />{game ? `게임 중 · ${gameMin}분째` : '챔프 고르는 중'}{game && live.custom ? <em>사용자 설정</em> : null}</span>
            <b className="ln-champ">{c?.name ?? (game ? '게임 중' : '챔프를 고르고 있어요')}</b>
            {(withMe || vsMe) && <span className={`ln-me ${vsMe ? 'vs' : ''}`}>{vsMe ? '나와 맞대결 중' : '나와 같은 팀'}</span>}
          </div>
        </div>
        {teams && <div className="ln-teams">
          {side(live.allies, live.allySize)}
          {(live.foes.length > 0) && side(live.foes, live.foeSize, true)}
        </div>}
      </div>
      {board && (board.mine.length > 0 || board.theirs.length > 0) && <div className="ln-board">
        <BoardTeam title="우리 팀" list={board.mine} meId={meId} onMember={onMember} />
        <BoardTeam title="상대 팀" foe list={board.theirs} meId={meId} onMember={onMember} />
        <p className="ln-note">{board.mine.concat(board.theirs).some((p) => p.augments.length) ? '' : '증강은 게임이 알려 주는 만큼만 보여요. '}1분마다 새로 받아요 · {Math.max(0, Math.round((Date.now() - board.at) / 60_000))}분 전</p>
      </div>}
    </section>
  );
}

/** 한 팀 줄: 챔프 · 이름(회원이면 얼굴·누르면 회원 페이지) · 레벨 · KDA · 증강 · 아이템 */
function BoardTeam({ title, list, foe, meId, onMember }: { title: string; list: LiveBoardPlayer[]; foe?: boolean; meId?: string; onMember?: (id: string) => void }) {
  const kills = list.reduce((n, p) => n + p.k, 0);
  return (
    <div className={`lvb-team ${foe ? 'foe' : ''}`}>
      <header><b>{title}</b><span>{kills} 킬</span></header>
      {list.map((p, i) => (
        <div key={i} className={`lvb-row ${p.me ? 'me' : ''} ${p.member?.id === meId ? 'viewer' : ''}`}>
          <span className="lvb-champ">{p.champ ? <ChampImg id={p.champ} size={36} /> : <i className="lvb-blank" />}{p.level > 0 && <em>{p.level}</em>}</span>
          <span className="lvb-who">
            {p.member ? <button type="button" className="lvb-name" onClick={() => onMember?.(p.member!.id)}><MemberFace nick={p.member.nick} skin={p.member.skin} champion={p.member.main} size={20} />{shortNick(p.member.nick)}</button>
              : <span className="lvb-name guest">{p.name}</span>}
            <small>{CHAMPIONS[p.champ]?.name ?? ''}</small>
          </span>
          <span className="lvb-kda"><b>{p.k}</b>/<b className="d">{p.d}</b>/<b>{p.a}</b></span>
          <span className="lvb-augs">{p.augments.length ? p.augments.slice(0, 6).map((a, j) => AUGMENT[a]
            ? <AugmentLink key={`${a}-${j}`} id={a} champion={p.champ} className="lvb-aug"><AugRing id={a} size={26} /></AugmentLink> : null) : <span className="lvb-none">증강 정보 없음</span>}</span>
          <span className="lvb-items">{p.items.slice(0, 7).map((x, j) => <ItemIcon key={`${x}-${j}`} id={x} size={22} />)}</span>
        </div>
      ))}
    </div>
  );
}
