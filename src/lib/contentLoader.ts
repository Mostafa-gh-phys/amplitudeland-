import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  countLatexEquations,
  estimateReadingTime,
  parseArticleMarkdown,
} from './frontmatter.ts';
import { SEED_ARTICLES } from './seedArticles.ts';
import type { Article } from './types.ts';

export function loadArticlesFromDiskOrSeed(
  rootDir = process.cwd(),
  contentDir = 'content/posts',
): Article[] {
  const seedBySlug = new Map<string, Article>(SEED_ARTICLES.map((a) => [a.slug, { ...a, tags: [...a.tags] }]));
  const absDir = path.resolve(rootDir, contentDir);

  if (!fs.existsSync(absDir)) {
    return SEED_ARTICLES.map((a) => ({ ...a, tags: [...a.tags] }));
  }

  const entries = fs.readdirSync(absDir, { withFileTypes: true });
  const mdFiles = entries.filter((e) => e.isFile() && /\.(md|mdx)$/i.test(e.name));
  if (mdFiles.length === 0) {
    return SEED_ARTICLES.map((a) => ({ ...a, tags: [...a.tags] }));
  }

  const diskArticles: Article[] = [];
  const seenSlugs = new Set<string>();

  for (const file of mdFiles) {
    const absFile = path.join(absDir, file.name);
    const raw = fs.readFileSync(absFile, 'utf8');
    const fallbackSlug = file.name.replace(/\.(md|mdx)$/i, '');
    const parsed = parseArticleMarkdown(raw, fallbackSlug);
    const seedMatch = seedBySlug.get(parsed.frontmatter.slug);

    const article: Article = {
      id: seedMatch?.id || `art-${crypto.createHash('sha1').update(parsed.frontmatter.slug).digest('hex').slice(0, 8)}`,
      slug: parsed.frontmatter.slug,
      title: parsed.frontmatter.title,
      abstract: parsed.frontmatter.abstract || seedMatch?.abstract || '',
      category: parsed.frontmatter.category,
      tags: parsed.frontmatter.tags,
      status: parsed.frontmatter.status,
      author: parsed.frontmatter.author,
      authorAffiliation: parsed.frontmatter.authorAffiliation,
      authorAvatar: parsed.frontmatter.authorAvatar || seedMatch?.authorAvatar,
      publishedAt: parsed.frontmatter.publishedAt,
      updatedAt: parsed.frontmatter.updatedAt,
      doi: parsed.frontmatter.doi,
      coverImage: parsed.frontmatter.coverImage,
      coverCaption: parsed.frontmatter.coverCaption,
      body: parsed.body,
      commitSha: seedMatch?.commitSha || crypto.createHash('sha1').update(raw).digest('hex').slice(0, 7),
      commitMessage: seedMatch?.commitMessage || `content: load ${file.name}`,
      filePath: `${contentDir}/${file.name}`,
      readingTimeMinutes: estimateReadingTime(parsed.body),
      equationCount: countLatexEquations(parsed.body),
    };

    diskArticles.push(article);
    seenSlugs.add(article.slug);
  }

  // Keep any seed articles not explicitly overridden on disk
  for (const seed of SEED_ARTICLES) {
    if (!seenSlugs.has(seed.slug)) {
      diskArticles.push({ ...seed, tags: [...seed.tags] });
    }
  }

  return diskArticles.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function resolveRepoTargetFromEnv(rootDir = process.cwd()): {
  owner: string;
  repo: string;
  customDomain?: string;
} {
  let owner = (process.env.GITHUB_REPOSITORY_OWNER || '').trim();
  let repo = '';

  const ghRepo = (process.env.GITHUB_REPOSITORY || '').trim();
  if (ghRepo.includes('/')) {
    const [o, r] = ghRepo.split('/');
    if (o) owner = o.trim();
    if (r) repo = r.trim();
  }

  if (!owner) owner = 'amplitudeland';
  if (!repo) repo = 'amplitudeland.github.io';

  let customDomain: string | undefined;
  const cnamePath = path.resolve(rootDir, 'CNAME');
  if (fs.existsSync(cnamePath)) {
    const raw = fs.readFileSync(cnamePath, 'utf8').trim();
    if (raw) customDomain = raw;
  }

  return { owner, repo, customDomain };
}
