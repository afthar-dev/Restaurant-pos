import {
  forwardRef,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/shared/lib/cn';
import { inputClass } from './styles';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cn(inputClass, 'w-full', className)} {...rest} />;
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...rest }, ref) {
  return (
    <textarea ref={ref} className={cn(inputClass, 'w-full', 'min-h-24', className)} {...rest} />
  );
});

/** A native select (best on phones and touch screens), styled like the inputs. */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, ...rest }, ref) {
    return <select ref={ref} className={cn(inputClass, 'w-full', 'pr-8', className)} {...rest} />;
  },
);

/** An amount in rupees: "₹" in front, decimal keypad on phones. */
export const MoneyInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function MoneyInput({ className, ...rest }, ref) {
    return (
      <div className="relative">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted"
        >
          ₹
        </span>
        <input
          ref={ref}
          inputMode="decimal"
          className={cn(inputClass, 'w-full', 'pl-7 tabular-nums', className)}
          {...rest}
        />
      </div>
    );
  },
);

/** A quantity with its unit after it ("kg", "L"), decimal keypad on phones. */
export const QuantityInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { unit?: string }
>(function QuantityInput({ className, unit, ...rest }, ref) {
  return (
    <div className="relative">
      <input
        ref={ref}
        inputMode="decimal"
        className={cn(inputClass, 'w-full', unit && 'pr-12', 'tabular-nums', className)}
        {...rest}
      />
      {unit && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted"
        >
          {unit}
        </span>
      )}
    </div>
  );
});
