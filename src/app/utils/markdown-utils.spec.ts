import { MarkdownUtils } from './markdown-utils';

describe('MarkdownUtils', () => {
  it('extracts explicit [Source: ...] and quoted document citations', () => {
    const text =
      "Employees may work remotely two days per week [Source: Remote_Work_Policy.pdf] as detailed in 'Employee_Handbook.docx'.";
    const citations = MarkdownUtils.extractCitations(text);
    expect(citations).toContain('Remote_Work_Policy.pdf');
    expect(citations).toContain('Employee_Handbook.docx');
  });

  it('detects upload page guidance hints', () => {
    expect(
      MarkdownUtils.hasUploadActionHint(
        'Head to the Upload page and add a document to initialize the store.',
      ),
    ).toBe(true);
    expect(MarkdownUtils.hasUploadActionHint('VPN uses WireGuard on port 51820.')).toBe(false);
  });

  it('escapes untrusted HTML while formatting markdown lists, code, and inline citations', () => {
    const md = [
      '### Setup Steps',
      '- Run `vpn-connect --corp`',
      '- Avoid <script>alert(1)</script> [Source: IT_Guide.pdf]',
    ].join('\n');

    const html = MarkdownUtils.formatMarkdown(md);
    expect(html).toContain('<h4>Setup Steps</h4>');
    expect(html).toContain('<code>vpn-connect --corp</code>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('<span class="citation-inline">IT_Guide.pdf</span>');
  });
});
