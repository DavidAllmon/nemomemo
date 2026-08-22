import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { NemoLogo, Wordmark } from '@/components/NemoLogo.js';
import { api, ApiError } from '@/lib/api.js';

/** Landing page for the links in verification emails: /auth/verify?token=… */
export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<'working' | 'done' | 'failed'>('working');
  const [message, setMessage] = useState('');
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    const token = searchParams.get('token') ?? '';
    api('POST', '/api/v1/auth/verify', { token })
      .then(() => setState('done'))
      .catch((error) => {
        setState('failed');
        setMessage(error instanceof ApiError ? error.message : 'Something went wrong under the sea');
      });
  }, [searchParams]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center">
        <div className="mb-4 flex flex-col items-center gap-2">
          <NemoLogo bob className="size-12" />
          <Wordmark className="text-xl" />
        </div>
        {state === 'working' ? (
          <p className="text-sm text-muted-foreground">Checking your link… 🫧</p>
        ) : state === 'done' ? (
          <>
            <h1 className="font-display text-lg font-bold">Email verified! 🐠</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Your account can always swim home now.
            </p>
            <Link to="/" className="mt-4 inline-block text-sm font-semibold text-ocean hover:underline">
              Back to the reef →
            </Link>
          </>
        ) : (
          <>
            <h1 className="font-display text-lg font-bold">That link swam away</h1>
            <p className="mt-1 text-sm text-muted-foreground">{message}</p>
            <Link to="/settings" className="mt-4 inline-block text-sm font-semibold text-ocean hover:underline">
              Request a fresh one in Settings →
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
