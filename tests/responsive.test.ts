import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RESPONSIVE_BREAKPOINTS, RESPONSIVE_VIEWPORTS } from '../app/responsive';

describe('responsive viewport contract', () => {
  it('keeps the documented CSS cutoffs aligned with the shared breakpoint values', () => {
    const styles = ['app/globals.css', 'app/journey.css'].map((path) => readFileSync(path, 'utf8')).join('\n');
    const cssCutoffs = [...styles.matchAll(/@media\s*\(max-width:\s*(\d+)px\)/g)].map((match) => Number(match[1]));
    expect([...new Set(cssCutoffs)].sort((a, b) => a - b)).toEqual(Object.values(RESPONSIVE_BREAKPOINTS).sort((a, b) => a - b));
    expect(RESPONSIVE_VIEWPORTS.map(({ width }) => width)).toEqual([320, 360, 375, 390, 414, 768, 1024, 1280, 1440]);
  });
});
