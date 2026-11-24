import { ArrowLeft, Check, Copy, Edit3 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { cmsApi } from '../api/client.ts';
import { copyTextSafely } from '../lib/appearance.ts';
import type { Article, TocHeading } from '../lib/types.ts';
import { PlateImage } from './PlateImage.tsx';

interface ArticleReaderProps {
  slug: string;
  onBack: () => void;
  onEditInCms: (article: Article) => void;
}

export function ArticleReader({ slug, onBack, onEditInCms }: ArticleReaderProps) {
  const [article, setArticle] = useState<Article | null>(null);
  const [html, setHtml] = useState<string>('');
  const [toc, setToc] = useState<TocHeading[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [copiedBibtex, setCopiedBibtex] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    cmsApi
      .getArticle(slug)
      .then((res) => {
        if (!active) return;
        setArticle(res.article);
        setHtml(res.html);
        setToc(res.toc);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to load monograph.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [slug]);

  useEffect(() => {
    const onScroll = () => {
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight <= 0) {
        setScrollProgress(0);
        return;
      }
      setScrollProgress(Math.min(100, Math.max(0, (window.scrollY / docHeight) * 100)));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const bibtexCitation = useMemo(() => {
    if (!article) return '';
    const lastName = article.author.split(' ').slice(-1)[0]?.toLowerCase() || 'author';
    const year = article.publishedAt.slice(0, 4) || '2026';
    const key = `${lastName.replace(/[^a-z]/g, '')}${year}${article.slug.split('-')[0] || ''}`;
    return `@article{${key},
  title={${article.title}},
  author={${article.author}},
  journal={AmplitudeLand Scientific Journal},
  year={${year}},
  note={Commit ${article.commitSha}}${article.doi ? `,\n  doi={${article.doi}}` : ''}
}`;
  }, [article]);

  const handleCopyBibtex = async () => {
    if (!bibtexCitation) return;
    const ok = await copyTextSafely(bibtexCitation);
    if (ok) {
      setCopiedBibtex(true);
      window.setTimeout(() => setCopiedBibtex(false), 2000);
    }
  };

  if (loading) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="space-y-6 animate-pulse">
          <div className="h-5 w-36 rounded bg-stone-200 dark:bg-stone-800" />
          <div className="h-12 w-3/4 rounded bg-stone-200 dark:bg-stone-800" />
          <div className="h-64 rounded bg-stone-200 dark:bg-stone-800" />
        </div>
      </main>
    );
  }

  if (error || !article) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="font-editorial text-2xl font-semibold text-stone-900 dark:text-stone-100">
          Monograph unavailable
        </h1>
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
          {error || 'The requested scientific article could not be found.'}
        </p>
        <button
          type="button"
          onClick={onBack}
          className="mt-6 rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white dark:bg-stone-100 dark:text-stone-900"
        >
          Return to Journal
        </button>
      </main>
    );
  }

  return (
    <div className="relative">
      {/* Reading Progress Bar */}
      <div
        aria-hidden="true"
        className="fixed left-0 top-[57px] z-30 h-0.5 bg-blue-700 transition-[width] duration-150 dark:bg-blue-400"
        style={{ width: `${scrollProgress}%` }}
      />

      <main className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-6 lg:px-8">
        {/* Top Utility Strip */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 pb-4 dark:border-stone-800">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 transition-colors hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>Back to Journal</span>
          </button>

          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => onEditInCms(article)}
              className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-800 transition-colors hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
            >
              <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Edit in CMS</span>
            </button>
          </div>
        </div>

        {/* Asymmetric 70 / 30 Reading Canvas */}
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <header className="mb-8">
              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
                <span className="font-semibold text-blue-700 dark:text-blue-400">
                  {article.category}
                </span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">Published {article.publishedAt}</span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{article.readingTimeMinutes} min read</span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">
                  {article.equationCount} {article.equationCount === 1 ? 'equation' : 'equations'}
                </span>
                {article.status === 'draft' && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-semibold text-amber-700 dark:text-amber-400">
                      ▲ Draft Preview
                    </span>
                  </>
                )}
              </div>

              <h1
                className="font-editorial text-3xl font-semibold leading-[1.16] tracking-tight text-stone-900 sm:text-4xl dark:text-stone-50"
                style={{ textWrap: 'balance' }}
              >
                {article.title}
              </h1>

              <div className="mt-5 flex items-center gap-3">
                {article.authorAvatar && (
                  <img
                    src={article.authorAvatar}
                    alt={article.author}
                    referrerPolicy="no-referrer"
                    className="h-10 w-10 rounded-full border border-stone-200 object-cover dark:border-stone-700"
                  />
                )}
                <div>
                  <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                    {article.author}
                  </div>
                  <div className="text-xs text-stone-500 dark:text-stone-400">
                    {article.authorAffiliation}
                  </div>
                </div>
              </div>
            </header>

            {/* Hairline Abstract Callout (no thick left border) */}
            <section
              aria-label="Abstract"
              className="mb-8 border-y border-stone-200 py-5 dark:border-stone-800"
            >
              <div className="mb-1.5 text-xs font-semibold tracking-wide text-stone-500 dark:text-stone-400">
                Abstract
              </div>
              <p className="text-base leading-relaxed text-stone-700 dark:text-stone-300">
                {article.abstract}
              </p>
            </section>

            {article.coverImage && (
              <PlateImage
                src={article.coverImage}
                alt={article.title}
                caption={article.coverCaption}
                aspectClass="aspect-[16/9]"
                className="mb-10"
              />
            )}

            {/* Sanitized KaTeX + Markdown Content */}
            <article
              data-testid="rendered-article-body"
              className="scientific-prose max-w-2xl text-stone-800 dark:text-stone-200"
              dangerouslySetInnerHTML={{ __html: html }}
            />

            {/* BibTeX Citation Block */}
            <section
              aria-labelledby="bibtex-heading"
              className="mt-14 border-t border-stone-200 pt-8 dark:border-stone-800"
            >
              <div className="mb-3 flex items-center justify-between gap-4">
                <h2
                  id="bibtex-heading"
                  className="font-editorial text-lg font-semibold text-stone-900 dark:text-stone-100"
                >
                  Cite This Monograph
                </h2>
                <button
                  type="button"
                  onClick={handleCopyBibtex}
                  className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-800 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
                >
                  {copiedBibtex ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" />
                      <span>Copied BibTeX</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copy BibTeX</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="overflow-x-auto rounded-md border border-stone-200 bg-stone-100/80 p-4 font-mono text-xs leading-relaxed text-stone-800 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300">
                {bibtexCitation}
              </pre>
            </section>
          </div>

          {/* Sticky Right Margin Rail: TOC + Dossier */}
          <aside className="lg:col-span-4">
            <div className="sticky top-20 space-y-8">
              {toc.length > 0 && (
                <nav
                  aria-label="Table of Contents"
                  className="rounded-md border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900/60"
                >
                  <div className="mb-3 text-xs font-semibold tracking-wide text-stone-500 dark:text-stone-400">
                    Contents
                  </div>
                  <ul className="space-y-2 text-sm">
                    {toc.map((heading) => (
                      <li key={heading.id} className={heading.level === 3 ? 'pl-4' : ''}>
                        <a
                          href={`#${heading.id}`}
                          className="block text-stone-700 transition-colors hover:text-blue-700 dark:text-stone-300 dark:hover:text-blue-400"
                        >
                          {heading.text}
                        </a>
                      </li>
                    ))}
                  </ul>
                </nav>
              )}

              <div className="rounded-md border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900/60">
                <div className="mb-3 text-xs font-semibold tracking-wide text-stone-500 dark:text-stone-400">
                  Monograph Dossier
                </div>
                <dl className="divide-y divide-stone-200 text-xs dark:divide-stone-800">
                  <div className="flex justify-between gap-4 py-2.5">
                    <dt className="shrink-0 whitespace-nowrap text-stone-500 dark:text-stone-400">Category</dt>
                    <dd className="font-medium text-stone-900 dark:text-stone-100">
                      {article.category}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4 py-2.5">
                    <dt className="shrink-0 whitespace-nowrap text-stone-500 dark:text-stone-400">Tags</dt>
                    <dd className="text-right font-medium text-stone-800 dark:text-stone-200">
                      {article.tags.length > 0 ? article.tags.join(', ') : 'None'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4 py-2.5">
                    <dt className="shrink-0 whitespace-nowrap text-stone-500 dark:text-stone-400">Git File</dt>
                    <dd className="truncate font-mono text-stone-800 dark:text-stone-200">
                      {article.filePath}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4 py-2.5">
                    <dt className="shrink-0 whitespace-nowrap text-stone-500 dark:text-stone-400">Commit SHA</dt>
                    <dd className="font-mono tabular-nums text-stone-800 dark:text-stone-200">
                      {article.commitSha}
                    </dd>
                  </div>
                  {article.doi && (
                    <div className="flex justify-between gap-4 py-2.5">
                      <dt className="shrink-0 whitespace-nowrap text-stone-500 dark:text-stone-400">Identifier</dt>
                      <dd className="font-mono text-stone-800 dark:text-stone-200">
                        {article.doi}
                      </dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-4 py-2.5">
                    <dt className="shrink-0 whitespace-nowrap text-stone-500 dark:text-stone-400">Updated</dt>
                    <dd className="whitespace-nowrap font-mono tabular-nums text-stone-800 dark:text-stone-200">
                      {article.updatedAt}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
