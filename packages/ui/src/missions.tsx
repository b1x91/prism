/**
 * 미션 화면 (CLAUDE.md v3.27). 웹·앱 공용.
 * 이번 주 미션 3개 · 내 플레이 분포 · 역할 개척 · 이번 주 추천 챔프. 깨면 피스가 들어온다 (기록에서 자동 계산).
 */
import { CHAMPIONS, MISSION_ROLE_KO, PIECE, type Api, type MissionState, type Mission } from '@prism/core';
import { ChampImg, Empty } from './basics';
import { useLoad } from './crew';
import { Icon } from './icons';
import { PieceIcon } from './shop';

const DAY = 86_400_000;
const left = (end: number, now = Date.now()) => { const d = Math.ceil((end - now) / DAY); return d <= 1 ? '오늘 밤까지' : `${d}일 남음`; };
const md = (t: number) => { const d = new Date(t + 9 * 3_600_000); return `${d.getUTCMonth() + 1}.${d.getUTCDate()}`; };
/** 주마다 같은 순서로 섞기 (주 안에서는 그대로) */
const shuffle = (ids: number[], seed: number) => [...ids].sort((a, b) => ((a * 9301 + seed) % 233280) - ((b * 9301 + seed) % 233280));

export function MissionsView({ api, onChampion }: { api: Api; onChampion?: (id: number) => void }) {
  const { data, error } = useLoad<MissionState>(api, '/api/me/missions');
  if (error) return <Empty>{error}</Empty>;
  if (!data) return <div className="ms-skel" role="status" aria-label="불러오는 중"><i className="sk" /><i className="sk" /><i className="sk" /></div>;
  const w = data.week;
  const done = w.missions.filter((m) => m.done).length;
  const top = data.shares[0];
  const weak = data.shares[data.shares.length - 1];
  const suggest = shuffle(data.suggest, Math.floor(w.start / DAY)).slice(0, 12);
  const r1 = w.missions[0].role;
  return (
    <div className="ms">
      <header className="ms-head">
        <div><h1>미션</h1><p className="meta">안 해 본 챔프, 덜 해 본 역할로 넓혀 보세요. 깨면 {PIECE}가 들어와요.</p></div>
        <span className="ms-earned"><PieceIcon size={20} /><b>{data.earned.toLocaleString()}</b><small>미션으로 모은 {PIECE}</small></span>
      </header>

      <section className="card pad ms-week">
        <div className="card-head">
          <h2>이번 주 미션</h2>
          <span className="meta">{md(w.start)} ~ {md(w.end - 1)} · {left(w.end)}</span>
          <span className="sp" />
          {w.bonus > 1 && <span className="ms-bonus" title={`지난주까지 ${MISSION_ROLE_KO[w.top!.role]}를 ${Math.round(w.top!.share * 100)}% 했어요. 한쪽으로 치우칠수록 넓히는 보상이 커요.`}>보상 ×{w.bonus}</span>}
          <span className="ms-count"><b>{done}</b>/{w.missions.length}</span>
        </div>
        <div className="ms-list">{w.missions.map((m) => <MissionRow key={m.key} m={m} />)}</div>
        {w.bonus > 1 && <p className="meta ms-note">{MISSION_ROLE_KO[w.top!.role]} 위주로 해 오셨네요 ({Math.round(w.top!.share * 100)}%). 다른 역할을 해 보면 보상이 {w.bonus}배예요.</p>}
      </section>

      {suggest.length > 0 && r1 && <section className="card pad">
        <div className="card-head"><h2>처음 해 볼 {MISSION_ROLE_KO[r1]} 챔프</h2><span className="sp" /><span className="meta">아직 안 해 본 {data.suggest.length}개 중</span></div>
        <div className="ms-sug">{suggest.map((id) => (
          <button key={id} type="button" className="ms-champ" onClick={() => onChampion?.(id)} title={`${CHAMPIONS[id]?.name} 증강 가이드 보기`}>
            <ChampImg id={id} size={48} /><span>{CHAMPIONS[id]?.name}</span>
          </button>
        ))}</div>
      </section>}

      <div className="grid2">
        <section className="card pad">
          <div className="card-head"><h2>내 플레이 분포</h2><span className="sp" /><span className="meta">기록된 판 전체</span></div>
          {top?.n ? <div className="ms-dist">{data.shares.map((s) => (
            <div key={s.role} className={`ms-dr ${s === top ? 'top' : ''} ${s === weak ? 'low' : ''}`}>
              <b>{MISSION_ROLE_KO[s.role]}</b>
              <span className="ms-bar"><span style={{ width: `${Math.max(2, Math.round(s.share * 100))}%` }} /></span>
              <small>{Math.round(s.share * 100)}%<i>{s.n}판</i></small>
            </div>
          ))}</div> : <p className="meta">한 판 하고 오면 채워져요.</p>}
        </section>
        <section className="card pad">
          <div className="card-head"><h2>역할 개척</h2><span className="sp" /><span className="meta">역할마다 해 본 챔프 수</span></div>
          <div className="ms-pio">{data.pioneer.map((p) => (
            <div key={p.role} className="ms-pr">
              <b>{MISSION_ROLE_KO[p.role]}</b>
              <span className="ms-track">
                <span className="ms-fill" style={{ width: `${(p.played / Math.max(1, p.pool)) * 100}%` }} />
                {p.steps.map((s, i) => <i key={i} className={`ms-step ${s.done ? 'on' : ''}`} style={{ left: `${(s.at / Math.max(1, p.pool)) * 100}%` }} title={`${s.at}개 · ${PIECE} ${s.reward}${s.done ? ' · 받음' : ''}`} />)}
              </span>
              <small>{p.played}<i>/{p.pool}</i></small>
            </div>
          ))}</div>
          <p className="meta ms-note">표시마다 {PIECE}를 받아요: 3개 · 8개 · 절반 · 전부.</p>
        </section>
      </div>
    </div>
  );
}

function MissionRow({ m }: { m: Mission }) {
  return (
    <div className={`ms-row ${m.done ? 'done' : ''}`}>
      <span className="ms-ic">{m.done ? <Icon name="check" /> : <Icon name="target" />}</span>
      <span className="ms-txt">
        <b>{m.title}</b>
        <small className="meta">{m.hint}</small>
        <span className="ms-prog"><span className="ms-bar"><span style={{ width: `${(m.progress / m.target) * 100}%` }} /></span><small>{m.progress}/{m.target}</small></span>
      </span>
      <span className={`ms-rew ${m.done ? 'got' : ''}`}><PieceIcon size={18} /><b>{m.reward}</b>{m.done && <small>받음</small>}</span>
    </div>
  );
}
