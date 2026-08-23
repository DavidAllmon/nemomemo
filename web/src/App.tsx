import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Suspense, lazy, type ReactNode } from 'react';
import { LoadingState } from '@/components/EmptyState.js';
import { AppShell } from '@/components/layout/AppShell.js';
import { useInstanceProfile, useViewer } from '@/hooks/queries.js';

// Route-level code splitting: each page loads on first visit, keeping the
// initial bundle to the shell. The heavy editor/highlighter chunks split
// separately (see components/editor/lazy.tsx and MemoContent).
const AboutPage = lazy(() => import('@/pages/About.js').then((m) => ({ default: m.AboutPage })));
const ArchivedPage = lazy(() => import('@/pages/Archived.js').then((m) => ({ default: m.ArchivedPage })));
const AttachmentsPage = lazy(() => import('@/pages/Attachments.js').then((m) => ({ default: m.AttachmentsPage })));
const AuthPage = lazy(() => import('@/pages/Auth.js').then((m) => ({ default: m.AuthPage })));
const DoryMemoryPage = lazy(() => import('@/pages/DoryMemory.js').then((m) => ({ default: m.DoryMemoryPage })));
const ExplorePage = lazy(() => import('@/pages/Explore.js').then((m) => ({ default: m.ExplorePage })));
const HomePage = lazy(() => import('@/pages/Home.js').then((m) => ({ default: m.HomePage })));
const InboxPage = lazy(() => import('@/pages/Inbox.js').then((m) => ({ default: m.InboxPage })));
const MemoDetailPage = lazy(() => import('@/pages/MemoDetail.js').then((m) => ({ default: m.MemoDetailPage })));
const NotFoundPage = lazy(() => import('@/pages/NotFound.js').then((m) => ({ default: m.NotFoundPage })));
const ProfilePage = lazy(() => import('@/pages/Profile.js').then((m) => ({ default: m.ProfilePage })));
const SettingsPage = lazy(() => import('@/pages/Settings.js').then((m) => ({ default: m.SettingsPage })));
const SharePage = lazy(() => import('@/pages/Share.js').then((m) => ({ default: m.SharePage })));
const TasksPage = lazy(() => import('@/pages/Tasks.js').then((m) => ({ default: m.TasksPage })));
const VerifyEmailPage = lazy(() => import('@/pages/VerifyEmail.js').then((m) => ({ default: m.VerifyEmailPage })));
const ForgotPasswordPage = lazy(() => import('@/pages/ResetPassword.js').then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import('@/pages/ResetPassword.js').then((m) => ({ default: m.ResetPasswordPage })));
const ViewsPage = lazy(() => import('@/pages/Views.js').then((m) => ({ default: m.ViewsPage })));

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
    <Suspense fallback={<LoadingState />}>
      <Routes>
      <Route path="/auth" element={<AuthPage mode="signin" />} />
      <Route path="/auth/signup" element={<AuthPage mode="signup" />} />
      <Route path="/memos/shares/:token" element={<SharePage />} />
      <Route path="/auth/verify" element={<VerifyEmailPage />} />
      <Route path="/auth/forgot" element={<ForgotPasswordPage />} />
      <Route path="/auth/reset" element={<ResetPasswordPage />} />
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
          path="/dory"
          element={
            <RequireAuth>
              <DoryMemoryPage />
            </RequireAuth>
          }
        />
        <Route
          path="/tasks"
          element={
            <RequireAuth>
              <TasksPage />
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
    </Suspense>
  );
}
