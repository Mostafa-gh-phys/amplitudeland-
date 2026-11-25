import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadArticlesFromDiskOrSeed, resolveRepoTargetFromEnv } from './contentLoader.ts';
import {
  buildGitHubPagesBundle,
  buildStaticSite,
  generateGitHubPagesWorkflowYaml,
} from './ssg.ts';
import { SEED_ARTICLES } from './seedArticles.ts';

test('buildStaticSite generates SEO HTML only for published articles and excludes drafts', () => {
  const { manifest, htmlBySlug } = buildStaticSite(SEED_ARTICLES, 'https://amplitudeland.github.io');

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
  assert.match(firstHtml, /Cite This Monograph/);
  assert.match(firstHtml, /Contents/);
  assert.match(manifest.sitemapXml, /topological-protection-surface-codes/);
  assert.equal(manifest.sitemapXml.includes('chern-simons-topological-field-notes'), false);
});

test('buildGitHubPagesBundle builds complete static site for amplitudeland.github.io with 404 and local assets', () => {
  const bundle = buildGitHubPagesBundle(SEED_ARTICLES, {
    owner: 'amplitudeland',
    repo: 'amplitudeland.github.io',
    localAssets: true,
  });

  assert.equal(bundle.pagesUrl, 'https://amplitudeland.github.io');
  const paths = new Set(bundle.files.map((f) => f.path));
  assert.ok(paths.has('.nojekyll'));
  assert.ok(paths.has('index.html'));
  assert.ok(paths.has('404.html'));
  assert.ok(paths.has('sitemap.xml'));
  assert.ok(paths.has('rss.xml'));
  assert.ok(paths.has('robots.txt'));
  assert.equal(paths.has('CNAME'), false);
  assert.ok(paths.has('posts/topological-protection-surface-codes/index.html'));
  assert.equal(paths.has('posts/chern-simons-topological-field-notes/index.html'), false);

  const indexFile = bundle.files.find((f) => f.path === 'index.html');
  assert.ok(indexFile?.content.includes('AmplitudeLand'));
  assert.ok(indexFile?.content.includes('./posts/topological-protection-surface-codes/index.html'));
  assert.ok(indexFile?.content.includes('./assets/images/hero_quantum_lattice_1795515080583.jpg'));

  const postFile = bundle.files.find((f) => f.path === 'posts/topological-protection-surface-codes/index.html');
  assert.ok(postFile?.content.includes('../../assets/katex/katex.min.css'));
  assert.ok(postFile?.content.includes('../../assets/images/hero_quantum_lattice_1795515080583.jpg'));
});

test('buildGitHubPagesBundle supports custom domain CNAME when configured', () => {
  const bundle = buildGitHubPagesBundle(SEED_ARTICLES, {
    owner: 'mostafa',
    repo: 'amplitudeland',
    customDomain: 'amplitudeland.org',
  });

  assert.equal(bundle.pagesUrl, 'https://amplitudeland.org');
  const cname = bundle.files.find((f) => f.path === 'CNAME');
  assert.equal(cname?.content, 'amplitudeland.org\n');
});

test('GitHub Actions deploy-pages workflow matches generator and runs npm run build:pages', () => {
  const workflowPath = path.resolve(process.cwd(), '.github/workflows/deploy-pages.yml');
  assert.equal(fs.existsSync(workflowPath), true);
  const diskWorkflow = fs.readFileSync(workflowPath, 'utf8');
  assert.equal(diskWorkflow, generateGitHubPagesWorkflowYaml('main'));
  assert.match(diskWorkflow, /npm run build:pages/);
  assert.match(diskWorkflow, /path:\s*dist-pages/);
  assert.match(diskWorkflow, /id:\s*detect_pages/);
  assert.match(diskWorkflow, /refs\/heads\/gh-pages/);
  assert.match(diskWorkflow, /actions\/deploy-pages@v4/);
});

test('loadArticlesFromDiskOrSeed loads content/posts markdown files cleanly', () => {
  const loaded = loadArticlesFromDiskOrSeed(process.cwd(), 'content/posts');
  assert.equal(loaded.length, SEED_ARTICLES.length);
  const surface = loaded.find((a) => a.slug === 'topological-protection-surface-codes');
  assert.ok(surface);
  assert.equal(surface.status, 'published');
  assert.ok(surface.equationCount >= 4);
  assert.ok(surface.coverImage?.includes('hero_quantum_lattice'));
});

test('resolveRepoTargetFromEnv defaults to amplitudeland/amplitudeland.github.io', () => {
  const prevRepo = process.env.GITHUB_REPOSITORY;
  const prevOwner = process.env.GITHUB_REPOSITORY_OWNER;
  delete process.env.GITHUB_REPOSITORY;
  delete process.env.GITHUB_REPOSITORY_OWNER;
  try {
    const target = resolveRepoTargetFromEnv(process.cwd());
    assert.equal(target.owner, 'amplitudeland');
    assert.equal(target.repo, 'amplitudeland.github.io');

    process.env.GITHUB_REPOSITORY = 'amplitudeland/amplitudeland.github.io';
    const ciTarget = resolveRepoTargetFromEnv(process.cwd());
    assert.equal(ciTarget.owner, 'amplitudeland');
    assert.equal(ciTarget.repo, 'amplitudeland.github.io');
  } finally {
    if (prevRepo !== undefined) process.env.GITHUB_REPOSITORY = prevRepo;
    else delete process.env.GITHUB_REPOSITORY;
    if (prevOwner !== undefined) process.env.GITHUB_REPOSITORY_OWNER = prevOwner;
    else delete process.env.GITHUB_REPOSITORY_OWNER;
  }
});
