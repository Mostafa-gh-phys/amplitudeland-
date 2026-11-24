import test from 'node:test';
import assert from 'node:assert/strict';
import {
  countLatexEquations,
  estimateReadingTime,
  extractTocHeadings,
  parseArticleMarkdown,
  serializeArticleMarkdown,
  slugify,
} from './frontmatter.ts';

test('slugify generates clean URL slugs', () => {
  assert.equal(slugify('Topological Protection & Surface Codes!'), 'topological-protection-surface-codes');
  assert.equal(slugify('   '), 'untitled-monograph');
});

test('parseArticleMarkdown and serializeArticleMarkdown roundtrip faithfully', () => {
  const md = serializeArticleMarkdown({
    title: 'Navier-Stokes Vorticity',
    slug: 'navier-stokes-vorticity',
    abstract: 'Analysis of enstrophy production.',
    category: 'Fluid Dynamics',
    tags: ['Turbulence', 'PDEs'],
    status: 'draft',
    author: 'Prof. Henrik Lindqvist',
    authorAffiliation: 'Nordic Center',
    publishedAt: '2026-11-20',
    updatedAt: '2026-11-21',
    doi: '10.48550/ax.2026.0098',
    body: '## 1. Introduction\n\nEnergy satisfies $E(k) \\propto k^{-5/3}$.',
  });

  const parsed = parseArticleMarkdown(md);
  assert.equal(parsed.frontmatter.title, 'Navier-Stokes Vorticity');
  assert.equal(parsed.frontmatter.slug, 'navier-stokes-vorticity');
  assert.equal(parsed.frontmatter.status, 'draft');
  assert.deepEqual(parsed.frontmatter.tags, ['Turbulence', 'PDEs']);
  assert.equal(parsed.frontmatter.doi, '10.48550/ax.2026.0098');
  assert.match(parsed.body, /Energy satisfies \$E\(k\)/);
});

test('countLatexEquations counts inline and display equations while skipping code', () => {
  const sample = [
    'Given $E = mc^2$ and $p < p_{th}$, we obtain:',
    '',
    '$$\\nabla \\times \\mathbf{E} = -\\frac{\\partial \\mathbf{B}}{\\partial t}$$',
    '',
    '```python',
    'x = "$not_an_equation$"',
    '```',
    '',
    'Cost is $100 or $ 50.',
  ].join('\n');

  assert.equal(countLatexEquations(sample), 3);
});

test('extractTocHeadings extracts h2 and h3 outside code fences with unique IDs', () => {
  const md = [
    '## 1. Overview',
    'Text',
    '### Convergence Rate',
    '```bash',
    '## Not a heading',
    '```',
    '## 2. Overview',
  ].join('\n');

  const toc = extractTocHeadings(md);
  assert.equal(toc.length, 3);
  assert.deepEqual(toc[0], { id: '1-overview', text: '1. Overview', level: 2 });
  assert.deepEqual(toc[1], { id: 'convergence-rate', text: 'Convergence Rate', level: 3 });
  assert.deepEqual(toc[2], { id: '2-overview', text: '2. Overview', level: 2 });
});

test('estimateReadingTime returns at least 1 minute', () => {
  assert.equal(estimateReadingTime('Short note with $x^2$.'), 1);
});
