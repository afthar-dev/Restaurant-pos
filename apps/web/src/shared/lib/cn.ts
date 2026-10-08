import { extendTailwindMerge } from 'tailwind-merge';

// Our own theme names, so a later class wins over the kit's default (e.g. `w-24` over `w-full`).
const merge = extendTailwindMerge({
  extend: { theme: { shadow: ['card', 'overlay'] } },
});

/**
 * Joins class names, skipping false, null and undefined. When two classes set the same thing,
 * the later one wins, so a screen can override a kit default with `className`.
 */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return merge(classes.filter(Boolean).join(' '));
}
