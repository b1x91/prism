import { Link, useNavigate } from 'react-router-dom';
import { ACTIVE_AUGMENTS, CHAMPIONS, CHAMPION_LIST, cdragon } from '@prism/core';
import { ChampImg, ChampSearch, Channels, Gem, Icon, Refraction } from '@prism/ui';
import { APP_URL, useSession } from '../session';

const QUICK = ['아리', '징크스', '가렌', '럭스', '야스오', '말파이트', '세라핀', '이즈리얼'];
const art = (name: string) => cdragon(CHAMPION_LIST.find((c) => c.name === name)?.splash ?? null);

export function Home() {
  const nav = useNavigate();
  const { links } = useSession();
  const picks = QUICK.map((n) => CHAMPION_LIST.find((c) => c.name === n)).filter(Boolean) as typeof CHAMPION_LIST;
  return (
    <>
      <section className="hero"><div className="wrap">
        <div>
          <span className="eyebrow"><Gem size={16} src="/brand/prism-32.png" />칼바람 아수라장 · 증바람 모임</span>
          <h1>세 개 중에 뭘 고를지,<br />내 챔피언이 알려줍니다</h1>
          <p className="sub">챔피언을 고르면 프리즘·골드·실버별로 어울리는 증강과 그 이유를 보여드려요. 게임 중엔 뜬 증강 3개를 바로 비교하세요.</p>
          <ChampSearch onPick={(id) => nav(`/guide/${id}`)} />
          <div className="quick">{picks.map((c) => <Link key={c.id} to={`/guide/${c.id}`}><ChampImg id={c.id} size={28} />{c.name}</Link>)}</div>
        </div>
        <div className="art"><Refraction gem={128} /></div>
      </div></section>

      <section className="section tight"><div className="wrap">
        <div className="grid3">
          <Link to="/guide" className="feature"><img className="bg" alt="" src={art('카이사')} />
            <h3>챔피언별 증강 가이드</h3><p>{Object.keys(CHAMPIONS).length}명 챔피언마다 역할·피해 유형·스킬에 맞춘 증강을 등급별로.</p><span className="go">가이드 보기 <Icon name="arrow" /></span></Link>
          <Link to="/compare" className="feature"><img className="bg" alt="" src={art('이즈리얼')} />
            <h3>증강 3개 비교</h3><p>지금 뜬 증강 세 개를 고르면, 내 챔피언에게 맞는 순서대로. Alt+Tab 한 번이면 됩니다.</p><span className="go">비교하기 <Icon name="arrow" /></span></Link>
          <Link to="/augments" className="feature"><img className="bg" alt="" src={art('럭스')} />
            <h3>증강 도감</h3><p>아수라장 증강 {ACTIVE_AUGMENTS.length}개, 한국어 설명 그대로. 이름·효과·초성으로 찾기.</p><span className="go">도감 열기 <Icon name="arrow" /></span></Link>
        </div>
      </div></section>

      {APP_URL && <section className="section tight"><div className="wrap">
        <div className="card pad app-band">
          <div className="stack" style={{ gap: 8 }}>
            <span className="eyebrow">Windows 앱</span>
            <h2>게임 옆에 두는 Prism</h2>
            <p className="muted">챔프 선택에서는 우리 팀에 부족한 것과 대기석 추천을, 게임 중에는 Alt+Tab 한 번으로 내 챔피언 증강 비교를. 내 판은 알아서 기록됩니다.</p>
          </div>
          <a className="btn primary lg" href={APP_URL} target="_blank" rel="noopener noreferrer"><Icon name="out" />앱 받기</a>
        </div>
      </div></section>}

      <section className="section tight"><div className="wrap">
        <div className="cta-band">
          <Gem size={56} float src="/brand/prism-256.png" />
          <h2>매일 밤, 같이 증바람</h2>
          <p>Prism은 아수라장을 같이 하는 모임입니다. 회원이 되면 우리끼리의 실전 증강 승률, 기록, 같이 하면 이기는 사람이 열립니다.</p>
          <Channels links={links} size="lg" />
        </div>
      </div></section>
    </>
  );
}
