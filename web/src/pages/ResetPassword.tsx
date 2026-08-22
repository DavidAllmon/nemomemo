import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { NemoLogo, Wordmark } from '@/components/NemoLogo.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/misc.js';
import { api, ApiError } from '@/lib/api.js';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6">
        <div className="mb-5 flex flex-col items-center gap-2">
          <NemoLogo bob className="size-12" />
          <Wordmark className="text-xl" />
        </div>
        {children}
      </div>
    </div>
  );
}

/** Ask for a reset link. Always answers the same way — no account enumeration. */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    try {
      await api('POST', '/api/v1/auth/forgot', { email });
    } catch {
      // Same message either way — the answer lives in the inbox.
    } finally {
      setSent(true);
      setPending(false);
    }
  };

  return (
    <Shell>
      {sent ? (
        <>
          <h1 className="text-center font-display text-lg font-bold">Check your inbox 📨</h1>
          <p className="mt-1 text-center text-sm text-muted-foreground">
            If that address belongs to an account here, a reset link is swimming its way over.
            It works for one hour.
          </p>
          <p className="mt-4 text-center">
            <Link to="/auth" className="text-sm font-semibold text-ocean hover:underline">
              Back to sign in →
            </Link>
          </p>
        </>
      ) : (
        <form className="flex flex-col gap-3" onSubmit={(event) => void submit(event)}>
          <h1 className="text-center font-display text-lg font-bold">Forgot your password?</h1>
          <label className="text-sm font-semibold" htmlFor="email">
            Your account email
          </label>
          <Input
            id="email"
            type="email"
            autoFocus
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Button type="submit" disabled={pending || !email}>
            {pending ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>
      )}
    </Shell>
  );
}

/** Landing page for reset AND invite links: /auth/reset?token=…[&invite=1] */
export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const invite = searchParams.get('invite') === '1';
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api('POST', '/api/v1/auth/reset', { token: searchParams.get('token') ?? '', password });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong under the sea');
    } finally {
      setPending(false);
    }
  };

  return (
    <Shell>
      {done ? (
        <>
          <h1 className="text-center font-display text-lg font-bold">
            {invite ? 'Welcome aboard! 🐠' : 'Password set! 🐠'}
          </h1>
          <p className="mt-1 text-center text-sm text-muted-foreground">
            Sign in with your new password and just keep swimming.
          </p>
          <p className="mt-4 text-center">
            <Link to="/auth" className="text-sm font-semibold text-ocean hover:underline">
              Sign in →
            </Link>
          </p>
        </>
      ) : (
        <form className="flex flex-col gap-3" onSubmit={(event) => void submit(event)}>
          <h1 className="text-center font-display text-lg font-bold">
            {invite ? 'Pick your password' : 'Choose a new password'}
          </h1>
          {invite ? (
            <p className="text-center text-sm text-muted-foreground">
              Your spot on the reef is ready — set a password to claim it.
            </p>
          ) : null}
          <label className="text-sm font-semibold" htmlFor="password">
            New password (8+ characters)
          </label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            autoFocus
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
          <Button type="submit" disabled={pending || password.length < 8}>
            {pending ? 'Setting…' : invite ? 'Dive in' : 'Set password'}
          </Button>
        </form>
      )}
    </Shell>
  );
}
