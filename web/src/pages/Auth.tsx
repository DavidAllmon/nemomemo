import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { NemoLogo, Wordmark } from '@/components/NemoLogo.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/misc.js';
import { keys, useInstanceProfile } from '@/hooks/queries.js';
import { api, ApiError } from '@/lib/api.js';

export function AuthPage({ mode }: { mode: 'signin' | 'signup' }) {
  const { data: profile } = useInstanceProfile();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const needsSetup = profile?.needsSetup ?? false;
  const effectiveMode = needsSetup ? 'signup' : mode;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const { user } = await api<{ user: unknown }>('POST', `/api/v1/auth/${effectiveMode}`, {
        username,
        password,
      });
      queryClient.setQueryData(keys.viewer, user);
      await queryClient.invalidateQueries({ queryKey: keys.instance });
      // Only follow same-origin relative paths — never an absolute/protocol URL.
      const redirect = searchParams.get('redirect');
      navigate(redirect && redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong under the sea');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6">
        <div className="mb-5 flex flex-col items-center gap-2">
          <NemoLogo bob className="size-12" />
          <Wordmark className="text-xl" />
          <h1 className="font-display text-lg font-bold">
            {needsSetup ? 'Set up your reef' : effectiveMode === 'signup' ? 'Join the reef' : 'Welcome back'}
          </h1>
          {needsSetup ? (
            <p className="text-center text-sm text-muted-foreground">
              Create the first account — it becomes the reef keeper (admin).
            </p>
          ) : null}
        </div>
        <form className="flex flex-col gap-3" onSubmit={(event) => void submit(event)}>
          <label className="text-sm font-semibold" htmlFor="username">
            Username
          </label>
          <Input
            id="username"
            autoFocus
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
          <label className="text-sm font-semibold" htmlFor="password">
            Password
          </label>
          <Input
            id="password"
            type="password"
            autoComplete={effectiveMode === 'signup' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
          <Button type="submit" disabled={pending || !username || !password}>
            {pending
              ? 'Diving in…'
              : needsSetup
                ? 'Create the reef'
                : effectiveMode === 'signup'
                  ? 'Sign up'
                  : 'Sign in'}
          </Button>
        </form>
        {!needsSetup ? (
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {effectiveMode === 'signin' ? (
              profile?.allowRegistration ? (
                <>
                  New here?{' '}
                  <Link to="/auth/signup" className="text-ocean underline">
                    Create an account
                  </Link>
                </>
              ) : (
                'Sign-ups are closed on this reef.'
              )
            ) : (
              <>
                Already have an account?{' '}
                <Link to="/auth" className="text-ocean underline">
                  Sign in
                </Link>
              </>
            )}
          </p>
        ) : null}
      </div>
      <Link to="/explore" className="text-sm text-muted-foreground hover:text-foreground">
        🧭 Explore public memos on this reef
      </Link>
    </div>
  );
}
