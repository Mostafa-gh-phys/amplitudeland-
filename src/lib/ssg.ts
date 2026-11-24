import { computeGitHubPagesUrl, sanitizeCustomDomain } from './auth.ts';
import { renderMarkdownLatex } from './markdownLatex.ts';
import type {
  Article,
  GitHubPagesBundle,
  GitHubPagesFile,
  StaticBuildManifest,
  StaticPageArtifact,
} from './types.ts';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeXml(value: string): string {
  return escapeHtml(value);
}

export function generateStaticArticleHtml(
  article: Article,
  baseUrl: string,
  options?: { isGitHubPages?: boolean },
): string {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const isPages = options?.isGitHubPages ?? true;
  const canonicalUrl = `${cleanBase}/posts/${encodeURIComponent(article.slug)}/`;
  const homeHref = isPages ? '../../index.html' : '/';
  const readerHref = isPages ? '../../index.html' : `/posts/${encodeURIComponent(article.slug)}`;
  const readerLabel = isPages ? 'All Monographs' : 'Open Interactive Reader';
  const bodyHtml = renderMarkdownLatex(article.body);

  const jsonLd = JSON.stringify(
    {
      '@context': 'https://schema.org',
      '@type': 'ScholarlyArticle',
      headline: article.title,
      abstract: article.abstract,
      author: {
        '@type': 'Person',
        name: article.author,
        affiliation: {
          '@type': 'Organization',
          name: article.authorAffiliation,
        },
      },
      datePublished: article.publishedAt,
      dateModified: article.updatedAt,
      articleSection: article.category,
      keywords: article.tags.join(', '),
      identifier: article.doi || article.commitSha,
      url: canonicalUrl,
      publisher: {
        '@type': 'Organization',
        name: 'AmplitudeLand',
      },
    },
    null,
    2,
  ).replace(/</g, '\\u003c');

  const safeTitle = escapeHtml(article.title);
  const safeAbstract = escapeHtml(article.abstract || article.title);
  const safeCategory = escapeHtml(article.category);
  const safeAuthor = escapeHtml(article.author);
  const safeAffiliation = escapeHtml(article.authorAffiliation);
  const safeTags = article.tags.map((t) => escapeHtml(t)).join(', ');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${safeTitle} — AmplitudeLand</title>
    <meta name="description" content="${safeAbstract}" />
    <meta name="keywords" content="${safeTags}" />
    <meta name="author" content="${safeAuthor}" />
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="AmplitudeLand" />
    <meta property="og:title" content="${safeTitle}" />
    <meta property="og:description" content="${safeAbstract}" />
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
    <meta property="article:published_time" content="${escapeHtml(article.publishedAt)}" />
    <meta property="article:modified_time" content="${escapeHtml(article.updatedAt)}" />
    <meta property="article:section" content="${safeCategory}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${safeTitle}" />
    <meta name="twitter:description" content="${safeAbstract}" />
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css" crossorigin="anonymous" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=JetBrains+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
    <script type="application/ld+json">${jsonLd}</script>
    <style>
      body { margin: 0; background: #FAF9F6; color: #1C1917; font-family: "Plus Jakarta Sans", system-ui, sans-serif; line-height: 1.75; }
      header { border-bottom: 1px solid #E4E0D8; padding: 1.25rem 2rem; display: flex; justify-content: space-between; align-items: center; max-width: 72rem; margin: 0 auto; }
      header a { color: #1C1917; text-decoration: none; font-weight: 600; }
      main { max-width: 48rem; margin: 3rem auto; padding: 0 1.5rem 4rem; }
      .meta { font-size: 0.8125rem; color: #57534E; margin-bottom: 1rem; }
      h1 { font-family: "Fraunces", Georgia, serif; font-size: clamp(2rem, 4vw, 3rem); line-height: 1.15; margin: 0 0 1rem; font-weight: 600; }
      .abstract { font-size: 1.125rem; color: #44403C; border-top: 1px solid #E4E0D8; border-bottom: 1px solid #E4E0D8; padding: 1.25rem 0; margin: 1.5rem 0 2.5rem; }
      article h2 { font-family: "Fraunces", Georgia, serif; font-size: 1.5rem; margin-top: 2.25rem; border-bottom: 1px solid #E4E0D8; padding-bottom: 0.4rem; }
      article pre { background: #F3F1EC; border: 1px solid #E4E0D8; padding: 1rem; border-radius: 6px; overflow-x: auto; font-family: "JetBrains Mono", monospace; font-size: 0.85rem; }
      article code { font-family: "JetBrains Mono", monospace; background: #F0EEE8; padding: 0.15rem 0.35rem; border-radius: 4px; font-size: 0.88em; }
      article pre code { background: transparent; padding: 0; }
      .katex-display { overflow-x: auto; padding: 0.5rem 0; }
      footer { max-width: 48rem; margin: 3rem auto 0; padding: 1.5rem; border-top: 1px solid #E4E0D8; font-size: 0.8125rem; color: #57534E; }
    </style>
  </head>
  <body>
    <header>
      <a href="${homeHref}" style="font-family: 'Fraunces', serif; font-size: 1.25rem;">AmplitudeLand</a>
      <a href="${readerHref}" style="font-size: 0.875rem; color: #1D4ED8;">${readerLabel}</a>
    </header>
    <main>
      <div class="meta">
        <span>${safeCategory}</span> · <span>${escapeHtml(article.publishedAt)}</span> · <span>${article.readingTimeMinutes} min read</span> · <span>${article.equationCount} equations</span>
      </div>
      <h1>${safeTitle}</h1>
      <div class="meta">By <strong>${safeAuthor}</strong> (${safeAffiliation})${article.doi ? ` · DOI ${escapeHtml(article.doi)}` : ''}</div>
      <div class="abstract">${safeAbstract}</div>
      <article>${bodyHtml}</article>
      <footer>
        AmplitudeLand Static Monograph · Commit <code>${escapeHtml(article.commitSha)}</code> · Tags: ${safeTags || 'None'}
      </footer>
    </main>
  </body>
</html>`;
}

export function generateGitHubPagesIndexHtml(
  publishedArticles: Article[],
  pagesUrl: string,
): string {
  const cleanBase = pagesUrl.replace(/\/+$/, '');
  const sorted = [...publishedArticles].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const categories = Array.from(new Set(sorted.map((a) => a.category)));

  const cardsHtml = sorted
    .map((a) => {
      const href = `./posts/${encodeURIComponent(a.slug)}/index.html`;
      const tagsList = a.tags.map((t) => `<span class="tag">#${escapeHtml(t)}</span>`).join(' ');
      return `      <article class="monograph-card" data-category="${escapeHtml(a.category)}" data-search="${escapeHtml((a.title + ' ' + a.abstract + ' ' + a.author + ' ' + a.tags.join(' ')).toLowerCase())}">
        <div class="card-meta">
          <span class="category-badge">${escapeHtml(a.category)}</span>
          <span>·</span>
          <span>${escapeHtml(a.publishedAt)}</span>
          <span>·</span>
          <span>${a.readingTimeMinutes} min read</span>
          <span>·</span>
          <span>${a.equationCount} LaTeX equations</span>
        </div>
        <h2><a href="${href}">${escapeHtml(a.title)}</a></h2>
        <p class="abstract">${escapeHtml(a.abstract)}</p>
        <div class="card-footer">
          <div class="byline">By <strong>${escapeHtml(a.author)}</strong> (${escapeHtml(a.authorAffiliation)})</div>
          <div class="tags-row">${tagsList}</div>
        </div>
      </article>`;
    })
    .join('\n');

  const categoryButtons = [
    '<button type="button" class="cat-btn active" data-cat="all">All Fields</button>',
    ...categories.map(
      (c) => `<button type="button" class="cat-btn" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>`,
    ),
  ].join('\n');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AmplitudeLand — Scientific Monographs &amp; LaTeX Weblog</title>
    <meta name="description" content="Peer-grade scientific monographs with native LaTeX typesetting, version-controlled via GitHub CMS." />
    <link rel="canonical" href="${escapeHtml(cleanBase)}/" />
    <link rel="alternate" type="application/rss+xml" title="AmplitudeLand RSS" href="./rss.xml" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&family=JetBrains+Mono:ital,wght@0,400;0,500;1,400&family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap" rel="stylesheet" />
    <style>
      :root {
        --bg: #FAF9F6;
        --surface: #FFFFFF;
        --surface-muted: #F3F1EC;
        --border: #E4E0D8;
        --text: #1C1917;
        --text-muted: #57534E;
        --accent: #1D4ED8;
        --accent-hover: #1E40AF;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --bg: #0F1115;
          --surface: #181B22;
          --surface-muted: #212631;
          --border: #2D3342;
          --text: #F3F4F6;
          --text-muted: #9CA3AF;
          --accent: #60A5FA;
          --accent-hover: #93C5FD;
        }
      }
      body { margin: 0; background: var(--bg); color: var(--text); font-family: "Plus Jakarta Sans", system-ui, sans-serif; line-height: 1.75; transition: background 0.2s, color 0.2s; }
      header { border-bottom: 1px solid var(--border); background: var(--surface); padding: 1.25rem 2rem; position: sticky; top: 0; z-index: 50; backdrop-filter: blur(8px); }
      .header-inner { max-width: 72rem; margin: 0 auto; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 1rem; }
      .brand-group { display: flex; align-items: baseline; gap: 0.75rem; text-decoration: none; }
      .brand { font-family: "Cormorant Garamond", Georgia, serif; font-size: 1.75rem; font-weight: 700; color: var(--text); letter-spacing: -0.01em; }
      .brand-sub { font-size: 0.8125rem; color: var(--text-muted); font-weight: 500; }
      nav { display: flex; align-items: center; gap: 1.25rem; font-size: 0.875rem; font-weight: 600; }
      nav a { color: var(--accent); text-decoration: none; }
      nav a:hover { color: var(--accent-hover); text-decoration: underline; }
      main { max-width: 72rem; margin: 3rem auto; padding: 0 1.5rem 5rem; }
      .hero-box { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 2.5rem; margin-bottom: 2.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.02); }
      .hero-title { font-family: "Cormorant Garamond", Georgia, serif; font-size: clamp(2rem, 3.5vw, 2.75rem); line-height: 1.15; margin: 0 0 0.75rem; font-weight: 700; }
      .hero-lead { font-size: 1.05rem; color: var(--text-muted); margin: 0 0 1.5rem; max-width: 48rem; }
      .search-filter-bar { display: flex; flex-wrap: wrap; gap: 1rem; align-items: center; justify-content: space-between; margin-bottom: 2rem; }
      .search-input { width: 100%; max-width: 24rem; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 0.65rem 1rem; font-size: 0.875rem; color: var(--text); }
      .search-input:focus { outline: 2px solid var(--accent); }
      .categories-row { display: flex; flex-wrap: wrap; gap: 0.5rem; }
      .cat-btn { background: var(--surface); border: 1px solid var(--border); color: var(--text-muted); padding: 0.4rem 0.85rem; border-radius: 9999px; font-size: 0.8125rem; font-weight: 500; cursor: pointer; transition: all 0.15s; }
      .cat-btn:hover { background: var(--surface-muted); color: var(--text); }
      .cat-btn.active { background: var(--accent); border-color: var(--accent); color: #FFFFFF; }
      .monographs-grid { display: grid; gap: 1.5rem; }
      .monograph-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 2rem; transition: transform 0.15s, box-shadow 0.15s; box-shadow: 0 1px 2px rgba(0,0,0,0.02); }
      .monograph-card:hover { transform: translateY(-2px); box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); }
      .card-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; font-size: 0.8125rem; color: var(--text-muted); margin-bottom: 0.75rem; }
      .category-badge { display: inline-block; background: var(--surface-muted); color: var(--text); padding: 0.15rem 0.6rem; border-radius: 6px; font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.03em; }
      .monograph-card h2 { font-family: "Cormorant Garamond", Georgia, serif; font-size: 1.65rem; line-height: 1.25; margin: 0 0 0.75rem; }
      .monograph-card h2 a { color: var(--text); text-decoration: none; }
      .monograph-card h2 a:hover { color: var(--accent); }
      .abstract { color: var(--text-muted); font-size: 0.95rem; line-height: 1.7; margin: 0 0 1.25rem; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
      .card-footer { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 1rem; border-top: 1px solid var(--border); padding-top: 1rem; font-size: 0.85rem; }
      .byline { color: var(--text-muted); }
      .byline strong { color: var(--text); }
      .tags-row { display: flex; flex-wrap: wrap; gap: 0.35rem; }
      .tag { font-family: "JetBrains Mono", monospace; font-size: 0.75rem; color: var(--text-muted); background: var(--surface-muted); padding: 0.1rem 0.4rem; border-radius: 4px; }
      footer { max-width: 72rem; margin: 0 auto; padding: 2rem 1.5rem 4rem; border-top: 1px solid var(--border); font-size: 0.8125rem; color: var(--text-muted); display: flex; justify-content: space-between; flex-wrap: wrap; gap: 1rem; }
      .footer-links { display: flex; gap: 1.5rem; }
      .footer-links a { color: var(--text-muted); text-decoration: none; }
      .footer-links a:hover { color: var(--accent); }
    </style>
  </head>
  <body>
    <header>
      <div class="header-inner">
        <a class="brand-group" href="./index.html">
          <span class="brand">AmplitudeLand</span>
          <span class="brand-sub">Sci-Weblog &amp; LaTeX CMS</span>
        </a>
        <nav>
          <a href="./index.html">Journal</a>
          <a href="./rss.xml">RSS Feed</a>
          <a href="./sitemap.xml">Sitemap</a>
        </nav>
      </div>
    </header>
    <main>
      <div class="hero-box">
        <h1 class="hero-title">Scientific Monographs &amp; LaTeX Research Notes</h1>
        <p class="hero-lead">Peer-grade scientific publications with native KaTeX mathematical typesetting, version-controlled via GitHub CMS and statically rendered for optimal SEO and performance.</p>
        <div class="search-filter-bar">
          <input type="text" id="searchInput" class="search-input" placeholder="Search monographs, authors, equations..." />
          <div class="categories-row" id="categoriesRow">
            ${categoryButtons}
          </div>
        </div>
      </div>

      <div class="monographs-grid" id="monographsGrid">
${cardsHtml}
      </div>
    </main>
    <footer>
      <span>AmplitudeLand · GitHub-Backed Scientific Weblog</span>
      <div class="footer-links">
        <a href="./rss.xml">RSS Feed</a>
        <a href="./sitemap.xml">Sitemap</a>
        <a href="https://github.com" target="_blank" rel="noreferrer">GitHub CMS</a>
      </div>
    </footer>
    <script>
      const searchInput = document.getElementById('searchInput');
      const catBtns = document.querySelectorAll('.cat-btn');
      const cards = document.querySelectorAll('.monograph-card');
      let activeCategory = 'all';

      function filterCards() {
        const query = (searchInput.value || '').toLowerCase().trim();
        cards.forEach(card => {
          const cat = card.getAttribute('data-category');
          const text = card.getAttribute('data-search') || '';
          const matchesCat = activeCategory === 'all' || cat === activeCategory;
          const matchesQuery = !query || text.includes(query);
          card.style.display = (matchesCat && matchesQuery) ? 'block' : 'none';
        });
      }

      searchInput.addEventListener('input', filterCards);
      catBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          catBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          activeCategory = btn.getAttribute('data-cat') || 'all';
          filterCards();
        });
      });
    </script>
  </body>
</html>`;
}

export function generateSitemapXml(
  publishedArticles: Article[],
  baseUrl: string,
  options?: { isGitHubPages?: boolean },
): string {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const urls = [
    `  <url>\n    <loc>${escapeXml(cleanBase)}/</loc>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>`,
    ...publishedArticles.map((a) => {
      const postUrl = `${cleanBase}/posts/${encodeURIComponent(a.slug)}/`;
      return `  <url>\n    <loc>${escapeXml(postUrl)}</loc>\n    <lastmod>${escapeXml(a.updatedAt)}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.85</priority>\n  </url>`;
    }),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

export function generateRssXml(
  publishedArticles: Article[],
  baseUrl: string,
  _options?: { isGitHubPages?: boolean },
): string {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const items = publishedArticles
    .map((a) => {
      const postUrl = `${cleanBase}/posts/${encodeURIComponent(a.slug)}/`;
      return `    <item>
      <title>${escapeXml(a.title)}</title>
      <link>${escapeXml(postUrl)}</link>
      <guid isPermaLink="true">${escapeXml(postUrl)}</guid>
      <pubDate>${new Date(a.publishedAt).toUTCString()}</pubDate>
      <category>${escapeXml(a.category)}</category>
      <description>${escapeXml(a.abstract)}</description>
    </item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>AmplitudeLand Scientific Weblog</title>
    <link>${escapeXml(cleanBase)}</link>
    <description>Peer-grade scientific monographs with native LaTeX equations and GitHub CMS versioning.</description>
${items}
  </channel>
</rss>
`;
}

export function buildStaticSite(
  articles: Article[],
  baseUrl: string,
): {
  manifest: StaticBuildManifest;
  htmlBySlug: Map<string, string>;
} {
  const startedAt = Date.now();
  const published = articles.filter((a) => a.status === 'published');
  const draftsCount = articles.length - published.length;
  const htmlBySlug = new Map<string, string>();
  const pages: StaticPageArtifact[] = [];
  let totalBytes = 0;

  for (const article of published) {
    const html = generateStaticArticleHtml(article, baseUrl, { isGitHubPages: true });
    const bytes = Buffer.byteLength(html, 'utf8');
    totalBytes += bytes;
    htmlBySlug.set(article.slug, html);

    pages.push({
      slug: article.slug,
      title: article.title,
      path: `posts/${article.slug}/index.html`,
      bytes,
      equationCount: article.equationCount,
      hasTitle: html.includes('<title>') && !html.includes('<title></title>'),
      hasDescription: html.includes('<meta name="description"'),
      hasOpenGraph: html.includes('property="og:title"'),
      hasJsonLd: html.includes('application/ld+json') && html.includes('ScholarlyArticle'),
      hasKatex: html.includes('katex.min.css'),
      generatedAt: new Date().toISOString(),
    });
  }

  const sitemapXml = generateSitemapXml(published, baseUrl, { isGitHubPages: true });
  const rssXml = generateRssXml(published, baseUrl, { isGitHubPages: true });
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const robotsTxt = `User-agent: *\nAllow: /\nSitemap: ${cleanBase}/sitemap.xml\n`;

  const durationMs = Math.max(1, Date.now() - startedAt);
  const manifest: StaticBuildManifest = {
    buildId: `ssg-${startedAt.toString(36)}`,
    builtAt: new Date().toISOString(),
    durationMs,
    publishedCount: published.length,
    draftsExcludedCount: draftsCount,
    totalBytes,
    pages,
    sitemapXml,
    robotsTxt,
    rssXml,
  };

  return { manifest, htmlBySlug };
}

export function buildGitHubPagesBundle(
  articles: Article[],
  options: { owner: string; repo: string; customDomain?: string },
): GitHubPagesBundle {
  const cleanDomain = options.customDomain ? sanitizeCustomDomain(options.customDomain) : '';
  const pagesUrl = computeGitHubPagesUrl(options.owner, options.repo, cleanDomain);
  const published = articles.filter((a) => a.status === 'published');

  const files: GitHubPagesFile[] = [
    { path: '.nojekyll', content: '' },
    { path: 'index.html', content: generateGitHubPagesIndexHtml(published, pagesUrl) },
    {
      path: 'sitemap.xml',
      content: generateSitemapXml(published, pagesUrl, { isGitHubPages: true }),
    },
    {
      path: 'rss.xml',
      content: generateRssXml(published, pagesUrl, { isGitHubPages: true }),
    },
    {
      path: 'robots.txt',
      content: `User-agent: *\nAllow: /\nSitemap: ${pagesUrl}/sitemap.xml\n`,
    },
  ];

  if (cleanDomain) {
    files.push({ path: 'CNAME', content: `${cleanDomain}\n` });
  }

  for (const article of published) {
    files.push({
      path: `posts/${article.slug}/index.html`,
      content: generateStaticArticleHtml(article, pagesUrl, { isGitHubPages: true }),
    });
  }

  const totalBytes = files.reduce((acc, f) => acc + Buffer.byteLength(f.content, 'utf8'), 0);
  return {
    pagesUrl,
    fileCount: files.length,
    totalBytes,
    files,
  };
}

export function generateNextJsSsgScaffold(owner: string, repo: string, branch: string, contentDir: string): string {
  return `// Next.js App Router Static Site Generation (SSG) Export — Generated by AmplitudeLand
// File: app/posts/[slug]/page.tsx
// Zero local setup required: fetches directly from GitHub Raw / Contents API at build time.

import type { Metadata } from 'next';

const REPO_OWNER = '${owner}';
const REPO_NAME = '${repo}';
const BRANCH = '${branch}';
const CONTENT_DIR = '${contentDir}';

export const dynamicParams = false;

export async function generateStaticParams() {
  const res = await fetch(
    \`https://api.github.com/repos/\${REPO_OWNER}/\${REPO_NAME}/contents/\${CONTENT_DIR}?ref=\${BRANCH}\`,
    { headers: process.env.GITHUB_TOKEN ? { Authorization: \`Bearer \${process.env.GITHUB_TOKEN}\` } : {} }
  );
  const files = (await res.json()) as Array<{ name: string }>;
  return files
    .filter((f) => f.name.endsWith('.md') || f.name.endsWith('.mdx'))
    .map((f) => ({ slug: f.name.replace(/\\.mdx?$/, '') }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: \`\${slug} — AmplitudeLand\`,
    openGraph: { type: 'article', title: slug },
  };
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const rawUrl = \`https://raw.githubusercontent.com/\${REPO_OWNER}/\${REPO_NAME}/\${BRANCH}/\${CONTENT_DIR}/\${slug}.md\`;
  const markdown = await fetch(rawUrl).then((r) => r.text());
  return <article className="mx-auto max-w-3xl px-6 py-16"><pre>{markdown}</pre></article>;
}
`;
}
