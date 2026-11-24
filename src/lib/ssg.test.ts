import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGitHubPagesBundle, buildStaticSite } from './ssg.ts';
import { SEED_ARTICLES } from './seedArticles.ts';

test('buildStaticSite generates SEO HTML only for published articles and excludes drafts', () => {
  const { manifest, htmlBySlug } = buildStaticSite(SEED_ARTICLES, 'https://amplitudeland.example.com');

  const expectedPublished = SEED_ARTICLES.filter((a) => a.status === 'published').length;
  const expectedDrafts = SEED_ARTICLES.filter((a) => a.status === 'draft').length;

  assert.equal(manifest.publishedCount, expectedPublished);
  assert.equal(manifest.draftsExcludedCount, expectedDrafts);
  assert.equal(htmlBySlug.size, expectedPublished);
  assert.equal(htmlBySlug.has('chern-simons-topological-field-notes'), false);

  const firstHtml = htmlBySlug.get('topological-protection-surface-codes');
  assert.ok(firstHtml);
  assert.match(firstHtml, /<title>Topological Protection and Threshold Scaling.*— AmplitudeLand<\/title>/);
  assert.match(firstHtml, /"@type": "ScholarlyArticle"/);
  assert.match(firstHtml, /class="katex"/);
  assert.match(manifest.sitemapXml, /topological-protection-surface-codes/);
  assert.equal(manifest.sitemapXml.includes('chern-simons-topological-field-notes'), false);
});

test('buildGitHubPagesBundle builds complete static GitHub Pages weblog with CNAME and clean URLs', () => {
  const bundle = buildGitHubPagesBundle(SEED_ARTICLES, {
    owner: 'mostafa',
    repo: 'amplitudeland',
    customDomain: 'amplitudeland.org',
  });

  assert.equal(bundle.pagesUrl, 'https://amplitudeland.org');
  const paths = new Set(bundle.files.map((f) => f.path));
  assert.ok(paths.has('.nojekyll'));
  assert.ok(paths.has('index.html'));
  assert.ok(paths.has('sitemap.xml'));
  assert.ok(paths.has('rss.xml'));
  assert.ok(paths.has('robots.txt'));
  assert.ok(paths.has('CNAME'));
  assert.ok(paths.has('posts/topological-protection-surface-codes/index.html'));
  assert.equal(paths.has('posts/chern-simons-topological-field-notes/index.html'), false);

  const indexFile = bundle.files.find((f) => f.path === 'index.html');
  assert.ok(indexFile?.content.includes('AmplitudeLand'));
  assert.ok(indexFile?.content.includes('./posts/topological-protection-surface-codes/index.html'));
});
