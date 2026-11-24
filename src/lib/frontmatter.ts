import type { Article, TocHeading } from './types.ts';

export interface ParsedFrontmatter {
  title: string;
  slug: string;
  abstract: string;
  category: string;
  tags: string[];
  status: 'published' | 'draft';
  author: string;
  authorAffiliation: string;
  publishedAt: string;
  updatedAt: string;
  doi?: string;
  coverImage?: string;
  coverCaption?: string;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/['"`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'untitled-monograph';
}

function stripQuotes(val: string): string {
  const trimmed = val.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"');
  }
  return trimmed;
}

export function parseArticleMarkdown(
  raw: string,
  fallbackSlug = 'untitled-monograph',
): { frontmatter: ParsedFrontmatter; body: string } {
  const normalized = raw.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);

  const today = new Date().toISOString().slice(0, 10);
  const defaults: ParsedFrontmatter = {
    title: 'Untitled Monograph',
    slug: fallbackSlug,
    abstract: '',
    category: 'General Science',
    tags: [],
    status: 'draft',
    author: 'Research Editorial',
    authorAffiliation: 'Independent Monograph',
    publishedAt: today,
    updatedAt: today,
  };

  if (!match) {
    const firstHeading = normalized.match(/^#\s+(.+)$/m)?.[1]?.trim();
    return {
      frontmatter: {
        ...defaults,
        title: firstHeading || defaults.title,
        slug: slugify(firstHeading || fallbackSlug),
      },
      body: normalized.trim(),
    };
  }

  const yamlBlock = match[1];
  const body = match[2].trim();
  const lines = yamlBlock.split('\n');
  const map: Record<string, string | string[]> = {};
  let currentArrayKey: string | null = null;

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#')) {
      continue;
    }

    const arrayItem = line.match(/^\s*-\s+(.+)$/);
    if (arrayItem && currentArrayKey) {
      const existing = map[currentArrayKey];
      const itemVal = stripQuotes(arrayItem[1]);
      if (Array.isArray(existing)) {
        existing.push(itemVal);
      } else {
        map[currentArrayKey] = [itemVal];
      }
      continue;
    }

    currentArrayKey = null;
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!kv) {
      continue;
    }
    const key = kv[1];
    const rawVal = kv[2].trim();

    if (rawVal === '') {
      map[key] = [];
      currentArrayKey = key;
    } else if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
      const inner = rawVal.slice(1, -1).trim();
      map[key] = inner
        ? inner.split(',').map((s) => stripQuotes(s)).filter(Boolean)
        : [];
    } else {
      map[key] = stripQuotes(rawVal);
    }
  }

  const title = typeof map.title === 'string' && map.title ? map.title : defaults.title;
  const slug = typeof map.slug === 'string' && map.slug ? slugify(map.slug) : slugify(title || fallbackSlug);
  const draftFlag = typeof map.draft === 'string' ? map.draft.toLowerCase() === 'true' : undefined;
  const statusStr = typeof map.status === 'string' ? map.status.toLowerCase() : undefined;
  const status: 'published' | 'draft' =
    draftFlag === true || statusStr === 'draft' ? 'draft' : 'published';

  const tags = Array.isArray(map.tags)
    ? map.tags
    : typeof map.tags === 'string' && map.tags
      ? map.tags.split(',').map((t) => t.trim()).filter(Boolean)
      : [];

  return {
    frontmatter: {
      title,
      slug,
      abstract: typeof map.abstract === 'string' ? map.abstract : '',
      category: typeof map.category === 'string' && map.category ? map.category : defaults.category,
      tags,
      status,
      author: typeof map.author === 'string' && map.author ? map.author : defaults.author,
      authorAffiliation:
        typeof map.authorAffiliation === 'string' && map.authorAffiliation
          ? map.authorAffiliation
          : defaults.authorAffiliation,
      publishedAt:
        typeof map.publishedAt === 'string' && map.publishedAt
          ? map.publishedAt
          : typeof map.date === 'string' && map.date
            ? map.date
            : defaults.publishedAt,
      updatedAt:
        typeof map.updatedAt === 'string' && map.updatedAt
          ? map.updatedAt
          : defaults.updatedAt,
      doi: typeof map.doi === 'string' && map.doi ? map.doi : undefined,
      coverImage: typeof map.coverImage === 'string' && map.coverImage ? map.coverImage : undefined,
      coverCaption:
        typeof map.coverCaption === 'string' && map.coverCaption ? map.coverCaption : undefined,
    },
    body,
  };
}

function escapeYamlString(val: string): string {
  return `"${val.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')}"`;
}

export function serializeArticleMarkdown(
  article: Pick<
    Article,
    | 'title'
    | 'slug'
    | 'abstract'
    | 'category'
    | 'tags'
    | 'status'
    | 'author'
    | 'authorAffiliation'
    | 'publishedAt'
    | 'updatedAt'
    | 'doi'
    | 'coverImage'
    | 'coverCaption'
    | 'body'
  >,
): string {
  const lines: string[] = [
    '---',
    `title: ${escapeYamlString(article.title)}`,
    `slug: ${escapeYamlString(article.slug)}`,
    `abstract: ${escapeYamlString(article.abstract)}`,
    `category: ${escapeYamlString(article.category)}`,
    `tags: [${article.tags.map((t) => escapeYamlString(t)).join(', ')}]`,
    `status: ${article.status}`,
    `draft: ${article.status === 'draft'}`,
    `author: ${escapeYamlString(article.author)}`,
    `authorAffiliation: ${escapeYamlString(article.authorAffiliation)}`,
    `publishedAt: ${escapeYamlString(article.publishedAt)}`,
    `updatedAt: ${escapeYamlString(article.updatedAt)}`,
  ];

  if (article.doi) {
    lines.push(`doi: ${escapeYamlString(article.doi)}`);
  }
  if (article.coverImage) {
    lines.push(`coverImage: ${escapeYamlString(article.coverImage)}`);
  }
  if (article.coverCaption) {
    lines.push(`coverCaption: ${escapeYamlString(article.coverCaption)}`);
  }

  lines.push('---', '', article.body.trim(), '');
  return lines.join('\n');
}

function stripCodeBlocks(markdown: string): string {
  return markdown.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');
}

export function countLatexEquations(markdownBody: string): number {
  const withoutCode = stripCodeBlocks(markdownBody);
  let count = 0;

  // Count display $$...$$ blocks and \[...\] blocks and \begin{equation|align|gather} blocks
  const displayRegex = /\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\begin\{(?:equation|align|gather|multline)\*?\}[\s\S]+?\\end\{(?:equation|align|gather|multline)\*?\}/g;
  const withoutDisplay = withoutCode.replace(displayRegex, () => {
    count += 1;
    return ' ';
  });

  // Count inline $...$ (non-greedy, no leading/trailing spaces for currency safety) and \(...\)
  const inlineRegex = /\$(?!\s)([^$\n]+?)(?<!\s)\$|\\\((.+?)\\\)/g;
  const inlineMatches = withoutDisplay.match(inlineRegex);
  if (inlineMatches) {
    count += inlineMatches.length;
  }

  return count;
}

export function estimateReadingTime(markdownBody: string): number {
  const withoutCode = stripCodeBlocks(markdownBody)
    .replace(/\$\$[\s\S]+?\$\$/g, ' equation ')
    .replace(/\$(?!\s)([^$\n]+?)(?<!\s)\$/g, ' math ');
  const words = withoutCode.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 210));
}

export function extractTocHeadings(markdownBody: string): TocHeading[] {
  const lines = markdownBody.replace(/\r\n/g, '\n').split('\n');
  const headings: TocHeading[] = [];
  const usedIds = new Map<string, number>();
  let inFence = false;

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      continue;
    }

    const match = line.match(/^(#{2,3})\s+(.+?)\s*#*$/);
    if (!match) {
      continue;
    }
    const level = match[1].length as 2 | 3;
    const rawText = match[2]
      .replace(/\$([^$]+)\$/g, '$1')
      .replace(/[*_`]/g, '')
      .trim();
    if (!rawText) {
      continue;
    }

    const baseId = slugify(rawText);
    const seen = usedIds.get(baseId) ?? 0;
    usedIds.set(baseId, seen + 1);
    const id = seen === 0 ? baseId : `${baseId}-${seen}`;
    headings.push({ id, text: rawText, level });
  }

  return headings;
}
