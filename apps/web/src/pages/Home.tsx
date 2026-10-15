import { useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ACTIVE_AUGMENTS, CHAMPIONS, CHAMPION_LIST, cdragon } from '@prism/core';
import { ChampImg, ChampSearch, ChannelButtons, Gem, Icon, LightRefraction } from '@prism/ui';
import { APP_URL, useSession } from '../session';

const QUICK = ['아리', '징크스', '가렌', '럭스', '야스오', '말파이트', '세라핀', '이즈리얼'];
const art = (name: string) => cdragon(CHAMPION_LIST.find((c) => c.name === name)?.splash ?? null);

export function Home() {
  const nav = useNavigate();
  const { links } = useSession();
  const hero = useRef<HTMLElement>(null), search = useRef<HTMLDivElement>(null), gem = useRef<HTMLDivElement>(null);
  const picks = QUICK.map((n) => CHAMPION_LIST.find((c) => c.name === n)).filter(Boolean) as typeof CHAMPION_LIST;
  return (
    <>
      <section className="hero" ref={hero}><LightRefraction box={hero} anchor={search} gem={gem} /><div className="wrap">
        <div>
          <span className="eyebrow"><Gem size={16} src="/brand/prism-32.png" />칼바람 아수라장 · 증바람 모임</span>
          <h1>세 개 중에 뭘 고를지,<br />내 챔프가 알려줍니다</h1>
          <p className="sub">챔프를 고르면 프리즘·골드·실버별로 어울리는 증강과 그 이유를 보여드려요. 게임 중엔 뜬 증강 3개를 바로 비교하세요.</p>
          <div ref={search} className="lit"><ChampSearch onPick={(id) => nav(`/champions/${id}`)} /></div>
          <div className="quick">{picks.map((c) => <Link key={c.id} to={`/champions/${c.id}`}><ChampImg id={c.id} size={28} />{c.name}</Link>)}</div>
        </div>
        <div className="art"><div className="gem-stage" ref={gem}><Gem size={168} float src="/brand/prism-256.png" /></div></div>
      </div></section>

      <section className="section tight"><div className="wrap">
        <div className="grid3">
          <Link to="/champions" className="feature"><img className="bg" alt="" src={art('카이사')} />
            <h3>챔프별 증강 가이드</h3><p>{Object.keys(CHAMPIONS).length} 챔프마다 역할·피해 유형·스킬에 맞춘 증강을 등급별로.</p><span className="go">가이드 보기 <Icon name="arrow" /></span></Link>
          <Link to="/compare" className="feature"><img className="bg" alt="" src={art('이즈리얼')} />
            <h3>증강 3개 비교</h3><p>지금 뜬 증강 세 개를 고르면, 내 챔프에게 맞는 순서대로. Alt+Tab 한 번이면 됩니다.</p><span className="go">비교하기 <Icon name="arrow" /></span></Link>
          <Link to="/augments" className="feature"><img className="bg" alt="" src={art('럭스')} />
            <h3>증강 도감</h3><p>아수라장 증강 {ACTIVE_AUGMENTS.length}개, 한국어 설명 그대로. 이름·효과·초성으로 찾기.</p><span className="go">도감 열기 <Icon name="arrow" /></span></Link>
        </div>
      </div></section>

      {APP_URL && <section className="section tight"><div className="wrap">
        <div className="app-band">
          <div className="app-copy">
            <span className="eyebrow"><Icon name="windows" />Windows 앱</span>
            <h2>게임 옆에 두는 Prism</h2>
            <ul className="app-points">
              <li><b>챔프 선택</b>우리 팀에 부족한 것과 대기석 추천</li>
              <li><b>게임 중</b>뜬 증강을 알아보고 내 챔프 기준으로 순위·티어</li>
              <li><b>게임 뒤</b>내 판은 알아서 기록</li>
            </ul>
          </div>
          <div className="app-get">
            <a className="dl-btn" href={APP_URL} target="_blank" rel="noopener noreferrer">
              <Icon name="windows" />
              <span><b>Windows용 받기</b><small>무료 · Windows 10/11</small></span>
              <Icon name="download" className="icon dl-arrow" />
            </a>
            <p className="dl-note">처음 실행할 때 "Windows의 PC 보호" 창이 뜨면 <b>추가 정보 → 실행</b>을 눌러주세요. 작은 모임 앱이라 아직 Microsoft 인증을 받지 않았어요.</p>
          </div>
        </div>
      </div></section>}

      <section className="section tight"><div className="wrap">
        <div className="cta-band">
          <Gem size={56} float src="/brand/prism-256.png" />
          <h2>매일 밤, 같이 증바람</h2>
          <p>Prism은 아수라장을 같이 하는 모임입니다. 회원이 되면 우리끼리의 실전 증강 승률, 기록, 같이 하면 이기는 사람이 열립니다.</p>
          <div className="ch-brand"><ChannelButtons links={links} /></div>
        </div>
      </div></section>
    </>
  );
}
