import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLatexDelimiters, renderMarkdownLatex } from './markdownLatex.ts';

test('normalizeLatexDelimiters converts \\[...\\] and \\(...\\) outside code blocks', () => {
  const input = 'Inline \\(a^2 + b^2 = c^2\\) and block:\n\\[\\int_0^1 x\\,dx = \\frac{1}{2}\\]\n`\\(literal\\)`';
  const out = normalizeLatexDelimiters(input);
  assert.match(out, /\$a\^2 \+ b\^2 = c\^2\$/);
  assert.match(out, /\$\$\n\\int_0\^1 x\\,dx = \\frac\{1\}\{2\}\n\$\$/);
  assert.match(out, /`\\\(literal\\\)`/);
});

test('renderMarkdownLatex compiles KaTeX math and strips dangerous scripts/URLs', () => {
  const md = [
    '## Spectral Theorem',
    '',
    'For Hermitian $A = A^\\dagger$, we have:',
    '',
    '$$\\lambda_i \\in \\mathbb{R}$$',
    '',
    '<script>alert("xss")</script>',
    '[Unsafe](javascript:alert(1))',
  ].join('\n');

  const html = renderMarkdownLatex(md);
  assert.match(html, /<h2 id="spectral-theorem">Spectral Theorem<\/h2>/);
  assert.match(html, /class="katex"/);
  assert.match(html, /class="katex-display"/);
  assert.equal(html.includes('<script>'), false);
  assert.equal(html.includes('javascript:'), false);
});
