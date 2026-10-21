/**
 * 챔프 스킬 (v3.102): 기본 지속 효과 + Q·W·E·R. 챔프 상세 '스킬' 탭.
 * 데이터는 챔프마다 작은 파일(/skills/{id}.json, scripts/skills.ts)을 필요할 때만 받는다 — 앱은 설치 파일 안에 있다.
 */
import { useEffect, useState } from 'react';
import { cdragon } from '@prism/core';
import { Bone, Swap, fadeCls, imgIn, useReveal } from './skeleton';

type Spell = [key: string, name: string, icon: string, desc: string, cd: number[], cost: number[], range: number];
type Skills = { v: string; p: [name: string, icon: string, desc: string]; s: Spell[] };

const cache = new Map<number, Skills | null>();
const slash = (v: number[]) => v.join('/');

function useSkills(id: number) {
  const [data, setData] = useState<Skills | null | undefined>(() => cache.get(id));
  useEffect(() => {
    if (cache.has(id)) { setData(cache.get(id)); return; }
    setData(undefined);
    let live = true;
    fetch(`/skills/${id}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((d: Skills | null) => {
      cache.set(id, d);
      if (live) setData(d);
    });
    return () => { live = false; };
  }, [id]);
  return data;
}

function Row({ k, name, icon, desc, meta }: { k: string; name: string; icon: string; desc: string; meta?: string[] }) {
  return (
    <li className="csk-row">
      <span className="csk-ic"><img className="fi" {...imgIn} src={cdragon(icon)} alt="" width={48} height={48} loading="lazy" /><b className="csk-key">{k}</b></span>
      <div className="csk-txt">
        <div className="csk-h"><b>{name}</b>{meta?.length ? <span className="csk-meta">{meta.map((m) => <span key={m}>{m}</span>)}</span> : null}</div>
        <p>{desc}</p>
      </div>
    </li>
  );
}

function SkillsSkeleton() {
  return (
    <ul className="csk" aria-busy="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <li key={i} className="csk-row">
          <span className="csk-ic"><Bone w={48} h={48} r="m" /></span>
          <div className="csk-txt"><div className="csk-h"><Bone w={120} h={14} /><Bone w={140} h={12} /></div><Bone w="92%" h={12} /><Bone w="64%" h={12} /></div>
        </li>
      ))}
    </ul>
  );
}

export function ChampSkills({ championId }: { championId: number }) {
  const d = useSkills(championId);
  const rv = useReveal(d !== undefined);
  if (d === undefined) return <section className="card pad"><SkillsSkeleton /><p className="csk-foot"><Bone w={220} h={12} /></p></section>;
  if (!d) return <section className="card pad"><p className="meta" style={{ margin: 0 }}>스킬 정보를 불러오지 못했어요.</p></section>;
  return (
    <section className={`card pad ${fadeCls(rv)}`}>
      <Swap on={rv} skeleton={<SkillsSkeleton />}>
        <ul className="csk">
          <Row k="P" name={d.p[0]} icon={d.p[1]} desc={d.p[2]} meta={['기본 지속 효과']} />
          {d.s.map(([k, name, icon, desc, cd, cost, range]) => (
            <Row key={k} k={k} name={name} icon={icon} desc={desc}
              meta={[cd.length && cd.some((x) => x > 0) ? `재사용 ${slash(cd)}초` : '', cost.length ? `소모 ${slash(cost)}` : '', range > 0 && range < 25000 ? `사거리 ${range}` : ''].filter(Boolean)} />
          ))}
        </ul>
      </Swap>
      <p className="csk-foot">게임 데이터 {d.v.split('.').slice(0, 2).join('.')} · 수치는 스킬 레벨 순서 (궁극기는 3단계)</p>
    </section>
  );
}
