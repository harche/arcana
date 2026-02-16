// Minimal markdown-to-HTML renderer
window.renderMarkdown = function(text) {
  if (!text) return '';

  // Extract code blocks first to protect them from other transformations
  const codeBlocks = [];
  let html = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const placeholder = `%%CODEBLOCK_${codeBlocks.length}%%`;
    const escaped = code.trim()
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    codeBlocks.push(`<pre><code class="language-${lang}">${escaped}</code></pre>`);
    return placeholder;
  });

  // Escape HTML (after extracting code blocks)
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Tables - process before other inline formatting
  html = html.replace(/((?:^\|.+\|[ \t]*\n)+)/gm, (tableBlock) => {
    const rows = tableBlock.trim().split('\n');
    if (rows.length < 2) return tableBlock;

    // Check if second row is a separator (| --- | --- |)
    const isSeparator = /^\|[\s:-]+\|/.test(rows[1]);
    const dataRows = isSeparator ? [rows[0], ...rows.slice(2)] : rows;
    const headerRow = isSeparator ? rows[0] : null;

    let table = '<table>';

    if (headerRow) {
      const cells = headerRow.split('|').filter((_, i, a) => i > 0 && i < a.length - 1);
      table += '<thead><tr>';
      cells.forEach(c => { table += `<th>${c.trim()}</th>`; });
      table += '</tr></thead>';
    }

    table += '<tbody>';
    const startIdx = headerRow ? 1 : 0;
    for (let i = startIdx; i < dataRows.length; i++) {
      const cells = dataRows[i].split('|').filter((_, j, a) => j > 0 && j < a.length - 1);
      table += '<tr>';
      cells.forEach(c => { table += `<td>${c.trim()}</td>`; });
      table += '</tr>';
    }
    table += '</tbody></table>';
    return table;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Blockquotes
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

  // Unordered lists
  html = html.replace(/^[\s]*[-*] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

  // Ordered lists
  html = html.replace(/^[\s]*\d+\. (.+)$/gm, '<li>$1</li>');

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr>');

  // Paragraphs - wrap remaining text lines (skip table/html tags)
  html = html.replace(/^(?!<[a-zht]|%%CODEBLOCK)((?!<\/)[^\n]+)$/gm, '<p>$1</p>');

  // Clean up double paragraph wrapping
  html = html.replace(/<p><(h[1-3]|ul|ol|pre|blockquote|hr|table)/g, '<$1');
  html = html.replace(/<\/(h[1-3]|ul|ol|pre|blockquote|table)><\/p>/g, '</$1>');

  // Restore code blocks
  codeBlocks.forEach((block, i) => {
    html = html.replace(`%%CODEBLOCK_${i}%%`, block);
    // Also handle if it got wrapped in <p>
    html = html.replace(`<p>%%CODEBLOCK_${i}%%</p>`, block);
  });

  return html;
};
