import fs from 'node:fs';
import path from 'node:path';
import { loadArticlesFromDiskOrSeed, resolveRepoTargetFromEnv } from '../src/lib/contentLoader.ts';
import { buildGitHubPagesBundle } from '../src/lib/ssg.ts';

const rootDir = process.cwd();
const outDir = path.resolve(rootDir, 'dist-pages');

const articles = loadArticlesFromDiskOrSeed(rootDir, 'content/posts');
const target = resolveRepoTargetFromEnv(rootDir);

const bundle = buildGitHubPagesBundle(articles, {
  owner: target.owner,
  repo: target.repo,
  customDomain: target.customDomain,
  localAssets: true,
});

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const file of bundle.files) {
  const dest = path.join(outDir, file.path);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, file.content, 'utf8');
}

// Copy editorial image plates and author portraits
const srcImagesDir = path.resolve(rootDir, 'src/assets/images');
const destImagesDir = path.join(outDir, 'assets/images');
if (fs.existsSync(srcImagesDir)) {
  fs.cpSync(srcImagesDir, destImagesDir, { recursive: true, force: true });
}

// Copy KaTeX stylesheet & fonts for reliable math rendering without external CDN failures
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

const publishedCount = articles.filter((a) => a.status === 'published').length;
const draftCount = articles.length - publishedCount;
console.log(
  `AmplitudeLand GitHub Pages bundle built -> ${outDir}\n` +
    `  Target URL : ${bundle.pagesUrl}\n` +
    `  Published  : ${publishedCount} monographs (${draftCount} drafts excluded)\n` +
    `  Files      : ${bundle.fileCount} static files + KaTeX & image assets`,
);
