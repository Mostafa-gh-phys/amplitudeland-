import fs from 'node:fs';
import path from 'node:path';
import { build as viteBuild } from 'vite';
import { hashPortableAdminKey, normalizeUsername } from '../src/lib/auth.ts';
import { loadArticlesFromDiskOrSeed, resolveRepoTargetFromEnv } from '../src/lib/contentLoader.ts';
import { buildGitHubPagesBundle } from '../src/lib/ssg.ts';
import type { AdminLockRecord } from '../src/lib/types.ts';

function resolveAdminLockForStaticBundle(rootDir: string): AdminLockRecord | undefined {
  const lockPath = path.resolve(rootDir, '.amplitudeland-admin.json');
  try {
    if (fs.existsSync(lockPath)) {
      const parsed = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as Partial<AdminLockRecord>;
      if (
        parsed &&
        typeof parsed.username === 'string' &&
        typeof parsed.salt === 'string' &&
        typeof parsed.keyHash === 'string' &&
        parsed.algorithm === 'pbkdf2-sha256'
      ) {
        return {
          username: normalizeUsername(parsed.username),
          displayName: typeof parsed.displayName === 'string' ? parsed.displayName : parsed.username,
          algorithm: 'pbkdf2-sha256',
          iterations: 100000,
          salt: parsed.salt,
          keyHash: parsed.keyHash,
          lockedAt: typeof parsed.lockedAt === 'string' ? parsed.lockedAt : new Date().toISOString(),
        };
      }
    }
  } catch {
    // ignore malformed lock file
  }
  const envKey = (process.env.ADMIN_LOGIN_KEY || '').trim();
  if (envKey.length >= 8) {
    const username = normalizeUsername(process.env.ADMIN_USERNAME || 'admin');
    const portable = hashPortableAdminKey(envKey);
    return {
      username,
      displayName: 'Administrator',
      algorithm: portable.algorithm,
      iterations: portable.iterations,
      salt: portable.salt,
      keyHash: portable.keyHash,
      lockedAt: new Date().toISOString(),
    };
  }
  return undefined;
}

const rootDir = process.cwd();
const outDir = path.resolve(rootDir, 'dist-pages');

const articles = loadArticlesFromDiskOrSeed(rootDir, 'content/posts');
const target = resolveRepoTargetFromEnv(rootDir);
const adminLock = resolveAdminLockForStaticBundle(rootDir);

const isRootSite =
  Boolean(target.customDomain) ||
  target.repo.toLowerCase() === `${target.owner.toLowerCase()}.github.io`;
const viteBase = isRootSite ? '/' : `/${target.repo}/`;

// Build the full interactive AmplitudeLand React + Tailwind + KaTeX app into dist-pages/
process.env.VITE_STATIC_PAGES = 'true';
await viteBuild({
  root: rootDir,
  base: viteBase,
  logLevel: 'warn',
  build: {
    outDir,
    emptyOutDir: true,
  },
});

// Copy unbundled src/assets (editorial plate images & author portraits) for the React SPA
const srcAssetsDir = path.resolve(rootDir, 'src/assets');
if (fs.existsSync(srcAssetsDir)) {
  fs.cpSync(srcAssetsDir, path.join(outDir, 'src/assets'), { recursive: true, force: true });
}

// Copy src/assets/images into assets/images for crawler-friendly static post pages
const srcImagesDir = path.resolve(rootDir, 'src/assets/images');
if (fs.existsSync(srcImagesDir)) {
  fs.cpSync(srcImagesDir, path.join(outDir, 'assets/images'), { recursive: true, force: true });
}

// Copy KaTeX CSS & fonts for static crawler HTML post pages
const katexDistDir = path.resolve(rootDir, 'node_modules/katex/dist');
const destKatexDir = path.join(outDir, 'assets/katex');
if (fs.existsSync(katexDistDir)) {
  fs.mkdirSync(destKatexDir, { recursive: true });
  const katexCss = path.join(katexDistDir, 'katex.min.css');
  if (fs.existsSync(katexCss)) {
    fs.copyFileSync(katexCss, path.join(destKatexDir, 'katex.min.css'));
  }
  const katexFonts = path.join(katexDistDir, 'fonts');
  if (fs.existsSync(katexFonts)) {
    fs.cpSync(katexFonts, path.join(destKatexDir, 'fonts'), { recursive: true, force: true });
  }
}

// Write pre-hydrated JSON snapshot from content/posts/*.md so the SPA loads real disk articles instantly
const dataDir = path.join(outDir, 'data');
fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(
  path.join(dataDir, 'site-bundle.json'),
  JSON.stringify(
    {
      articles,
      ...(adminLock ? { adminLock } : {}),
      repoConfig: {
        owner: target.owner,
        repo: target.repo,
        branch: 'main',
        contentDir: 'content/posts',
        pagesBranch: 'gh-pages',
        customDomain: target.customDomain,
      },
    },
    null,
    2,
  ),
  'utf8',
);

// Create 404.html from the built Vite React index.html so GitHub Pages routes recover inside the full SPA
const builtIndexPath = path.join(outDir, 'index.html');
if (fs.existsSync(builtIndexPath)) {
  fs.copyFileSync(builtIndexPath, path.join(outDir, '404.html'));
}

// Emit SEO static artifacts (.nojekyll, sitemap.xml, rss.xml, robots.txt, CNAME, and crawler posts/<slug>/index.html)
// while keeping the full interactive Vite React app at index.html & 404.html.
const bundle = buildGitHubPagesBundle(articles, {
  owner: target.owner,
  repo: target.repo,
  customDomain: target.customDomain,
  localAssets: true,
});

for (const file of bundle.files) {
  if (file.path === 'index.html' || file.path === '404.html') continue;
  const dest = path.join(outDir, file.path);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, file.content, 'utf8');
}

const publishedCount = articles.filter((a) => a.status === 'published').length;
const draftCount = articles.length - publishedCount;
console.log(
  `AmplitudeLand GitHub Pages bundle built -> ${outDir}\n` +
    `  Target URL : ${bundle.pagesUrl} (base: ${viteBase})\n` +
    `  UI Mode    : Full AmplitudeLand Studio + Journal + Topics + Static Build + CMS Studio\n` +
    `  Published  : ${publishedCount} monographs (${draftCount} drafts excluded from SEO feed)\n` +
    `  SEO Files  : ${bundle.fileCount - 2} crawler/feed files + SPA bundle`,
);
