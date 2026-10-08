import { Slot } from '@radix-ui/react-slot';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { Spinner } from './Spinner';
import { buttonClass, type ButtonSize, type ButtonVariant } from './styles';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, keeps the label (and width) and blocks clicks. */
  loading?: boolean;
  /** An icon before the label. */
  icon?: ReactNode;
  /** Render the child (e.g. a router Link) with button styles instead of a <button>. */
  asChild?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  asChild = false,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = cn(buttonClass(variant, size), className);
  if (asChild) {
    return (
      <Slot className={classes} {...rest}>
        {children}
      </Slot>
    );
  }
  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

/** A square button with only an icon. The label is required: screen readers read it. */
export function IconButton({
  label,
  icon,
  variant = 'ghost',
  size = 'md',
  className,
  ...rest
}: Omit<ButtonProps, 'children' | 'asChild'> & { label: string; icon: ReactNode }) {
  const square = { sm: 'size-9 px-0', md: 'size-11 px-0', lg: 'size-13 px-0' }[size];
  return (
    <Button
      variant={variant}
      size={size}
      aria-label={label}
      title={label}
      className={cn(square, className)}
      icon={icon}
      {...rest}
    />
  );
}
