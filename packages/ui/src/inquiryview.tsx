/**
 * 문의 메뉴 (CLAUDE.md v3.137 → v3.160). 회원: 문의 쓰기 + 내 문의.
 * 운영진의 작업 목록은 운영 › 문의(staffinq.tsx)로 옮겼다.
 */
import { useEffect, useState } from 'react';
import type { Api, Inquiry } from '@prism/core';
import { useLoad } from './crew';
import { InquiryForm, MyInquiries, type InquiryExtra } from './inquiry';

export function InquiryView({ api, extra }: { api: Api; extra?: () => Promise<InquiryExtra>; /** 예전 '작업 목록' 탭 — 운영 › 문의로 옮겨 쓰지 않는다 (v3.160) */ canManage?: boolean }) {
  const mine = useLoad<{ items: Inquiry[] }>(api, '/api/me/inquiry');
  const [items, setItems] = useState<Inquiry[] | null>(null);
  useEffect(() => { if (mine.data) setItems(mine.data.items); }, [mine.data]);
  return (
    <div className="stack inq-page" style={{ gap: 16 }}>
      <header className="inq-head">
        <h1>문의</h1>
      </header>
      <section className="card pad inq-card">
          <div className="card-head"><h2>문의하기</h2><span className="sp" /><span className="meta">운영진에게 바로 전달되고, 답장은 디스코드 DM으로 와요</span></div>
          <InquiryForm api={api} extra={extra} onSent={setItems} />
        </section>
        <section className="card pad inq-card">
          <div className="card-head"><h2>내 문의</h2></div>
          <MyInquiries items={items} api={api} />
        </section>
    </div>
  );
}
