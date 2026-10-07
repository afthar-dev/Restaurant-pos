import { loginSchema } from '@rpos/shared';
import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { apiFetch, ApiError } from '@/shared/api/http';
import { useSession, type SessionBody } from '@/shared/session/store';

export function signInErrorMessage(error: unknown, wrongSecret: string): string {
  if (error instanceof ApiError) {
    if (error.code === 'INVALID_CREDENTIALS') return wrongSecret;
    if (error.code === 'LOCKED') {
      const seconds = Number(error.body.retryAfterSeconds ?? 900);
      return `Too many attempts. Try again in ${Math.ceil(seconds / 60)} minutes.`;
    }
    if (error.status === 429)
      return 'Too many attempts from this device. Wait a minute and try again.';
    if (error.code === 'DEVICE_NOT_REGISTERED') {
      return 'This device is not registered. Ask a manager to sign in and register it.';
    }
  }
  return 'Could not sign in. Check the connection and try again.';
}

export function LoginPage() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const setSession = useSession((s) => s.setSession);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = loginSchema.safeParse({ phone: phone.trim(), password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the form.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const body = await apiFetch<SessionBody>('/api/auth/login', {
        method: 'POST',
        body: parsed.data,
        skipRefresh: true,
      });
      setSession(body);
      void navigate(from, { replace: true });
    } catch (err) {
      setError(signInErrorMessage(err, 'Wrong phone number or password.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mx-auto flex max-w-sm flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="text-sm text-slate-600">
          Owners and managers sign in with their mobile number.
        </p>
      </div>
      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="login-phone">
          Mobile number
          <input
            id="login-phone"
            className="rounded-md border border-slate-300 px-3 py-2 text-base"
            inputMode="numeric"
            autoComplete="username"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="login-password">
          Password
          <input
            id="login-password"
            className="rounded-md border border-slate-300 px-3 py-2 text-base"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-emerald-700 px-4 py-2 font-medium text-white disabled:opacity-60"
        >
          Sign in
        </button>
      </form>
      <Link to="/pin" className="text-sm text-emerald-800 underline">
        Staff PIN sign in
      </Link>
    </section>
  );
}
