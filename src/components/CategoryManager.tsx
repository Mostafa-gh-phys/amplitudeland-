import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { CategorySummary, TagSummary } from '../api/client.ts';

interface CategoryManagerProps {
  categories: CategorySummary[];
  tags: TagSummary[];
  readOnly?: boolean;
  onCreateCategory: (name: string, description: string) => Promise<void>;
  onUpdateCategory: (slug: string, name: string, description: string) => Promise<void>;
  onDeleteCategory: (slug: string) => Promise<void>;
  onSelectCategoryForJournal?: (categoryName: string) => void;
}

export function CategoryManager({
  categories,
  tags,
  readOnly = false,
  onCreateCategory,
  onUpdateCategory,
  onDeleteCategory,
  onSelectCategoryForJournal,
}: CategoryManagerProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Category name is required.');
      return;
    }
    setBusy(true);
    try {
      await onCreateCategory(name.trim(), description.trim());
      setName('');
      setDescription('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create category.');
    } finally {
      setBusy(false);
    }
  };

  const handleStartEdit = (cat: CategorySummary) => {
    setEditingSlug(cat.slug);
    setEditName(cat.name);
    setEditDesc(cat.description);
  };

  const handleSaveEdit = async (slug: string) => {
    if (!editName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onUpdateCategory(slug, editName.trim(), editDesc.trim());
      setEditingSlug(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update category.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (slug: string) => {
    setBusy(true);
    setError(null);
    try {
      await onDeleteCategory(slug);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete category.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 pb-4 dark:border-stone-800">
        <div>
          <h2 className="font-editorial text-2xl font-semibold text-stone-900 dark:text-stone-100">
            Research Topics &amp; Tag Taxonomy
          </h2>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
            Organize monographs by discipline and inspect tag distribution across published and draft files.
          </p>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200"
        >
          {error}
        </div>
      )}

      {!readOnly && (
        <form
          onSubmit={handleCreate}
          className="grid gap-4 rounded-md border border-stone-200 bg-white p-5 sm:grid-cols-12 sm:items-end dark:border-stone-800 dark:bg-stone-900/60"
        >
          <div className="sm:col-span-4">
            <label
              htmlFor="new-cat-name"
              className="mb-1.5 block text-xs font-semibold text-stone-700 dark:text-stone-300"
            >
              New Category Name
            </label>
            <input
              id="new-cat-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Condensed Matter"
              className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-blue-700 focus:outline-none dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
            />
          </div>
          <div className="sm:col-span-6">
            <label
              htmlFor="new-cat-desc"
              className="mb-1.5 block text-xs font-semibold text-stone-700 dark:text-stone-300"
            >
              Scope Description
            </label>
            <input
              id="new-cat-desc"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Band topology, superconductivity, and lattice gauge models."
              className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-blue-700 focus:outline-none dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
            />
          </div>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Add Category</span>
            </button>
          </div>
        </form>
      )}

      {/* Categories Directory */}
      <div className="overflow-hidden rounded-md border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900/60">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50 text-xs font-semibold text-stone-600 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-400">
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Scope</th>
              <th className="px-4 py-3 text-right">Published</th>
              <th className="px-4 py-3 text-right">Drafts</th>
              {!readOnly && <th className="px-4 py-3 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
            {categories.map((cat) => {
              const isEditing = editingSlug === cat.slug;
              return (
                <tr key={cat.slug} className="hover:bg-stone-50/70 dark:hover:bg-stone-800/40">
                  <td className="px-4 py-3 font-medium text-stone-900 dark:text-stone-100">
                    {isEditing ? (
                      <input
                        type="text"
                        aria-label={`Edit name for ${cat.name}`}
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full rounded border border-stone-300 px-2 py-1 text-sm dark:border-stone-700 dark:bg-stone-950"
                      />
                    ) : onSelectCategoryForJournal ? (
                      <button
                        type="button"
                        onClick={() => onSelectCategoryForJournal(cat.name)}
                        className="text-left font-semibold text-blue-700 hover:underline dark:text-blue-400"
                      >
                        {cat.name}
                      </button>
                    ) : (
                      cat.name
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-stone-600 dark:text-stone-400">
                    {isEditing ? (
                      <input
                        type="text"
                        aria-label={`Edit description for ${cat.name}`}
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        className="w-full rounded border border-stone-300 px-2 py-1 text-xs dark:border-stone-700 dark:bg-stone-950"
                      />
                    ) : (
                      cat.description
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-stone-900 dark:text-stone-100">
                    {cat.publishedCount}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-stone-500 dark:text-stone-400">
                    {cat.draftCount}
                  </td>
                  {!readOnly && (
                    <td className="px-4 py-3 text-right">
                      {isEditing ? (
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(cat.slug)}
                            className="text-xs font-semibold text-blue-700 hover:underline dark:text-blue-400"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingSlug(null)}
                            className="text-xs text-stone-500 hover:underline"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            aria-label={`Rename ${cat.name}`}
                            onClick={() => handleStartEdit(cat)}
                            className="rounded p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-900 dark:hover:bg-stone-800 dark:hover:text-stone-100"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Delete ${cat.name}`}
                            disabled={busy}
                            onClick={() => handleDelete(cat.slug)}
                            className="rounded p-1.5 text-stone-500 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50 dark:hover:bg-rose-950 dark:hover:text-rose-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Tag Index */}
      <section aria-labelledby="tags-index-heading">
        <h3
          id="tags-index-heading"
          className="mb-3 font-editorial text-lg font-semibold text-stone-900 dark:text-stone-100"
        >
          Active Keyword Tags
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {tags.map((tag) => (
            <div
              key={tag.name}
              className="flex items-center justify-between rounded-md border border-stone-200 bg-white px-3.5 py-2.5 text-xs dark:border-stone-800 dark:bg-stone-900/60"
            >
              <span className="font-medium text-stone-800 dark:text-stone-200">{tag.name}</span>
              <span className="font-mono tabular-nums text-stone-500 dark:text-stone-400">
                {tag.count}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
