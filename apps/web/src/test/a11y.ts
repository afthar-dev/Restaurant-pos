import { expect } from 'vitest';
import { axe } from 'vitest-axe';

/**
 * Runs axe on what is on screen and fails with a readable list of rule ids and elements.
 * Colour contrast needs a real browser, so it is switched off here; check it in the app.
 */
export async function expectNoAxeViolations(container: Element = document.body) {
  const results = await axe(container, { rules: { 'color-contrast': { enabled: false } } });
  const found = results.violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
  );
  expect(found).toEqual([]);
}
