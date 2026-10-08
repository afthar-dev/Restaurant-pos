import { loginSchema } from '@rpos/shared';
import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { LockKeyhole } from 'lucide-react';
import { ApiError } from '@/shared/api/http';
import { Button, Field, Input } from '@/shared/ui';
import { AuthCard, AuthError } from '../components/AuthCard';
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
    <AuthCard
      icon={<LockKeyhole />}
      title="Sign in"
      description="Owners and managers sign in with their mobile number."
      footer={
        <Link to="/pin" className="font-medium text-primary-800 underline-offset-4 hover:underline">
          Staff PIN sign in
        </Link>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        <Field id="login-phone" label="Mobile number">
          <Input
            id="login-phone"
            inputMode="numeric"
            autoComplete="username"
            placeholder="10-digit mobile number"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>
        <Field id="login-password" label="Password">
          <Input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {error && <AuthError>{error}</AuthError>}
        <Button type="submit" size="lg" loading={signIn.isPending}>
          Sign in
        </Button>
      </form>
    </AuthCard>
  );
}
