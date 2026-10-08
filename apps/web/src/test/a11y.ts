import { expect } from 'vitest';
import { axe } from 'vitest-axe';

/**
 * Runs axe on what is on screen and fails with a readable list of rule ids and elements.
 * Colour contrast cannot be measured in jsdom, so axe leaves it out on its own.
 */
export async function expectNoAxeViolations(container: Element = document.body) {
  const results = await axe(container);
  const found = results.violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
  );
  expect(found).toEqual([]);
}
