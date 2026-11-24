import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FONT_PAIRING_OPTIONS,
  THEME_OPTIONS,
  getFontPairingOption,
  getThemeOption,
  parseArticleSlugFromPath,
} from './appearance.ts';

test('getThemeOption returns matching theme or defaults to archival-paper', () => {
  assert.equal(getThemeOption('sepia-folio').isDark, false);
  assert.equal(getThemeOption('midnight-observatory').isDark, true);
  assert.equal(getThemeOption('unknown').id, THEME_OPTIONS[0].id);
});

test('getFontPairingOption returns matching pairing or defaults to classical-editorial', () => {
  assert.equal(getFontPairingOption('academic-monograph').subtitle, 'Academic Monograph');
  assert.equal(getFontPairingOption('technical-lab').subtitle, 'Technical Lab');
  assert.equal(getFontPairingOption(null).id, FONT_PAIRING_OPTIONS[0].id);
});

test('parseArticleSlugFromPath extracts /posts/:slug and ?article= slugs cleanly', () => {
  assert.equal(
    parseArticleSlugFromPath('/posts/topological-protection-surface-codes', ''),
    'topological-protection-surface-codes',
  );
  assert.equal(
    parseArticleSlugFromPath('/posts/floquet-berry-curvature/', ''),
    'floquet-berry-curvature',
  );
  assert.equal(parseArticleSlugFromPath('/', '?article=navier-stokes'), 'navier-stokes');
  assert.equal(parseArticleSlugFromPath('/', ''), null);
});
