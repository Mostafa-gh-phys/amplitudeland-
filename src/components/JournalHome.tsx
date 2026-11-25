import { ArrowRight, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { CategorySummary } from '../api/client.ts';
import type { FontPairingId, ThemeId } from '../lib/appearance.ts';
import type { Article } from '../lib/types.ts';
import { AppearanceMenu } from './AppearanceMenu.tsx';
import { PlateImage } from './PlateImage.tsx';
import { resolveAppAssetUrl } from '../lib/appearance.ts';

interface JournalHomeProps {
  articles: Article[];
  categories: CategorySummary[];
  loading: boolean;
  themeId: ThemeId;
  fontId: FontPairingId;
  onChangeTheme: (id: ThemeId) => void;
  onChangeFont: (id: FontPairingId) => void;
  onOpenArticle: (slug: string) => void;
  onOpenCms: () => void;
}

export function JournalHome({
  articles,
  categories,
  loading,
  themeId,
  fontId,
  onChangeTheme,
  onChangeFont,
  onOpenArticle,
  onOpenCms,
}: JournalHomeProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const publishedArticles = useMemo(
    () => articles.filter((a) => a.status === 'published'),
    [articles],
  );

  const leadArticle = useMemo(
    () => publishedArticles.find((a) => Boolean(a.coverImage)) ?? publishedArticles[0],
    [publishedArticles],
  );
  const secondaryArticles = useMemo(
    () => publishedArticles.filter((a) => a.id !== leadArticle?.id).slice(0, 2),
    [publishedArticles, leadArticle],
  );

  const categoryTabs = useMemo(() => {
    const names = categories
      .filter((c) => c.publishedCount > 0)
      .map((c) => c.name);
    return ['All', ...names];
  }, [categories]);

  const filteredArchive = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return publishedArticles.filter((a) => {
      const catMatch =
        selectedCategory === 'All' ||
        a.category.toLowerCase() === selectedCategory.toLowerCase();
      if (!catMatch) return false;
      if (!q) return true;
      return (
        a.title.toLowerCase().includes(q) ||
        a.abstract.toLowerCase().includes(q) ||
        a.author.toLowerCase().includes(q) ||
        a.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [publishedArticles, selectedCategory, searchQuery]);

  if (loading && publishedArticles.length === 0) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="space-y-8 animate-pulse">
          <div className="h-8 w-64 rounded bg-stone-200 dark:bg-stone-800" />
          <div className="grid gap-8 lg:grid-cols-12">
            <div className="h-72 rounded-md bg-stone-200 lg:col-span-6 dark:bg-stone-800" />
            <div className="h-72 rounded-md bg-stone-200 lg:col-span-6 dark:bg-stone-800" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 pb-20 pt-6 sm:px-6 lg:px-8">
      {/* Masthead Strip & Appearance Controls */}
      <div className="mb-10 flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 pb-4 dark:border-stone-800">
        <p className="text-xs font-medium tracking-wide text-stone-500 dark:text-stone-400">
          Open Scientific Monographs · LaTeX Typesetting · Version-Controlled GitHub CMS
        </p>
        <AppearanceMenu
          themeId={themeId}
          fontId={fontId}
          onChangeTheme={onChangeTheme}
          onChangeFont={onChangeFont}
        />
      </div>

      {publishedArticles.length === 0 ? (
        <section className="rounded-md border border-stone-200 bg-white px-6 py-16 text-center dark:border-stone-800 dark:bg-stone-900/50">
          <h1 className="font-editorial text-2xl font-semibold text-stone-900 dark:text-stone-100">
            No published monographs yet
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-stone-600 dark:text-stone-400">
            All current manuscripts are saved as drafts. Open the CMS Studio to review or publish your first LaTeX monograph.
          </p>
          <button
            type="button"
            onClick={onOpenCms}
            className="mt-6 rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
          >
            Open CMS Studio
          </button>
        </section>
      ) : (
        <>
          {/* Tier 1: Lead Monograph Hero */}
          {leadArticle && (
            <section
              aria-labelledby="lead-monograph-title"
              className="mb-14 border-b border-stone-200 pb-14 dark:border-stone-800"
            >
              <div className="grid items-stretch gap-8 lg:grid-cols-12 lg:gap-12">
                <div className="flex flex-col justify-between lg:col-span-6">
                  <div>
                    <div className="mb-4 flex flex-wrap items-center gap-2 text-xs font-medium text-stone-500 dark:text-stone-400">
                      <span className="text-blue-700 dark:text-blue-400">{leadArticle.category}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{leadArticle.publishedAt}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{leadArticle.readingTimeMinutes} min read</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">
                        {leadArticle.equationCount} {leadArticle.equationCount === 1 ? 'equation' : 'equations'}
                      </span>
                    </div>

                    <h1
                      id="lead-monograph-title"
                      className="font-editorial text-3xl font-semibold leading-[1.14] tracking-tight text-stone-900 sm:text-4xl lg:text-[2.65rem] dark:text-stone-50"
                      style={{ textWrap: 'balance' }}
                    >
                      <button
                        type="button"
                        onClick={() => onOpenArticle(leadArticle.slug)}
                        className="text-left transition-colors hover:text-blue-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700 dark:hover:text-blue-400"
                      >
                        {leadArticle.title}
                      </button>
                    </h1>

                    <p className="mt-5 max-w-2xl text-base leading-relaxed text-stone-600 dark:text-stone-300">
                      {leadArticle.abstract}
                    </p>
                  </div>

                  <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-stone-200 pt-5 dark:border-stone-800">
                    <div className="flex items-center gap-3">
                      {leadArticle.authorAvatar && (
                        <img
                          src={resolveAppAssetUrl(leadArticle.authorAvatar)}
                          alt={leadArticle.author}
                          referrerPolicy="no-referrer"
                          className="h-10 w-10 rounded-full border border-stone-200 object-cover dark:border-stone-700"
                        />
                      )}
                      <div>
                        <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                          {leadArticle.author}
                        </div>
                        <div className="text-xs text-stone-500 dark:text-stone-400">
                          {leadArticle.authorAffiliation}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onOpenArticle(leadArticle.slug)}
                      className="inline-flex items-center gap-2 rounded-md bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 whitespace-nowrap shrink-0 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-blue-500 dark:hover:text-white"
                    >
                      <span>Read Monograph</span>
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div className="lg:col-span-6">
                  <PlateImage
                    src={leadArticle.coverImage}
                    alt={leadArticle.title}
                    caption={leadArticle.coverCaption}
                    aspectClass="aspect-[16/10] lg:h-full lg:min-h-[340px]"
                    className="h-full"
                  />
                </div>
              </div>
            </section>
          )}

          {/* Tier 2: Secondary Featured Papers */}
          {secondaryArticles.length > 0 && (
            <section aria-label="Featured Monographs" className="mb-14 border-b border-stone-200 pb-14 dark:border-stone-800">
              <div className="mb-6 flex items-baseline justify-between">
                <h2 className="font-editorial text-2xl font-semibold text-stone-900 dark:text-stone-100">
                  Recent Monographs
                </h2>
                <span className="text-xs font-mono tabular-nums text-stone-500 dark:text-stone-400">
                  {publishedArticles.length} published
                </span>
              </div>

              <div className="grid gap-10 md:grid-cols-2">
                {secondaryArticles.map((article) => (
                  <article key={article.id} className="group flex flex-col">
                    <button
                      type="button"
                      onClick={() => onOpenArticle(article.slug)}
                      className="mb-4 block text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700"
                    >
                      <PlateImage
                        src={article.coverImage}
                        alt={article.title}
                        caption={article.coverCaption}
                        aspectClass="aspect-[4/3]"
                      />
                    </button>

                    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
                      <span className="font-medium text-blue-700 dark:text-blue-400">{article.category}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{article.publishedAt}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">
                        {article.equationCount} {article.equationCount === 1 ? 'equation' : 'equations'}
                      </span>
                    </div>

                    <h3 className="font-editorial text-xl font-semibold leading-snug text-stone-900 dark:text-stone-100">
                      <button
                        type="button"
                        onClick={() => onOpenArticle(article.slug)}
                        className="text-left transition-colors group-hover:text-blue-700 dark:group-hover:text-blue-400"
                      >
                        {article.title}
                      </button>
                    </h3>

                    <p className="mt-2.5 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
                      {article.abstract}
                    </p>

                    <div className="mt-4 flex items-center justify-between pt-2 text-xs text-stone-500 dark:text-stone-400">
                      <span>{article.author}</span>
                      <button
                        type="button"
                        onClick={() => onOpenArticle(article.slug)}
                        className="font-medium text-stone-900 hover:text-blue-700 dark:text-stone-200 dark:hover:text-blue-400"
                      >
                        Open paper →
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* Tier 3: Category Filter & Full Archival Index */}
          <section aria-labelledby="archive-heading">
            <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <h2
                  id="archive-heading"
                  className="font-editorial text-2xl font-semibold text-stone-900 dark:text-stone-100"
                >
                  Monograph Archive
                </h2>
                <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
                  Filter published articles by research discipline or keyword.
                </p>
              </div>

              <div className="relative w-full sm:w-72">
                <label htmlFor="archive-search" className="sr-only">
                  Search monographs
                </label>
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
                  aria-hidden="true"
                />
                <input
                  id="archive-search"
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search title, author, tag..."
                  className="w-full rounded-md border border-stone-200 bg-white py-2 pl-9 pr-3 text-sm text-stone-900 placeholder:text-stone-400 focus:border-blue-700 focus:outline-none dark:border-stone-800 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-blue-400"
                />
              </div>
            </div>

            {/* Functional Interactive Category Filter Buttons */}
            <div
              role="tablist"
              aria-label="Filter monographs by category"
              className="mb-8 flex flex-wrap items-center gap-1.5 border-b border-stone-200 pb-4 dark:border-stone-800"
            >
              {categoryTabs.map((cat) => {
                const active = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSelectedCategory(cat)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
                        : 'bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-stone-800/70 dark:text-stone-300 dark:hover:bg-stone-800'
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>

            {filteredArchive.length === 0 ? (
              <div className="rounded-md border border-stone-200 bg-white px-6 py-12 text-center dark:border-stone-800 dark:bg-stone-900/40">
                <p className="text-sm font-medium text-stone-800 dark:text-stone-200">
                  No published monographs match your current filter.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory('All');
                    setSearchQuery('');
                  }}
                  className="mt-4 rounded-md border border-stone-300 px-3.5 py-1.5 text-xs font-medium text-stone-800 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800"
                >
                  Clear Filters
                </button>
              </div>
            ) : (
              <div className="divide-y divide-stone-200 border-t border-b border-stone-200 dark:divide-stone-800 dark:border-stone-800">
                {filteredArchive.map((article) => (
                  <article
                    key={article.id}
                    className="grid gap-4 py-6 transition-colors hover:bg-stone-100/60 sm:grid-cols-12 sm:items-baseline sm:px-3 dark:hover:bg-stone-900/40"
                  >
                    <div className="text-xs font-mono tabular-nums text-stone-500 sm:col-span-2 dark:text-stone-400">
                      {article.publishedAt}
                    </div>
                    <div className="sm:col-span-7">
                      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
                        <span className="font-medium text-blue-700 dark:text-blue-400">
                          {article.category}
                        </span>
                        {article.tags.length > 0 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{article.tags.join(', ')}</span>
                          </>
                        )}
                      </div>
                      <h3 className="font-editorial text-lg font-semibold text-stone-900 dark:text-stone-100">
                        <button
                          type="button"
                          onClick={() => onOpenArticle(article.slug)}
                          className="text-left hover:text-blue-700 dark:hover:text-blue-400"
                        >
                          {article.title}
                        </button>
                      </h3>
                      <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
                        {article.abstract}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-4 text-xs text-stone-500 sm:col-span-3 sm:flex-col sm:items-end dark:text-stone-400">
                      <span className="tabular-nums">
                        {article.readingTimeMinutes} min · {article.equationCount} eqs
                      </span>
                      <button
                        type="button"
                        onClick={() => onOpenArticle(article.slug)}
                        className="font-semibold text-blue-700 hover:underline dark:text-blue-400"
                      >
                        Read paper →
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
