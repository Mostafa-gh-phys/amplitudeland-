import { Eye, FileCode2, Plus, Save, Send, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import type { CategorySummary } from '../api/client.ts';
import {
  countLatexEquations,
  estimateReadingTime,
  serializeArticleMarkdown,
  slugify,
} from '../lib/frontmatter.ts';
import { renderMarkdownLatex } from '../lib/markdownLatex.ts';
import type { Article, ArticleInput, ArticleStatus } from '../lib/types.ts';

interface LatexEditorProps {
  initialArticle: Article | null;
  categories: CategorySummary[];
  saving: boolean;
  canPublish?: boolean;
  onCreateCategory: (name: string) => Promise<void>;
  onSave: (input: ArticleInput, articleId?: string) => Promise<void>;
  onCancel: () => void;
}

const COVER_PRESETS = [
  { label: 'None', value: '' },
  {
    label: 'Quantum Interferometer Plate',
    value: '/src/assets/images/hero_quantum_lattice_1795515080583.jpg',
  },
  {
    label: 'Fluid Vorticity Streamlines',
    value: '/src/assets/images/article_navier_stokes_1795515079471.jpg',
  },
  {
    label: 'Topological Manifold Sculpture',
    value: '/src/assets/images/article_category_theory_1795515079069.jpg',
  },
];

const LATEX_SNIPPETS = [
  { label: 'Inline $...$', snippet: '$E = mc^2$' },
  {
    label: 'Display $$...$$',
    snippet: '\n$$\n\\nabla \\times \\mathbf{E} = -\\frac{\\partial \\mathbf{B}}{\\partial t}\n$$\n',
  },
  { label: 'Integral', snippet: '\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}' },
  {
    label: 'Matrix',
    snippet:
      '\n$$\n\\mathbf{A} = \\begin{pmatrix} \\lambda_1 & 0 \\\\ 0 & \\lambda_2 \\end{pmatrix}\n$$\n',
  },
  {
    label: 'Code Block',
    snippet: '\n```python\nimport numpy as np\nx = np.linspace(0, 1, 100)\n```\n',
  },
];

export function LatexEditor({
  initialArticle,
  categories,
  saving,
  canPublish = true,
  onCreateCategory,
  onSave,
  onCancel,
}: LatexEditorProps) {
  const [title, setTitle] = useState(initialArticle?.title || '');
  const [slug, setSlug] = useState(initialArticle?.slug || '');
  const [slugTouched, setSlugTouched] = useState(Boolean(initialArticle));
  const [abstract, setAbstract] = useState(initialArticle?.abstract || '');
  const [category, setCategory] = useState(
    initialArticle?.category || categories[0]?.name || 'Quantum Physics',
  );
  const [tags, setTags] = useState<string[]>(initialArticle?.tags || []);
  const [tagDraft, setTagDraft] = useState('');
  const [author, setAuthor] = useState(initialArticle?.author || 'Dr. Elena Rostova');
  const [authorAffiliation, setAuthorAffiliation] = useState(
    initialArticle?.authorAffiliation || 'Institute for Quantum Optics, Zurich',
  );
  const [doi, setDoi] = useState(initialArticle?.doi || '');
  const [coverImage, setCoverImage] = useState(initialArticle?.coverImage || '');
  const [body, setBody] = useState(
    initialArticle?.body ||
      `## 1. Formulation\n\nConsider a system governed by the Hamiltonian operator $\\hat{H}$:\n\n$$\ni\\hbar \\frac{\\partial}{\\partial t} |\\psi(t)\\rangle = \\hat{H} |\\psi(t)\\rangle\n$$\n\n## 2. Numerical Results\n\nSummarize derivations, citations, and empirical bounds here.`,
  );
  const [commitMessage, setCommitMessage] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [previewMode, setPreviewMode] = useState<'rendered' | 'frontmatter'>('rendered');
  const [validationError, setValidationError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const effectiveSlug = slugTouched ? slugify(slug || title) : slugify(title);

  const compiledHtml = useMemo(() => {
    try {
      return renderMarkdownLatex(body);
    } catch {
      return '<p>LaTeX parse warning — verify brace balance.</p>';
    }
  }, [body]);

  const frontmatterSource = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return serializeArticleMarkdown({
      title: title || 'Untitled Monograph',
      slug: effectiveSlug,
      abstract,
      category,
      tags,
      status: initialArticle?.status || 'draft',
      author,
      authorAffiliation,
      publishedAt: initialArticle?.publishedAt || today,
      updatedAt: today,
      doi: doi || undefined,
      coverImage: coverImage || undefined,
      coverCaption: initialArticle?.coverCaption,
      body,
    });
  }, [
    title,
    effectiveSlug,
    abstract,
    category,
    tags,
    initialArticle,
    author,
    authorAffiliation,
    doi,
    coverImage,
    body,
  ]);

  const equationCount = useMemo(() => countLatexEquations(body), [body]);
  const readingTime = useMemo(() => estimateReadingTime(body), [body]);

  const handleTitleChange = (val: string) => {
    setTitle(val);
    if (!slugTouched) {
      setSlug(slugify(val));
    }
  };

  const handleAddTag = () => {
    const cleaned = tagDraft.trim();
    if (!cleaned) return;
    if (!tags.some((t) => t.toLowerCase() === cleaned.toLowerCase())) {
      setTags((prev) => [...prev, cleaned]);
    }
    setTagDraft('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags((prev) => prev.filter((t) => t !== tagToRemove));
  };

  const handleInsertSnippet = (snippet: string) => {
    const el = textareaRef.current;
    if (!el) {
      setBody((prev) => `${prev}${snippet}`);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + snippet + body.slice(end);
    setBody(next);
    window.requestAnimationFrame(() => {
      el.focus();
      const cursor = start + snippet.length;
      el.setSelectionRange(cursor, cursor);
    });
  };

  const handleCreateInlineCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    setValidationError(null);
    try {
      await onCreateCategory(name);
      setCategory(name);
      setNewCategoryName('');
      setShowNewCategory(false);
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : 'Unable to create category.');
    }
  };

  const handleSubmit = async (targetStatus: ArticleStatus) => {
    setValidationError(null);
    if (!title.trim()) {
      setValidationError('Please enter a monograph title before saving.');
      return;
    }
    if (!body.trim()) {
      setValidationError('Monograph body cannot be empty.');
      return;
    }

    try {
      await onSave(
        {
          title: title.trim(),
          slug: effectiveSlug,
          abstract: abstract.trim() || `${title.trim()} — scientific monograph.`,
          category,
          tags,
          status: targetStatus,
          author: author.trim() || 'Dr. Elena Rostova',
          authorAffiliation: authorAffiliation.trim() || 'AmplitudeLand Fellow',
          doi: doi.trim() || undefined,
          coverImage: coverImage || undefined,
          body,
          commitMessage:
            commitMessage.trim() ||
            `cms(${targetStatus === 'published' ? 'publish' : 'draft'}): ${title.trim()}`,
        },
        initialArticle?.id,
      );
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : 'Unable to save monograph.');
    }
  };

  return (
    <section aria-label="LaTeX Monograph Editor" className="space-y-6">
      {/* Editor Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 pb-4 dark:border-stone-800">
        <div>
          <h2 className="font-editorial text-xl font-semibold text-stone-900 dark:text-stone-100">
            {initialArticle ? 'Edit Monograph' : 'Compose New Monograph'}
          </h2>
          <p className="mt-0.5 text-xs font-mono tabular-nums text-stone-500 dark:text-stone-400">
            content/posts/{effectiveSlug}.md · {equationCount} {equationCount === 1 ? 'equation' : 'equations'} · {readingTime} min read
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {!canPublish && (
            <span className="text-xs text-stone-500 dark:text-stone-400">
              Author role saves drafts · Editor or Admin publishes
            </span>
          )}
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-md border border-stone-300 bg-white px-3.5 py-2 text-xs font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => handleSubmit('draft')}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-3.5 py-2 text-xs font-semibold text-stone-900 hover:bg-stone-100 disabled:opacity-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800"
          >
            <Save className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{saving ? 'Committing...' : 'Save Draft'}</span>
          </button>
          {canPublish && (
            <button
              type="button"
              onClick={() => handleSubmit('published')}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{saving ? 'Publishing...' : 'Publish Monograph'}</span>
            </button>
          )}
        </div>
      </div>

      {validationError && (
        <div
          role="alert"
          className="rounded-md border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200"
        >
          {validationError}
        </div>
      )}

      {/* Metadata Fields */}
      <div className="grid gap-4 rounded-md border border-stone-200 bg-white p-5 sm:grid-cols-2 lg:grid-cols-4 dark:border-stone-800 dark:bg-stone-900/60">
        <div className="sm:col-span-2">
          <label
            htmlFor="editor-title"
            className="mb-1.5 block text-xs font-semibold text-stone-700 dark:text-stone-300"
          >
            Monograph Title
          </label>
          <input
            id="editor-title"
            type="text"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="e.g., Berry Curvature in Floquet Topological Insulators"
            className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-blue-700 focus:outline-none dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
          />
        </div>

        <div>
          <label
            htmlFor="editor-slug"
            className="mb-1.5 block text-xs font-semibold text-stone-700 dark:text-stone-300"
          >
            URL Slug
          </label>
          <input
            id="editor-slug"
            type="text"
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
            placeholder="berry-curvature-floquet"
            className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 font-mono text-xs text-stone-900 focus:border-blue-700 focus:outline-none dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label
              htmlFor="editor-category"
              className="text-xs font-semibold text-stone-700 dark:text-stone-300"
            >
              Category
            </label>
            {canPublish && (
              <button
                type="button"
                onClick={() => setShowNewCategory((prev) => !prev)}
                className="text-xs font-medium text-blue-700 hover:underline dark:text-blue-400"
              >
                {showNewCategory ? 'Cancel' : '+ New'}
              </button>
            )}
          </div>
          {showNewCategory ? (
            <div className="flex gap-1.5">
              <input
                type="text"
                aria-label="New category name"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Astrophysics"
                className="w-full rounded-md border border-stone-300 bg-white px-2.5 py-2 text-xs text-stone-900 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
              />
              <button
                type="button"
                onClick={handleCreateInlineCategory}
                className="rounded-md bg-stone-900 px-2.5 py-2 text-xs font-medium text-white dark:bg-stone-100 dark:text-stone-900"
              >
                Add
              </button>
            </div>
          ) : (
            <select
              id="editor-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-blue-700 focus:outline-none dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
            >
              {categories.map((c) => (
                <option key={c.slug} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="sm:col-span-2">
          <label
            htmlFor="editor-abstract"
            className="mb-1.5 block text-xs font-semibold text-stone-700 dark:text-stone-300"
          >
            Abstract (SEO Meta Description)
          </label>
          <input
            id="editor-abstract"
            type="text"
            value={abstract}
            onChange={(e) => setAbstract(e.target.value)}
            placeholder="Concise 1-2 sentence summary for readers and search engines..."
            className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-blue-700 focus:outline-none dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
          />
        </div>

        <div className="sm:col-span-2">
          <label
            htmlFor="editor-tag-input"
            className="mb-1.5 block text-xs font-semibold text-stone-700 dark:text-stone-300"
          >
            Category Tags
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="editor-tag-input"
              type="text"
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddTag();
                }
              }}
              placeholder="Add tag (e.g. Floquet, Topology)"
              className="min-w-[180px] flex-1 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-blue-700 focus:outline-none dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
            />
            <button
              type="button"
              onClick={handleAddTag}
              className="inline-flex items-center gap-1 rounded-md border border-stone-300 bg-stone-50 px-3 py-2 text-xs font-medium text-stone-800 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Add Tag</span>
            </button>
          </div>
          {tags.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1.5 rounded border border-stone-200 bg-stone-50 px-2 py-0.5 text-stone-700 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300"
                >
                  <span>{tag}</span>
                  <button
                    type="button"
                    aria-label={`Remove tag ${tag}`}
                    onClick={() => handleRemoveTag(tag)}
                    className="text-stone-400 hover:text-rose-600 dark:hover:text-rose-400"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div>
          <label
            htmlFor="editor-author"
            className="mb-1.5 block text-xs font-semibold text-stone-700 dark:text-stone-300"
          >
            Author
          </label>
          <input
            id="editor-author"
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
          />
        </div>

        <div>
          <label
            htmlFor="editor-cover"
            className="mb-1.5 block text-xs font-semibold text-stone-700 dark:text-stone-300"
          >
            Editorial Plate
          </label>
          <select
            id="editor-cover"
            value={coverImage}
            onChange={(e) => setCoverImage(e.target.value)}
            className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
          >
            {COVER_PRESETS.map((preset) => (
              <option key={preset.label} value={preset.value}>
                {preset.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="editor-doi"
            className="mb-1.5 block text-xs font-semibold text-stone-700 dark:text-stone-300"
          >
            DOI (Optional)
          </label>
          <input
            id="editor-doi"
            type="text"
            value={doi}
            onChange={(e) => setDoi(e.target.value)}
            placeholder="10.48550/ax.2026.0120"
            className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 font-mono text-xs text-stone-900 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
          />
        </div>

        <div>
          <label
            htmlFor="editor-commit"
            className="mb-1.5 block text-xs font-semibold text-stone-700 dark:text-stone-300"
          >
            Git Commit Message
          </label>
          <input
            id="editor-commit"
            type="text"
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder="cms(update): refine derivation"
            className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 font-mono text-xs text-stone-900 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
          />
        </div>
      </div>

      {/* Split-Pane LaTeX + Markdown Workbench */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Left Pane: Markdown + LaTeX Source */}
        <div className="flex flex-col rounded-md border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900/60">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 px-3 py-2 dark:border-stone-800">
            <span className="text-xs font-semibold text-stone-700 dark:text-stone-300">
              Markdown + LaTeX Source
            </span>
            <div className="flex flex-wrap items-center gap-1">
              {LATEX_SNIPPETS.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => handleInsertSnippet(item.snippet)}
                  className="rounded border border-stone-200 bg-stone-50 px-2 py-1 text-[11px] font-mono text-stone-700 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <label htmlFor="latex-body-textarea" className="sr-only">
            Monograph Markdown and LaTeX body
          </label>
          <textarea
            id="latex-body-textarea"
            ref={textareaRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={22}
            spellCheck={false}
            className="min-h-[480px] w-full flex-1 resize-y bg-transparent p-4 font-mono text-xs leading-relaxed text-stone-900 focus:outline-none dark:text-stone-100"
          />
        </div>

        {/* Right Pane: Live KaTeX Preview / YAML Frontmatter */}
        <div className="flex flex-col rounded-md border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900/60">
          <div className="flex items-center justify-between border-b border-stone-200 px-3 py-2 dark:border-stone-800">
            <span className="text-xs font-semibold text-stone-700 dark:text-stone-300">
              {previewMode === 'rendered' ? 'Live KaTeX Preview' : 'Git Markdown File Preview'}
            </span>
            <div className="flex items-center gap-1 rounded bg-stone-100 p-0.5 dark:bg-stone-800">
              <button
                type="button"
                onClick={() => setPreviewMode('rendered')}
                className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-[11px] font-medium ${
                  previewMode === 'rendered'
                    ? 'bg-white text-stone-900 shadow-xs dark:bg-stone-900 dark:text-stone-100'
                    : 'text-stone-600 dark:text-stone-400'
                }`}
              >
                <Eye className="h-3 w-3" aria-hidden="true" />
                <span>Rendered</span>
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode('frontmatter')}
                className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-[11px] font-medium ${
                  previewMode === 'frontmatter'
                    ? 'bg-white text-stone-900 shadow-xs dark:bg-stone-900 dark:text-stone-100'
                    : 'text-stone-600 dark:text-stone-400'
                }`}
              >
                <FileCode2 className="h-3 w-3" aria-hidden="true" />
                <span>Git .md</span>
              </button>
            </div>
          </div>

          <div className="max-h-[540px] flex-1 overflow-y-auto p-5">
            {previewMode === 'rendered' ? (
              <div
                data-testid="live-latex-preview"
                className="scientific-prose text-stone-800 dark:text-stone-200"
                dangerouslySetInnerHTML={{ __html: compiledHtml }}
              />
            ) : (
              <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-stone-700 dark:text-stone-300">
                {frontmatterSource}
              </pre>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
