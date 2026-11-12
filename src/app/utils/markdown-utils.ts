export class MarkdownUtils {
  /**
   * Extracts unique source document citations referenced in an AI response,
   * such as `[Source: Remote_Work_Policy.pdf]`, `(Source: Benefits.docx)`,
   * or quoted/inline document filenames (`.pdf`, `.docx`, `.txt`, `.md`, `.csv`).
   */
  static extractCitations(text: string): string[] {
    if (!text) return [];

    const found = new Set<string>();

    // 1. Explicit [Source: ...] or (Source: ...) patterns
    const explicitSourceRegex = /[\[\(]\s*Sources?\s*:\s*([^\]\)]+)[\]\)]/gi;
    let match: RegExpExecArray | null;
    while ((match = explicitSourceRegex.exec(text)) !== null) {
      const rawList = match[1].split(/[,;]/);
      for (const item of rawList) {
        const cleaned = item.trim().replace(/^['"`]|['"`]$/g, '');
        if (cleaned && cleaned.length <= 100) {
          found.add(cleaned);
        }
      }
    }

    // 2. Document filenames mentioned in quotes or backticks (e.g. 'Remote_Work_Policy.pdf')
    const fileRegex = /['"`]([A-Za-z0-9_\-\s]{2,80}\.(?:pdf|docx|doc|txt|md|csv))['"`]/gi;
    while ((match = fileRegex.exec(text)) !== null) {
      const fileName = match[1].trim();
      if (fileName) {
        found.add(fileName);
      }
    }

    return Array.from(found);
  }

  /**
   * Detects when an assistant response instructs the user to visit the Upload page
   * (e.g. when the File Search store is empty, uninitialized, or missing a policy doc).
   */
  static hasUploadActionHint(text: string): boolean {
    if (!text) return false;
    return /\bupload\s+page\b|\bupload\s+a\s+document\b|\buploaded\s+to\s+the\s+knowledge\s+base\b/i.test(
      text,
    );
  }

  /**
   * Converts Markdown text into safe, escaped HTML suitable for prose display.
   * All raw HTML characters are escaped first to prevent XSS injection.
   */
  static formatMarkdown(text: string): string {
    if (!text) return '';

    const normalized = text.replace(/\r\n/g, '\n');

    // Extract fenced code blocks before line-by-line parsing
    const codeBlocks: string[] = [];
    const withPlaceholders = normalized.replace(
      /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g,
      (_full, lang: string, code: string) => {
        const escapedCode = MarkdownUtils.escapeHtml(code.replace(/\n$/, ''));
        const langAttr = lang ? ` class="language-${MarkdownUtils.escapeHtml(lang)}"` : '';
        const index = codeBlocks.length;
        codeBlocks.push(`<pre><code${langAttr}>${escapedCode}</code></pre>`);
        return `\n@@CODE_BLOCK_${index}@@\n`;
      },
    );

    const lines = withPlaceholders.split('\n');
    let result = '';
    let inList = false;
    let listType: 'ul' | 'ol' | null = null;
    let tableRows: string[][] = [];

    const closeOpenList = () => {
      if (inList && listType) {
        result += `</${listType}>`;
        inList = false;
        listType = null;
      }
    };

    const flushTable = () => {
      if (tableRows.length === 0) return;
      const header = tableRows[0];
      const bodyRows = tableRows.slice(1).filter((row) => !row.every((cell) => /^[-:]+$/.test(cell)));

      result += '<div class="prose-table-wrap"><table><thead><tr>';
      for (const cell of header) {
        result += `<th scope="col">${MarkdownUtils.applyInlineStyles(cell)}</th>`;
      }
      result += '</tr></thead>';

      if (bodyRows.length > 0) {
        result += '<tbody>';
        for (const row of bodyRows) {
          result += '<tr>';
          for (let c = 0; c < header.length; c++) {
            result += `<td>${MarkdownUtils.applyInlineStyles(row[c] ?? '')}</td>`;
          }
          result += '</tr>';
        }
        result += '</tbody>';
      }
      result += '</table></div>';
      tableRows = [];
    };

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();

      // Code block placeholder
      const codeMatch = trimmed.match(/^@@CODE_BLOCK_(\d+)@@$/);
      if (codeMatch) {
        closeOpenList();
        flushTable();
        result += codeBlocks[Number(codeMatch[1])] ?? '';
        continue;
      }

      // Markdown table row
      if (trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length > 2) {
        closeOpenList();
        const cells = trimmed
          .slice(1, -1)
          .split('|')
          .map((c) => MarkdownUtils.escapeHtml(c.trim()));
        tableRows.push(cells);
        continue;
      } else {
        flushTable();
      }

      if (!trimmed) {
        closeOpenList();
        continue;
      }

      const escaped = MarkdownUtils.escapeHtml(trimmed);

      // Horizontal rule
      if (/^(?:---|\*\*\*|___)$/.test(escaped)) {
        closeOpenList();
        result += '<hr />';
        continue;
      }

      // Headings (mapped to h3/h4 inside message articles to preserve document heading hierarchy)
      const headingMatch = escaped.match(/^(#{1,4})\s+(.*)$/);
      if (headingMatch) {
        closeOpenList();
        const tag = headingMatch[1].length <= 2 ? 'h3' : 'h4';
        result += `<${tag}>${MarkdownUtils.applyInlineStyles(headingMatch[2])}</${tag}>`;
        continue;
      }

      // Blockquote (escaped `>` becomes `&gt;`)
      if (escaped.startsWith('&gt; ')) {
        closeOpenList();
        const quoteContent = escaped.replace(/^&gt;\s+/, '');
        result += `<blockquote><p>${MarkdownUtils.applyInlineStyles(quoteContent)}</p></blockquote>`;
        continue;
      }

      // Unordered list
      const ulMatch = escaped.match(/^[\*\-]\s+(.*)$/);
      if (ulMatch) {
        if (!inList || listType !== 'ul') {
          closeOpenList();
          result += '<ul>';
          inList = true;
          listType = 'ul';
        }
        result += `<li>${MarkdownUtils.applyInlineStyles(ulMatch[1])}</li>`;
        continue;
      }

      // Ordered list
      const olMatch = escaped.match(/^\d+\.\s+(.*)$/);
      if (olMatch) {
        if (!inList || listType !== 'ol') {
          closeOpenList();
          result += '<ol>';
          inList = true;
          listType = 'ol';
        }
        result += `<li>${MarkdownUtils.applyInlineStyles(olMatch[1])}</li>`;
        continue;
      }

      closeOpenList();
      result += `<p>${MarkdownUtils.applyInlineStyles(escaped)}</p>`;
    }

    closeOpenList();
    flushTable();

    return result;
  }

  private static escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private static applyInlineStyles(escapedLine: string): string {
    // Protect inline `code` spans first so markdown characters inside code aren't mutated
    const inlineCodes: string[] = [];
    let processed = escapedLine.replace(/`([^`]+)`/g, (_m, code: string) => {
      const idx = inlineCodes.length;
      inlineCodes.push(`<code>${code}</code>`);
      return `@@INLINE_CODE_${idx}@@`;
    });

    // Style explicit [Source: ...] inline pills
    processed = processed.replace(
      /\[\s*Sources?\s*:\s*([^\]]+)\]/gi,
      '<span class="citation-inline">$1</span>',
    );

    // Bold: **text** or __text__
    processed = processed.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    processed = processed.replace(/__(.+?)__/g, '<strong>$1</strong>');

    // Italic: *text* (single asterisk)
    processed = processed.replace(/(^|[^\*])\*([^\*\s][^\*]*?)\*/g, '$1<em>$2</em>');

    // Restore inline code spans
    processed = processed.replace(
      /@@INLINE_CODE_(\d+)@@/g,
      (_m, idx: string) => inlineCodes[Number(idx)] ?? '',
    );

    return processed;
  }
}
