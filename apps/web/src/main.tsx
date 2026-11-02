import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import '@prism/ui/styles.css';
import './web.css';
import { restoreTheme } from '@prism/ui';
import { Layout } from './layout';
import { SessionProvider } from './session';
import { Home } from './pages/Home';
import { Compare, Guide } from './pages/Guide';
import { Augments } from './pages/Augments';
import { Crew, InviteTab } from './pages/Crew';
import { MemberPage, MissionsPage, RankingPage, ShopPage, PublicPage } from './pages/Members';
import { AuthDone } from './pages/AuthDone';
import { DexPage } from './pages/Dex';
import { DiagPage } from './pages/Diag';
import { Privacy } from './pages/Privacy';
import { StaffJoinPage, StaffMembersPage, StaffPage } from './pages/Staff';
import { ApplyPage, InvitePage } from './pages/Join';
import { NewsPage } from './pages/News';
import { InquiryPage } from './pages/Inquiry';

// 브라우저 막대 색을 지금 테마 바탕색과 맞추고, 시스템 테마가 바뀌면 따라간다
restoreTheme();
// 맨 위에서 벗어나면 html.scrolled — 터치 기기 상단 바의 아래 선을 이때만 보인다
{
  const mark = () => document.documentElement.classList.toggle('scrolled', window.scrollY > 4);
  window.addEventListener('scroll', mark, { passive: true }); mark();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessionProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="guide" element={<Guide />} />
            <Route path="guide/:id" element={<Guide />} />
            <Route path="compare" element={<Compare />} />
            <Route path="compare/:id" element={<Compare />} />
            <Route path="augments" element={<Augments />} />
            <Route path="augments/:id" element={<Augments />} />
            <Route path="crew" element={<Crew />} />
            <Route path="invite" element={<InviteTab />} />
            <Route path="me" element={<MemberPage />} />
            <Route path="members/:id" element={<MemberPage />} />
            <Route path="dex" element={<DexPage />} />
            <Route path="ranking" element={<RankingPage />} />
            <Route path="shop" element={<ShopPage />} />
            <Route path="missions" element={<MissionsPage />} />
            <Route path="p/:id" element={<PublicPage />} />
            <Route path="champions" element={<Guide />} />
            <Route path="champions/:id" element={<Guide />} />
            <Route path="auth/done" element={<AuthDone />} />
            <Route path="privacy" element={<Privacy />} />
            <Route path="admin/diag" element={<DiagPage />} />
            <Route path="news" element={<NewsPage />} />
            <Route path="inquiry" element={<InquiryPage />} />
            <Route path="staff" element={<StaffPage />} />
            <Route path="staff/members" element={<StaffMembersPage />} />
            <Route path="staff/join" element={<StaffJoinPage />} />
            <Route path="i/:code" element={<InvitePage />} />
            <Route path="apply" element={<ApplyPage />} />
            <Route path="*" element={<Home />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </SessionProvider>
  </StrictMode>,
);

// 인터넷 없이 열었을 때 브라우저 오류 화면 대신 Prism 연결 안내를 보이는 서비스 워커 (배포판만, v3.122)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}
