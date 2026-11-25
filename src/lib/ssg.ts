import { computeGitHubPagesUrl, sanitizeCustomDomain } from './auth.ts';
import { extractTocHeadings } from './frontmatter.ts';
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

const utf8Encoder = new TextEncoder();
function utf8ByteLength(value: string): number {
  return utf8Encoder.encode(value).length;
}

function resolveStaticAssetPath(
  src: string | undefined,
  depthPrefix: string,
  localAssets: boolean,
): string | null {
  if (!src) return null;
  if (/^https?:\/\//i.test(src)) return src;
  if (src.startsWith('/src/assets/images/')) {
    const filename = src.slice('/src/assets/images/'.length);
    return localAssets ? `${depthPrefix}assets/images/${filename}` : `${depthPrefix}assets/images/${filename}`;
  }
  if (src.startsWith('/assets/')) {
    return `${depthPrefix}${src.slice(1)}`;
  }
  return src;
}

const SHARED_THEME_VARS_CSS = `
      :root {
        --bg: #FAF9F6;
        --surface: #FFFFFF;
        --surface-muted: #F3F1EC;
        --border: #E4E0D8;
        --text: #1C1917;
        --text-muted: #57534E;
        --accent: #1D4ED8;
        --accent-hover: #1E40AF;
        --font-serif: "Fraunces", Georgia, Cambria, serif;
        --font-sans: "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, sans-serif;
        --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;
      }
      @media (prefers-color-scheme: dark) {
        :root:not([data-theme="archival-paper"]):not([data-theme="sepia-folio"]) {
          --bg: #0F1115;
          --surface: #161A22;
          --surface-muted: #1E232E;
          --border: #272D3A;
          --text: #F1F5F9;
          --text-muted: #94A3B8;
          --accent: #60A5FA;
          --accent-hover: #93C5FD;
        }
      }
      :root[data-theme="archival-paper"] {
        --bg: #FAF9F6; --surface: #FFFFFF; --surface-muted: #F3F1EC; --border: #E4E0D8;
        --text: #1C1917; --text-muted: #57534E; --accent: #1D4ED8; --accent-hover: #1E40AF;
      }
      :root[data-theme="sepia-folio"] {
        --bg: #F4EFE6; --surface: #FBF8F1; --surface-muted: #EAE2D3; --border: #DDD3C2;
        --text: #292018; --text-muted: #665748; --accent: #9A3412; --accent-hover: #7C2D12;
      }
      :root[data-theme="obsidian-ink"] {
        --bg: #0F1115; --surface: #161A22; --surface-muted: #1E232E; --border: #272D3A;
        --text: #F1F5F9; --text-muted: #94A3B8; --accent: #60A5FA; --accent-hover: #93C5FD;
      }
      :root[data-theme="midnight-observatory"] {
        --bg: #080D1A; --surface: #0F172A; --surface-muted: #172036; --border: #1E293B;
        --text: #E2E8F0; --text-muted: #94A3B8; --accent: #38BDF8; --accent-hover: #7DD3FC;
      }
      * { box-sizing: border-box; }
      body { margin: 0; background: var(--bg); color: var(--text); font-family: var(--font-sans); line-height: 1.75; transition: background 0.15s, color 0.15s; }
`;

const THEME_INIT_SCRIPT = `<script>(function(){try{var t=localStorage.getItem('amplitudeland_pages_theme');if(t){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();</script>`;

export function generateStaticArticleHtml(
  article: Article,
  baseUrl: string,
  options?: { isGitHubPages?: boolean; localAssets?: boolean },
): string {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const isPages = options?.isGitHubPages ?? true;
  const localAssets = options?.localAssets ?? false;
  const canonicalUrl = `${cleanBase}/posts/${encodeURIComponent(article.slug)}/`;
  const homeHref = isPages ? '../../index.html' : '/';
  const rssHref = isPages ? '../../rss.xml' : '/rss.xml';
  const katexCssHref = localAssets
    ? '../../assets/katex/katex.min.css'
    : 'https://cdn.jsdelivr.net/npm/katex@0.19.1/dist/katex.min.css';

  const bodyHtml = renderMarkdownLatex(article.body);
  const toc = extractTocHeadings(article.body);
  const coverSrc = resolveStaticAssetPath(article.coverImage, '../../', localAssets);
  const avatarSrc = resolveStaticAssetPath(article.authorAvatar, '../../', localAssets);

  const lastName = article.author.split(' ').slice(-1)[0]?.toLowerCase() || 'author';
  const year = article.publishedAt.slice(0, 4) || '2026';
  const bibKey = `${lastName.replace(/[^a-z]/g, '')}${year}${article.slug.split('-')[0] || ''}`;
  const bibtex = `@article{${bibKey},\n  title={${article.title}},\n  author={${article.author}},\n  journal={AmplitudeLand Scientific Journal},\n  year={${year}},\n  url={${canonicalUrl}}${article.doi ? `,\n  doi={${article.doi}}` : ''}\n}`;

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

  const tocHtml =
    toc.length > 0
      ? `<nav class="side-card" aria-label="Table of Contents">
          <div class="side-title">Contents</div>
          <ul class="toc-list">
            ${toc
              .map(
                (h) =>
                  `<li class="${h.level === 3 ? 'toc-h3' : ''}"><a href="#${escapeHtml(h.id)}">${escapeHtml(h.text)}</a></li>`,
              )
              .join('\n            ')}
          </ul>
        </nav>`
      : '';

  const coverHtml = coverSrc
    ? `<figure class="cover-plate">
        <div class="cover-frame"><img src="${escapeHtml(coverSrc)}" alt="${safeTitle}" /></div>
        ${article.coverCaption ? `<figcaption>${escapeHtml(article.coverCaption)}</figcaption>` : ''}
      </figure>`
    : '';

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
    ${THEME_INIT_SCRIPT}
    <link rel="stylesheet" href="${escapeHtml(katexCssHref)}" crossorigin="anonymous" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=JetBrains+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
    <script type="application/ld+json">${jsonLd}</script>
    <style>${SHARED_THEME_VARS_CSS}
      header { position: sticky; top: 0; z-index: 40; border-bottom: 1px solid var(--border); background: var(--surface); }
      .header-inner { max-width: 72rem; margin: 0 auto; padding: 0.9rem 1.5rem; display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
      .brand { font-family: var(--font-serif); font-size: 1.35rem; font-weight: 600; color: var(--text); text-decoration: none; }
      .header-nav { display: flex; align-items: center; gap: 1rem; font-size: 0.84rem; font-weight: 600; }
      .header-nav a { color: var(--accent); text-decoration: none; }
      .header-nav a:hover { text-decoration: underline; }
      .theme-select { background: var(--surface-muted); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 0.3rem 0.55rem; font-size: 0.78rem; font-family: var(--font-sans); cursor: pointer; }
      .page-wrap { max-width: 72rem; margin: 2.5rem auto 5rem; padding: 0 1.5rem; display: grid; gap: 3rem; grid-template-columns: minmax(0, 1fr); }
      @media (min-width: 1024px) { .page-wrap { grid-template-columns: minmax(0, 2fr) minmax(260px, 1fr); align-items: start; } }
      .meta { display: flex; flex-wrap: wrap; gap: 0.45rem; font-size: 0.8125rem; color: var(--text-muted); margin-bottom: 0.85rem; }
      .meta .cat { color: var(--accent); font-weight: 600; }
      h1 { font-family: var(--font-serif); font-size: clamp(2rem, 3.8vw, 2.75rem); line-height: 1.15; margin: 0 0 1.1rem; font-weight: 600; letter-spacing: -0.015em; }
      .author-row { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.75rem; }
      .author-avatar { width: 40px; height: 40px; border-radius: 9999px; object-fit: cover; border: 1px solid var(--border); }
      .author-name { font-size: 0.9rem; font-weight: 600; color: var(--text); }
      .author-aff { font-size: 0.78rem; color: var(--text-muted); }
      .abstract { border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); padding: 1.25rem 0; margin: 1.5rem 0 2rem; }
      .abstract-label { font-size: 0.75rem; font-weight: 600; color: var(--text-muted); margin-bottom: 0.35rem; }
      .abstract p { margin: 0; font-size: 1.03rem; color: var(--text); }
      .cover-plate { margin: 0 0 2.25rem; }
      .cover-frame { overflow: hidden; border-radius: 6px; border: 1px solid var(--border); aspect-ratio: 16 / 9; background: var(--surface-muted); }
      .cover-frame img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .cover-plate figcaption { margin-top: 0.5rem; font-family: var(--font-serif); font-style: italic; font-size: 0.8rem; color: var(--text-muted); }
      article.prose { max-width: 44rem; font-size: 1.03rem; }
      article.prose h2 { font-family: var(--font-serif); font-size: 1.55rem; margin: 2.25rem 0 0.85rem; border-bottom: 1px solid var(--border); padding-bottom: 0.4rem; scroll-margin-top: 5rem; }
      article.prose h3 { font-family: var(--font-serif); font-size: 1.2rem; margin: 1.75rem 0 0.65rem; scroll-margin-top: 5rem; }
      article.prose p { margin: 0 0 1.2rem; }
      article.prose blockquote { margin: 1.5rem 0; padding: 0.9rem 1.15rem; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); font-family: var(--font-serif); font-style: italic; font-size: 1.08rem; }
      article.prose pre { background: var(--surface-muted); border: 1px solid var(--border); padding: 1rem; border-radius: 6px; overflow-x: auto; font-family: var(--font-mono); font-size: 0.84rem; line-height: 1.6; }
      article.prose code { font-family: var(--font-mono); background: var(--surface-muted); padding: 0.15rem 0.35rem; border-radius: 4px; font-size: 0.87em; }
      article.prose pre code { background: transparent; padding: 0; }
      article.prose table { width: 100%; border-collapse: collapse; margin: 1.5rem 0; font-size: 0.9rem; font-variant-numeric: tabular-nums; }
      article.prose th, article.prose td { padding: 0.6rem 0.8rem; border-bottom: 1px solid var(--border); text-align: left; }
      article.prose th { font-weight: 600; border-bottom-width: 2px; }
      .katex-display { overflow-x: auto; overflow-y: hidden; padding: 0.65rem 0.25rem; }
      .bibtex-box { margin-top: 3rem; padding-top: 1.75rem; border-top: 1px solid var(--border); max-width: 44rem; }
      .bibtex-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; }
      .bibtex-head h2 { font-family: var(--font-serif); font-size: 1.15rem; margin: 0; }
      .copy-btn { background: var(--surface); border: 1px solid var(--border); color: var(--text); border-radius: 6px; padding: 0.35rem 0.75rem; font-size: 0.78rem; font-weight: 600; cursor: pointer; }
      .copy-btn:hover { background: var(--surface-muted); }
      .bibtex-pre { background: var(--surface-muted); border: 1px solid var(--border); border-radius: 6px; padding: 1rem; font-family: var(--font-mono); font-size: 0.78rem; overflow-x: auto; margin: 0; }
      aside { position: sticky; top: 5rem; display: flex; flex-direction: column; gap: 1.5rem; }
      .side-card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 1.25rem; }
      .side-title { font-size: 0.75rem; font-weight: 600; color: var(--text-muted); margin-bottom: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; }
      .toc-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.5rem; font-size: 0.85rem; }
      .toc-list li.toc-h3 { padding-left: 0.9rem; font-size: 0.82rem; }
      .toc-list a { color: var(--text); text-decoration: none; }
      .toc-list a:hover { color: var(--accent); text-decoration: underline; }
      .dossier { margin: 0; font-size: 0.78rem; }
      .dossier-row { display: flex; justify-content: space-between; gap: 1rem; padding: 0.55rem 0; border-bottom: 1px solid var(--border); }
      .dossier-row:last-child { border-bottom: 0; }
      .dossier dt { color: var(--text-muted); }
      .dossier dd { margin: 0; font-weight: 500; text-align: right; word-break: break-word; }
      .mono { font-family: var(--font-mono); }
      footer { max-width: 72rem; margin: 0 auto; padding: 1.75rem 1.5rem 3rem; border-top: 1px solid var(--border); font-size: 0.8125rem; color: var(--text-muted); display: flex; flex-wrap: wrap; justify-content: space-between; gap: 1rem; }
      footer a { color: var(--accent); text-decoration: none; }
    </style>
  </head>
  <body>
    <header>
      <div class="header-inner">
        <a href="${homeHref}" class="brand">AmplitudeLand</a>
        <div class="header-nav">
          <a href="${homeHref}">All Monographs</a>
          <a href="${rssHref}">RSS</a>
          <select aria-label="Color theme" class="theme-select" id="themeSelect">
            <option value="">System Theme</option>
            <option value="archival-paper">Archival Paper</option>
            <option value="sepia-folio">Sepia Folio</option>
            <option value="obsidian-ink">Obsidian Ink</option>
            <option value="midnight-observatory">Midnight Observatory</option>
          </select>
        </div>
      </div>
    </header>
    <div class="page-wrap">
      <main>
        <div class="meta">
          <span class="cat">${safeCategory}</span><span>·</span>
          <span>Published ${escapeHtml(article.publishedAt)}</span><span>·</span>
          <span>${article.readingTimeMinutes} min read</span><span>·</span>
          <span>${article.equationCount} ${article.equationCount === 1 ? 'equation' : 'equations'}</span>
        </div>
        <h1>${safeTitle}</h1>
        <div class="author-row">
          ${avatarSrc ? `<img class="author-avatar" src="${escapeHtml(avatarSrc)}" alt="${safeAuthor}" />` : ''}
          <div>
            <div class="author-name">${safeAuthor}</div>
            <div class="author-aff">${safeAffiliation}</div>
          </div>
        </div>
        <section class="abstract" aria-label="Abstract">
          <div class="abstract-label">Abstract</div>
          <p>${safeAbstract}</p>
        </section>
        ${coverHtml}
        <article class="prose">${bodyHtml}</article>
        <section class="bibtex-box" aria-label="BibTeX Citation">
          <div class="bibtex-head">
            <h2>Cite This Monograph</h2>
            <button type="button" class="copy-btn" id="copyBibtex">Copy BibTeX</button>
          </div>
          <pre class="bibtex-pre" id="bibtexPre">${escapeHtml(bibtex)}</pre>
        </section>
      </main>
      <aside>
        ${tocHtml}
        <div class="side-card">
          <div class="side-title">Monograph Dossier</div>
          <dl class="dossier">
            <div class="dossier-row"><dt>Category</dt><dd>${safeCategory}</dd></div>
            <div class="dossier-row"><dt>Tags</dt><dd>${safeTags || 'None'}</dd></div>
            <div class="dossier-row"><dt>Git File</dt><dd class="mono">${escapeHtml(article.filePath)}</dd></div>
            <div class="dossier-row"><dt>Commit SHA</dt><dd class="mono">${escapeHtml(article.commitSha)}</dd></div>
            ${article.doi ? `<div class="dossier-row"><dt>DOI</dt><dd class="mono">${escapeHtml(article.doi)}</dd></div>` : ''}
            <div class="dossier-row"><dt>Updated</dt><dd class="mono">${escapeHtml(article.updatedAt)}</dd></div>
          </dl>
        </div>
      </aside>
    </div>
    <footer>
      <span>AmplitudeLand Scientific Journal · Static Monograph</span>
      <span><a href="${homeHref}">← Back to Monograph Index</a></span>
    </footer>
    <script>
      (function () {
        var select = document.getElementById('themeSelect');
        if (select) {
          var saved = localStorage.getItem('amplitudeland_pages_theme') || '';
          select.value = saved;
          select.addEventListener('change', function () {
            var val = select.value;
            if (val) {
              document.documentElement.setAttribute('data-theme', val);
              localStorage.setItem('amplitudeland_pages_theme', val);
            } else {
              document.documentElement.removeAttribute('data-theme');
              localStorage.removeItem('amplitudeland_pages_theme');
            }
          });
        }
        var copyBtn = document.getElementById('copyBibtex');
        var pre = document.getElementById('bibtexPre');
        if (copyBtn && pre && navigator.clipboard) {
          copyBtn.addEventListener('click', function () {
            navigator.clipboard.writeText(pre.textContent || '').then(function () {
              copyBtn.textContent = 'Copied BibTeX';
              setTimeout(function () { copyBtn.textContent = 'Copy BibTeX'; }, 2000);
            });
          });
        }
      })();
    </script>
  </body>
</html>`;
}

export function generateGitHubPagesIndexHtml(
  publishedArticles: Article[],
  pagesUrl: string,
  options?: { localAssets?: boolean },
): string {
  const cleanBase = pagesUrl.replace(/\/+$/, '');
  const localAssets = options?.localAssets ?? false;
  const sorted = [...publishedArticles].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const categories = Array.from(new Set(sorted.map((a) => a.category)));

  const lead = sorted.find((a) => Boolean(a.coverImage)) ?? sorted[0];
  const leadHref = lead ? `./posts/${encodeURIComponent(lead.slug)}/index.html` : '#';
  const leadCoverSrc = lead ? resolveStaticAssetPath(lead.coverImage, './', localAssets) : null;
  const leadAvatarSrc = lead ? resolveStaticAssetPath(lead.authorAvatar, './', localAssets) : null;

  const leadHeroHtml = lead
    ? `<section class="lead-hero" aria-labelledby="lead-title">
        <div class="lead-grid">
          <div class="lead-copy">
            <div class="card-meta">
              <span class="cat-text">${escapeHtml(lead.category)}</span>
              <span>·</span><span>${escapeHtml(lead.publishedAt)}</span>
              <span>·</span><span>${lead.readingTimeMinutes} min read</span>
              <span>·</span><span>${lead.equationCount} ${lead.equationCount === 1 ? 'equation' : 'equations'}</span>
            </div>
            <h1 id="lead-title"><a href="${leadHref}">${escapeHtml(lead.title)}</a></h1>
            <p class="lead-abstract">${escapeHtml(lead.abstract)}</p>
            <div class="lead-footer">
              <div class="author-row">
                ${leadAvatarSrc ? `<img class="author-avatar" src="${escapeHtml(leadAvatarSrc)}" alt="${escapeHtml(lead.author)}" />` : ''}
                <div>
                  <div class="author-name">${escapeHtml(lead.author)}</div>
                  <div class="author-aff">${escapeHtml(lead.authorAffiliation)}</div>
                </div>
              </div>
              <a class="read-cta" href="${leadHref}">Read Monograph →</a>
            </div>
          </div>
          ${leadCoverSrc ? `<div class="lead-plate"><a href="${leadHref}"><img src="${escapeHtml(leadCoverSrc)}" alt="${escapeHtml(lead.title)}" /></a>${lead.coverCaption ? `<div class="plate-caption">${escapeHtml(lead.coverCaption)}</div>` : ''}</div>` : ''}
        </div>
      </section>`
    : '';

  const cardsHtml = sorted
    .map((a) => {
      const href = `./posts/${encodeURIComponent(a.slug)}/index.html`;
      const thumbSrc = resolveStaticAssetPath(a.coverImage, './', localAssets);
      const tagsList = a.tags.map((t) => `<span class="tag">#${escapeHtml(t)}</span>`).join(' ');
      return `      <article class="monograph-card" data-category="${escapeHtml(a.category)}" data-search="${escapeHtml((a.title + ' ' + a.abstract + ' ' + a.author + ' ' + a.tags.join(' ')).toLowerCase())}">
        ${thumbSrc ? `<a class="card-thumb" href="${href}"><img src="${escapeHtml(thumbSrc)}" alt="${escapeHtml(a.title)}" loading="lazy" /></a>` : ''}
        <div class="card-body">
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
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="AmplitudeLand" />
    <meta property="og:title" content="AmplitudeLand — Scientific Monographs &amp; LaTeX Weblog" />
    <meta property="og:description" content="Peer-grade scientific monographs with native LaTeX typesetting, version-controlled via GitHub CMS." />
    <meta property="og:url" content="${escapeHtml(cleanBase)}/" />
    <link rel="canonical" href="${escapeHtml(cleanBase)}/" />
    <link rel="alternate" type="application/rss+xml" title="AmplitudeLand RSS" href="./rss.xml" />
    ${THEME_INIT_SCRIPT}
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=JetBrains+Mono:ital,wght@0,400;0,500;1,400&family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap" rel="stylesheet" />
    <style>${SHARED_THEME_VARS_CSS}
      header { border-bottom: 1px solid var(--border); background: var(--surface); padding: 1rem 1.5rem; position: sticky; top: 0; z-index: 50; }
      .header-inner { max-width: 72rem; margin: 0 auto; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 1rem; }
      .brand-group { display: flex; align-items: baseline; gap: 0.75rem; text-decoration: none; }
      .brand { font-family: var(--font-serif); font-size: 1.5rem; font-weight: 600; color: var(--text); letter-spacing: -0.015em; }
      .brand-sub { font-size: 0.8125rem; color: var(--text-muted); font-weight: 500; }
      nav { display: flex; align-items: center; gap: 1.15rem; font-size: 0.85rem; font-weight: 600; flex-wrap: wrap; }
      nav a { color: var(--accent); text-decoration: none; }
      nav a:hover { color: var(--accent-hover); text-decoration: underline; }
      .theme-select { background: var(--surface-muted); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 0.3rem 0.55rem; font-size: 0.78rem; font-family: var(--font-sans); cursor: pointer; }
      main { max-width: 72rem; margin: 2.25rem auto; padding: 0 1.5rem 5rem; }
      .lead-hero { border-bottom: 1px solid var(--border); padding-bottom: 2.75rem; margin-bottom: 2.5rem; }
      .lead-grid { display: grid; gap: 2rem; grid-template-columns: minmax(0, 1fr); align-items: stretch; }
      @media (min-width: 960px) { .lead-grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 3rem; } }
      .lead-copy { display: flex; flex-direction: column; justify-content: space-between; }
      .lead-copy h1 { font-family: var(--font-serif); font-size: clamp(1.9rem, 3.2vw, 2.55rem); line-height: 1.14; margin: 0.5rem 0 1rem; font-weight: 600; }
      .lead-copy h1 a { color: var(--text); text-decoration: none; }
      .lead-copy h1 a:hover { color: var(--accent); }
      .lead-abstract { font-size: 1rem; color: var(--text-muted); margin: 0 0 1.5rem; }
      .lead-footer { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 1rem; border-top: 1px solid var(--border); padding-top: 1.1rem; }
      .author-row { display: flex; align-items: center; gap: 0.75rem; }
      .author-avatar { width: 40px; height: 40px; border-radius: 9999px; object-fit: cover; border: 1px solid var(--border); }
      .author-name { font-size: 0.875rem; font-weight: 600; color: var(--text); }
      .author-aff { font-size: 0.75rem; color: var(--text-muted); }
      .read-cta { display: inline-flex; align-items: center; background: var(--text); color: var(--bg); padding: 0.55rem 1rem; border-radius: 6px; font-size: 0.84rem; font-weight: 600; text-decoration: none; }
      .read-cta:hover { background: var(--accent); color: #ffffff; }
      .lead-plate img { width: 100%; aspect-ratio: 16 / 10; object-fit: cover; border-radius: 6px; border: 1px solid var(--border); display: block; }
      .plate-caption { margin-top: 0.45rem; font-family: var(--font-serif); font-style: italic; font-size: 0.78rem; color: var(--text-muted); }
      .search-filter-bar { display: flex; flex-wrap: wrap; gap: 1rem; align-items: center; justify-content: space-between; margin-bottom: 1.75rem; }
      .search-input { width: 100%; max-width: 22rem; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 0.55rem 0.9rem; font-size: 0.875rem; color: var(--text); }
      .search-input:focus { outline: 2px solid var(--accent); }
      .categories-row { display: flex; flex-wrap: wrap; gap: 0.45rem; }
      .cat-btn { background: var(--surface); border: 1px solid var(--border); color: var(--text-muted); padding: 0.35rem 0.8rem; border-radius: 6px; font-size: 0.8rem; font-weight: 500; cursor: pointer; }
      .cat-btn:hover { background: var(--surface-muted); color: var(--text); }
      .cat-btn.active { background: var(--accent); border-color: var(--accent); color: #FFFFFF; }
      .monographs-grid { display: grid; gap: 1.5rem; }
      .monograph-card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 1.5rem; display: grid; gap: 1.5rem; grid-template-columns: minmax(0, 1fr); align-items: start; }
      @media (min-width: 720px) { .monograph-card:has(.card-thumb) { grid-template-columns: 220px minmax(0, 1fr); } }
      .card-thumb { display: block; border-radius: 6px; overflow: hidden; border: 1px solid var(--border); aspect-ratio: 4 / 3; }
      .card-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .card-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 0.45rem; font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.5rem; }
      .cat-text { color: var(--accent); font-weight: 600; }
      .category-badge { display: inline-block; background: var(--surface-muted); color: var(--text); padding: 0.15rem 0.55rem; border-radius: 4px; font-weight: 600; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.03em; }
      .monograph-card h2 { font-family: var(--font-serif); font-size: 1.45rem; line-height: 1.25; margin: 0 0 0.6rem; }
      .monograph-card h2 a { color: var(--text); text-decoration: none; }
      .monograph-card h2 a:hover { color: var(--accent); }
      .abstract { color: var(--text-muted); font-size: 0.92rem; line-height: 1.65; margin: 0 0 1rem; }
      .card-footer { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 0.75rem; border-top: 1px solid var(--border); padding-top: 0.85rem; font-size: 0.82rem; }
      .byline { color: var(--text-muted); }
      .byline strong { color: var(--text); }
      .tags-row { display: flex; flex-wrap: wrap; gap: 0.35rem; }
      .tag { font-family: var(--font-mono); font-size: 0.72rem; color: var(--text-muted); background: var(--surface-muted); padding: 0.1rem 0.4rem; border-radius: 4px; }
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
          <span class="brand-sub">Open Scientific Monographs · LaTeX</span>
        </a>
        <nav>
          <a href="./index.html">Journal</a>
          <a href="./rss.xml">RSS Feed</a>
          <a href="./sitemap.xml">Sitemap</a>
          <select aria-label="Color theme" class="theme-select" id="themeSelect">
            <option value="">System Theme</option>
            <option value="archival-paper">Archival Paper</option>
            <option value="sepia-folio">Sepia Folio</option>
            <option value="obsidian-ink">Obsidian Ink</option>
            <option value="midnight-observatory">Midnight Observatory</option>
          </select>
        </nav>
      </div>
    </header>
    <main>
      ${leadHeroHtml}
      <div class="search-filter-bar">
        <input type="text" id="searchInput" class="search-input" placeholder="Search monographs, authors, tags..." aria-label="Search monographs" />
        <div class="categories-row" id="categoriesRow">
          ${categoryButtons}
        </div>
      </div>

      <div class="monographs-grid" id="monographsGrid">
${cardsHtml}
      </div>
    </main>
    <footer>
      <span>AmplitudeLand · GitHub Pages Static Journal</span>
      <div class="footer-links">
        <a href="./rss.xml">RSS Feed</a>
        <a href="./sitemap.xml">Sitemap</a>
        <a href="${escapeHtml(cleanBase)}/">${escapeHtml(cleanBase.replace(/^https?:\/\//, ''))}</a>
      </div>
    </footer>
    <script>
      (function () {
        var select = document.getElementById('themeSelect');
        if (select) {
          var saved = localStorage.getItem('amplitudeland_pages_theme') || '';
          select.value = saved;
          select.addEventListener('change', function () {
            var val = select.value;
            if (val) {
              document.documentElement.setAttribute('data-theme', val);
              localStorage.setItem('amplitudeland_pages_theme', val);
            } else {
              document.documentElement.removeAttribute('data-theme');
              localStorage.removeItem('amplitudeland_pages_theme');
            }
          });
        }
        var searchInput = document.getElementById('searchInput');
        var catBtns = document.querySelectorAll('.cat-btn');
        var cards = document.querySelectorAll('.monograph-card');
        var activeCategory = 'all';

        function filterCards() {
          var query = (searchInput.value || '').toLowerCase().trim();
          cards.forEach(function (card) {
            var cat = card.getAttribute('data-category');
            var text = card.getAttribute('data-search') || '';
            var matchesCat = activeCategory === 'all' || cat === activeCategory;
            var matchesQuery = !query || text.includes(query);
            card.style.display = (matchesCat && matchesQuery) ? '' : 'none';
          });
        }

        searchInput.addEventListener('input', filterCards);
        catBtns.forEach(function (btn) {
          btn.addEventListener('click', function () {
            catBtns.forEach(function (b) { b.classList.remove('active'); });
            btn.classList.add('active');
            activeCategory = btn.getAttribute('data-cat') || 'all';
            filterCards();
          });
        });
      })();
    </script>
  </body>
</html>`;
}

export function generateNotFoundHtml(pagesUrl: string): string {
  const cleanBase = pagesUrl.replace(/\/+$/, '');
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Page Not Found — AmplitudeLand</title>
    ${THEME_INIT_SCRIPT}
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=Plus+Jakarta+Sans:wght@400;600&display=swap" rel="stylesheet" />
    <style>${SHARED_THEME_VARS_CSS}
      .wrap { max-width: 36rem; margin: 7rem auto; padding: 2.5rem; text-align: center; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; }
      h1 { font-family: var(--font-serif); font-size: 2rem; margin: 0 0 0.75rem; }
      p { color: var(--text-muted); margin: 0 0 1.75rem; font-size: 0.95rem; }
      a { display: inline-block; background: var(--accent); color: #ffffff; text-decoration: none; padding: 0.6rem 1.2rem; border-radius: 6px; font-weight: 600; font-size: 0.875rem; }
    </style>
  </head>
  <body>
    <main class="wrap">
      <h1>Monograph Not Found</h1>
      <p>The requested URL does not match a published AmplitudeLand monograph on ${escapeHtml(cleanBase.replace(/^https?:\/\//, ''))}.</p>
      <a href="${escapeHtml(cleanBase)}/">Return to AmplitudeLand Journal</a>
    </main>
  </body>
</html>`;
}

export function generateSitemapXml(
  publishedArticles: Article[],
  baseUrl: string,
  _options?: { isGitHubPages?: boolean },
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
    const bytes = utf8ByteLength(html);
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
  options: { owner: string; repo: string; customDomain?: string; localAssets?: boolean },
): GitHubPagesBundle {
  const cleanDomain = options.customDomain ? sanitizeCustomDomain(options.customDomain) : '';
  const pagesUrl = computeGitHubPagesUrl(options.owner, options.repo, cleanDomain);
  const localAssets = options.localAssets ?? false;
  const published = articles.filter((a) => a.status === 'published');

  const files: GitHubPagesFile[] = [
    { path: '.nojekyll', content: '' },
    { path: 'index.html', content: generateGitHubPagesIndexHtml(published, pagesUrl, { localAssets }) },
    { path: '404.html', content: generateNotFoundHtml(pagesUrl) },
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
      content: generateStaticArticleHtml(article, pagesUrl, { isGitHubPages: true, localAssets }),
    });
  }

  const totalBytes = files.reduce((acc, f) => acc + utf8ByteLength(f.content), 0);
  return {
    pagesUrl,
    fileCount: files.length,
    totalBytes,
    files,
  };
}

export function generateGitHubPagesWorkflowYaml(branch = 'main'): string {
  const cleanBranch = branch.trim() || 'main';
  return `name: Deploy AmplitudeLand to GitHub Pages

on:
  push:
    branches: ['${cleanBranch}']
  workflow_dispatch:

permissions:
  contents: write
  pages: write
  id-token: write

concurrency:
  group: 'pages'
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    outputs:
      pages_mode: \${{ steps.detect_pages.outputs.mode }}
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install dependencies
        run: |
          if [ -f package-lock.json ]; then
            npm ci --no-audit --no-fund
          else
            npm install --no-audit --no-fund
          fi

      - name: Build static AmplitudeLand GitHub Pages site
        env:
          ADMIN_USERNAME: \${{ vars.ADMIN_USERNAME }}
          ADMIN_LOGIN_KEY: \${{ secrets.ADMIN_LOGIN_KEY }}
        run: npm run build:pages

      - name: Detect GitHub Pages mode
        id: detect_pages
        env:
          GH_TOKEN: \${{ github.token }}
        run: |
          STATUS_CODE=$(curl -sS -o /tmp/pages-info.json -w "%{http_code}" \\
            -H "Accept: application/vnd.github+json" \\
            -H "Authorization: Bearer \${GH_TOKEN}" \\
            "https://api.github.com/repos/\${{ github.repository }}/pages" || echo "000")
          BUILD_TYPE=""
          if [ "$STATUS_CODE" = "200" ]; then
            BUILD_TYPE=$(node -e "try{const d=JSON.parse(require('fs').readFileSync('/tmp/pages-info.json','utf8'));console.log(d.build_type||'');}catch{}")
          fi
          echo "Pages API HTTP status: $STATUS_CODE, build_type: \${BUILD_TYPE:-none}"
          if [ "$BUILD_TYPE" = "workflow" ]; then
            echo "mode=actions" >> "$GITHUB_OUTPUT"
          else
            echo "mode=branch" >> "$GITHUB_OUTPUT"
          fi

      - name: Setup Pages
        if: steps.detect_pages.outputs.mode == 'actions'
        uses: actions/configure-pages@v5

      - name: Upload Pages artifact
        if: steps.detect_pages.outputs.mode == 'actions'
        uses: actions/upload-pages-artifact@v3
        with:
          path: dist-pages

      - name: Publish static site to gh-pages branch
        env:
          GH_TOKEN: \${{ github.token }}
        run: |
          WORK=$(mktemp -d)
          cp -a dist-pages/. "$WORK"/
          cd "$WORK"
          git init
          git checkout -b gh-pages
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add -A
          SHORT_SHA=$(printf '%s' "\${GITHUB_SHA:-manual}" | cut -c1-7)
          git commit -m "pages(deploy): build AmplitudeLand static site ($SHORT_SHA)"
          git push --force "https://x-access-token:\${GH_TOKEN}@github.com/\${{ github.repository }}.git" gh-pages:refs/heads/gh-pages
          {
            echo "### AmplitudeLand static site built (\\\`$SHORT_SHA\\\`)"
            echo ""
            echo "- \\\`gh-pages\\\` branch updated with the full React AmplitudeLand site (\\\`dist-pages/\\\`)."
            if [ "\${{ steps.detect_pages.outputs.mode }}" = "actions" ]; then
              echo "- Deploying via **GitHub Actions** (\\\`actions/deploy-pages@v4\\\`)."
            else
              echo "- GitHub Pages mode is not set to **GitHub Actions** yet; \\\`gh-pages\\\` branch was updated so **Deploy from a branch -> \\\`gh-pages\\\` / \\\`(root)\\\`** serves the latest site."
            fi
          } >> "$GITHUB_STEP_SUMMARY"

  deploy:
    if: needs.build.outputs.pages_mode == 'actions'
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
`;
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
