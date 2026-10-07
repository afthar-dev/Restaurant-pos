import { loginSchema } from '@rpos/shared';
import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { ApiError } from '@/shared/api/http';
import { usePasswordSignIn } from '../mutations';

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
  const [invalid, setInvalid] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const signIn = usePasswordSignIn(() => void navigate(from, { replace: true }));
  const error =
    invalid ??
    (signIn.isError ? signInErrorMessage(signIn.error, 'Wrong phone number or password.') : null);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = loginSchema.safeParse({ phone: phone.trim(), password });
    if (!parsed.success) {
      setInvalid(parsed.error.issues[0]?.message ?? 'Check the form.');
      return;
    }
    setInvalid(null);
    signIn.mutate(parsed.data);
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
          disabled={signIn.isPending}
          className="rounded-md bg-primary-700 px-4 py-2 font-medium text-white disabled:opacity-60"
        >
          Sign in
        </button>
      </form>
      <Link to="/pin" className="text-sm text-primary-800 underline">
        Staff PIN sign in
      </Link>
    </section>
  );
}
