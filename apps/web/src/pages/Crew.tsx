import { useNavigate } from 'react-router-dom';
import { BoardView, Channels, Gem, Icon, Notes, PartyBoard, ProspectBoard, ScrimBoard } from '@prism/ui';
import { useSession } from '../session';

function Intro() {
  const { login, links } = useSession();
  const sk = (n: number) => <div className="sk">{Array.from({ length: n }, (_, i) => <i key={i} style={{ width: `${90 - ((i * 17) % 45)}%` }} />)}</div>;
  return (
    <>
      <section className="hero"><div className="wrap" style={{ gridTemplateColumns: 'minmax(0,1fr)', textAlign: 'center', justifyItems: 'center' }}>
        <Gem size={72} float src="/brand/prism-256.png" />
        <h1 style={{ marginTop: 24 }}>매일 밤, 같이 증바람</h1>
        <p className="sub" style={{ margin: '20px auto 32px' }}>Prism은 칼바람 아수라장을 같이 하는 모임입니다. 게임보다 사람이 먼저인 곳. 아는 분의 추천으로 들어올 수 있어요.</p>
        <div className="row wrapr" style={{ justifyContent: 'center' }}>
          <Channels links={links} size="lg" />
          <button type="button" className="btn lg" onClick={login}><Icon name="login" />회원 로그인</button>
        </div>
      </div></section>
      <section className="section tight"><div className="wrap">
        <h2 className="h">들어오는 길</h2><p className="lead">세 단계면 됩니다.</p>
        <div className="grid3 steps">
          <div className="card pad"><h3>디스코드에 들어오기</h3><p>아는 회원에게 초대를 부탁하거나, 위 버튼으로 들어와 인사를 남겨주세요.</p></div>
          <div className="card pad"><h3>여기서 로그인</h3><p>디스코드 계정으로 로그인하면 모임 공간이 열립니다. 휴대폰에서도 돼요.</p></div>
          <div className="card pad"><h3>(선택) Prism 앱</h3><p>PC에 켜두면 챔프 선택 때 팀 구성과 어울리는 증강을 띄워주고, 내 판이 자동으로 기록됩니다.</p></div>
        </div>
      </div></section>
      <section className="section tight"><div className="wrap">
        <h2 className="h">회원에게 열리는 것</h2><p className="lead">기록은 회원에게만 보입니다.</p>
        <div className="grid3">
          {[['실전 증강 승률', '우리가 실제로 고른 증강이 얼마나 이겼는지'], ['같이 하면 이기는 사람', '모임 판에서 승률이 높은 조합'], ['모임 기록과 한 줄 생각', '최다 킬, 가장 긴 판, 이달 최다 출전, 그리고 오늘의 한 줄']].map(([t, d]) => (
            <div key={t} className="card pad locked"><div className="blur"><h3 style={{ margin: '0 0 16px' }}>{t}</h3>{sk(5)}</div>
              <div className="over"><div><Icon name="lock" style={{ width: 20, height: 20, color: 'var(--text-3)' }} /><div style={{ fontWeight: 750, fontSize: 16, marginTop: 8 }}>{t}</div><div className="meta" style={{ marginTop: 4 }}>{d}</div></div></div></div>
          ))}
        </div>
      </div></section>
    </>
  );
}

export function Crew() {
  const { me, ready, api, links } = useSession();
  const nav = useNavigate();
  if (!ready) return null;
  if (!me) return <Intro />;
  return (
    <section className="section tight"><div className="wrap stack" style={{ gap: 24 }}>
      <div className="page-head"><div><h1>Prism</h1><p>{me.nick}님, 오늘 밤도 한 판.</p></div><span className="sp" /><Channels links={links} /></div>
      <PartyBoard api={api} onMember={(id) => nav(`/members/${id}`)} />
      <ScrimBoard api={api} onMember={(id) => nav(`/members/${id}`)} />
      {me.perms?.prospects !== false && <ProspectBoard api={api} invite={links.discord} admin={Boolean(me.perms?.moderate)} />}
      <Notes api={api} />
      <BoardView api={api} />
    </div></section>
  );
}
