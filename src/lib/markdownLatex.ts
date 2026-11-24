import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import { slugify } from './frontmatter.ts';

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

function getNodeText(node: HastNode): string {
  if (node.type === 'text' && typeof node.value === 'string') {
    return node.value;
  }
  if (!Array.isArray(node.children)) {
    return '';
  }
  return node.children.map(getNodeText).join('');
}

function rehypeHeadingIds() {
  return (tree: HastNode) => {
    const usedIds = new Map<string, number>();

    const visit = (node: HastNode) => {
      if (
        node.type === 'element' &&
        (node.tagName === 'h2' || node.tagName === 'h3')
      ) {
        const text = getNodeText(node).trim();
        if (text) {
          const base = slugify(text);
          const count = usedIds.get(base) ?? 0;
          usedIds.set(base, count + 1);
          node.properties = node.properties || {};
          node.properties.id = count === 0 ? base : `${base}-${count}`;
        }
      }
      if (Array.isArray(node.children)) {
        for (const child of node.children) {
          visit(child);
        }
      }
    };

    visit(tree);
  };
}

/**
 * Normalizes classic LaTeX delimiters (\[...\], \(...\), and standalone \begin{equation}...\end{equation})
 * outside fenced/inline code blocks into remark-math compatible $$...$$ and $...$.
 */
export function normalizeLatexDelimiters(markdown: string): string {
  const codeSegments: string[] = [];
  const placeholder = (idx: number) => `@@AXIOMATA_CODE_${idx}@@`;

  let protectedMd = markdown.replace(/```[\s\S]*?```|`[^`\n]+`/g, (match) => {
    const idx = codeSegments.length;
    codeSegments.push(match);
    return placeholder(idx);
  });

  // Replace \[ ... \] with $$ ... $$
  protectedMd = protectedMd.replace(/\\\[([\s\S]+?)\\\]/g, (_m, inner: string) => {
    return `\n$$\n${inner.trim()}\n$$\n`;
  });

  // Replace \( ... \) with $...$
  protectedMd = protectedMd.replace(/\\\((.+?)\\\)/g, (_m, inner: string) => {
    return `$${inner.trim()}$`;
  });

  // Wrap standalone \begin{equation|align|gather}... not already wrapped in $$
  protectedMd = protectedMd.replace(
    /(^|\n)(\\begin\{(equation|align|gather|multline)\*?\}[\s\S]+?\\end\{\3\*?\})(?=\n|$)/g,
    (_m, prefix: string, block: string) => `${prefix}$$\n${block}\n$$`,
  );

  // Convert standalone single-line $$...$$ paragraphs to multiline $$\n...\n$$ so remark-math renders display math
  protectedMd = protectedMd.replace(
    /(^|\n)\$\$([^\n]+?)\$\$(?=\n|$)/g,
    (_m, prefix: string, inner: string) => `${prefix}$$\n${inner.trim()}\n$$`,
  );

  return protectedMd.replace(/@@AXIOMATA_CODE_(\d+)@@/g, (_m, idxStr: string) => {
    return codeSegments[Number(idxStr)] ?? '';
  });
}

type SanitizeSchema = NonNullable<Parameters<typeof rehypeSanitize>[0]>;
type KatexPluginOptions = NonNullable<Parameters<typeof rehypeKatex>[0]>;

const katexSanitizeSchema: SanitizeSchema = {
  ...defaultSchema,
  clobberPrefix: '',
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    'math',
    'semantics',
    'mrow',
    'mi',
    'mo',
    'mn',
    'ms',
    'msup',
    'msub',
    'msubsup',
    'mfrac',
    'msqrt',
    'mroot',
    'mtable',
    'mtr',
    'mtd',
    'mtext',
    'mspace',
    'mover',
    'munder',
    'munderover',
    'mpadded',
    'mphantom',
    'menclose',
    'annotation',
    'svg',
    'path',
    'line',
    'rect',
    'g',
  ],
  attributes: {
    ...defaultSchema.attributes,
    '*': [
      ...(defaultSchema.attributes?.['*'] ?? []),
      'className',
      'ariaHidden',
      'aria-hidden',
    ],
    h2: ['id'],
    h3: ['id'],
    span: ['className', 'style', 'ariaHidden', 'aria-hidden'],
    div: ['className', 'style'],
    math: ['xmlns', 'display'],
    annotation: ['encoding'],
    mspace: ['width'],
    mpadded: ['width', 'height', 'depth', 'lspace', 'voffset'],
    svg: ['xmlns', 'width', 'height', 'viewBox', 'preserveAspectRatio'],
    path: ['d'],
    line: ['x1', 'y1', 'x2', 'y2', 'stroke', 'strokeWidth'],
    rect: ['x', 'y', 'width', 'height'],
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height'],
  },
  protocols: {
    ...defaultSchema.protocols,
    href: ['http', 'https', 'mailto'],
    src: ['http', 'https'],
  },
};

const katexOptions: KatexPluginOptions = {
  strict: false,
  output: 'htmlAndMathml',
};

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkRehype, { allowDangerousHtml: false })
  .use(rehypeHeadingIds)
  .use(rehypeKatex, katexOptions)
  .use(rehypeHighlight, { detect: false, ignoreMissing: true })
  .use(rehypeSanitize, katexSanitizeSchema)
  .use(rehypeStringify);

export function renderMarkdownLatex(markdown: string): string {
  const normalized = normalizeLatexDelimiters(markdown);
  const file = processor.processSync(normalized);
  return String(file);
}
