import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { LoadingState } from '@/components/EmptyState.js';
import { AppShell } from '@/components/layout/AppShell.js';
import { useInstanceProfile, useViewer } from '@/hooks/queries.js';
import { AboutPage } from '@/pages/About.js';
import { ArchivedPage } from '@/pages/Archived.js';
import { AttachmentsPage } from '@/pages/Attachments.js';
import { AuthPage } from '@/pages/Auth.js';
import { ExplorePage } from '@/pages/Explore.js';
import { HomePage } from '@/pages/Home.js';
import { InboxPage } from '@/pages/Inbox.js';
import { MemoDetailPage } from '@/pages/MemoDetail.js';
import { NotFoundPage } from '@/pages/NotFound.js';
import { ProfilePage } from '@/pages/Profile.js';
import { SettingsPage } from '@/pages/Settings.js';
import { SharePage } from '@/pages/Share.js';
import { ViewsPage } from '@/pages/Views.js';

function RequireAuth({ children }: { children: ReactNode }) {
  const { data: viewer, isLoading } = useViewer();
  const location = useLocation();
  if (isLoading) return <LoadingState />;
  if (!viewer) {
    return <Navigate to={`/auth?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }
  return <>{children}</>;
}

export function App() {
  const { data: profile } = useInstanceProfile();

  return (
    <Routes>
      <Route path="/auth" element={<AuthPage mode="signin" />} />
      <Route path="/auth/signup" element={<AuthPage mode="signup" />} />
      <Route path="/memos/shares/:token" element={<SharePage />} />
      <Route element={<AppShell />}>
        <Route
          path="/"
          element={
            <RequireAuth>
              <HomePage />
            </RequireAuth>
          }
        />
        <Route path="/home" element={<Navigate to="/" replace />} />
        <Route path="/explore" element={<ExplorePage />} />
        <Route path="/u/:username" element={<ProfilePage />} />
        <Route
          path="/archived"
          element={
            <RequireAuth>
              <ArchivedPage />
            </RequireAuth>
          }
        />
        <Route
          path="/views"
          element={
            <RequireAuth>
              <ViewsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/attachments"
          element={
            <RequireAuth>
              <AttachmentsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/inbox"
          element={
            <RequireAuth>
              <InboxPage />
            </RequireAuth>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireAuth>
              <SettingsPage />
            </RequireAuth>
          }
        />
        <Route path="/about" element={<AboutPage version={profile?.version} />} />
        <Route path="/memos/:uid" element={<MemoDetailPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
