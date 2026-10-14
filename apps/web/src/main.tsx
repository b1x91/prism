import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import '@prism/ui/styles.css';
import './web.css';
import { Layout } from './layout';
import { SessionProvider } from './session';
import { Home } from './pages/Home';
import { Compare, Guide } from './pages/Guide';
import { Augments } from './pages/Augments';
import { Crew } from './pages/Crew';
import { MemberPage, RankingPage, ShopPage, PublicPage } from './pages/Members';
import { AuthDone } from './pages/AuthDone';
import { DexPage } from './pages/Dex';
import { Privacy } from './pages/Privacy';

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
            <Route path="me" element={<MemberPage />} />
            <Route path="members/:id" element={<MemberPage />} />
            <Route path="dex" element={<DexPage />} />
            <Route path="ranking" element={<RankingPage />} />
            <Route path="shop" element={<ShopPage />} />
            <Route path="p/:id" element={<PublicPage />} />
            <Route path="champions" element={<Guide />} />
            <Route path="champions/:id" element={<Guide />} />
            <Route path="auth/done" element={<AuthDone />} />
            <Route path="privacy" element={<Privacy />} />
            <Route path="*" element={<Home />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </SessionProvider>
  </StrictMode>,
);
