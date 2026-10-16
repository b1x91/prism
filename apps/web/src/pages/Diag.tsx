/**
 * 관리자: 앱 자동 진단 (CLAUDE.md v3.64·v3.66). 게임 위 작은 창이 한 판 내내 안 뜬 판, 증강을 세 칸 다 못 채운 판의 인식 기록.
 * 모니터 수·게임 화면 위치·배율·실패 이유·읽은 글자 몇 줄 (화면 그림은 없다).
 */
import { useEffect, useState } from 'react';
import { Empty, RowsSkeleton } from '@prism/ui';
import { useSession } from '../session';

type Item = { id: number; member: string; nick: string | null; at: number; body: any };

export function DiagPage() {
  const { me, ready, api } = useSession();
  const [items, setItems] = useState<Item[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!me || me.tier !== 'admin') return;
    api.get<{ items: Item[] }>('/api/admin/diag').then((r) => setItems(r.items)).catch((e) => setErr(String(e?.message ?? e)));
  }, [me, api]);
  if (!ready) return <section className="section tight"><div className="wrap"><RowsSkeleton n={4} /></div></section>;
  if (!me || me.tier !== 'admin') return <section className="section"><div className="wrap"><Empty>관리자만 볼 수 있어요.</Empty></div></section>;
  return (
    <section className="section tight"><div className="wrap stack" style={{ gap: 16 }}>
      <div><h1 className="h1">작은 창 진단</h1><p className="muted" style={{ margin: 0 }}>작은 창이 한 판 내내 안 뜬 판, 증강을 세 칸 다 못 채운 판이 자동으로 올라와요. 최근 100개.</p></div>
      {err && <p className="l">{err}</p>}
      {!items ? <RowsSkeleton n={4} /> : !items.length ? <Empty>아직 올라온 기록이 없어요.</Empty> : items.map((x) => {
        const d = x.body?.diag ?? {};
        const stages = Object.entries(d.stages ?? {}).map(([k, n]) => `${k} ${n}`).join(' · ');
        return (
          <article key={x.id} className="card pad stack" style={{ gap: 8 }}>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <b>{x.nick ?? x.member}</b><span className="pill">{x.body?.kind === 'partial' ? `세 칸 못 채움 ${d.partial}/${d.offers}` : '작은 창 안 뜸'}</span><span className="meta">{new Date(x.at).toLocaleString('ko-KR')}</span>
              <span className="pill">v{x.body?.version}</span><span className="pill">모니터 {d.monitors}</span><span className="pill">배율 {d.scale}</span>
              <span className="pill">인식기 {x.body?.engine}</span><span className="pill">위치 {x.body?.position === 'top' ? '위' : '오른쪽'}</span>
            </div>
            <div className="meta">게임 화면 {(d.game_rect ?? []).join(', ')} · 읽는 곳 {(d.region ?? []).join(', ')} · 찾은 방법 {d.how}</div>
            <div className="meta">맨앞 {d.front} / 뒤 {d.not_front} · 복사 실패 {d.capture_fails} · 인식 오류 {d.ocr_errors} · 최대 찾은 수 {d.max_hits} · 다시 올림 {d.raised} · 그림으로 찾음 {d.by_icon ?? 0}</div>
            <div className="meta">단계: {stages}</div>
            {(d.partial_trace ?? []).map((t: string[], i: number) => (
              <details key={i}><summary className="meta">세 칸 못 채운 고르기 {i + 1}</summary>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, margin: 0 }}>{t.join('\n')}</pre>
              </details>
            ))}
            <details><summary className="meta">기록 {(x.body?.trace ?? []).length}줄 · 마지막 글자</summary>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, margin: 0 }}>{[...(x.body?.trace ?? []), '— 마지막으로 읽은 글자 —', x.body?.lastText ?? ''].join('\n')}</pre>
            </details>
          </article>
        );
      })}
    </div></section>
  );
}
