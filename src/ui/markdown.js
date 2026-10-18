// Minimalistický převod Markdownu na HTML pro stránku s pravidly
// (nadpisy, odstavce, odrážky, číslované seznamy, tučné písmo, tabulky).

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) => esc(s)
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/`(.+?)`/g, '<code>$1</code>')
  .replace(/_(.+?)_/g, '<em>$1</em>');

export function markdownToHtml(md) {
  const lines = md.replace(/\r/g, '').split('\n');
  const out = [];
  let list = null;
  let para = [];
  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    if (!t) { flushPara(); closeList(); continue; }
    const head = /^(#{1,4})\s+(.*)$/.exec(t);
    if (head) { flushPara(); closeList(); out.push(`<h${head[1].length}>${inline(head[2])}</h${head[1].length}>`); continue; }
    if (t.startsWith('|')) {
      flushPara(); closeList();
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(lines[i++].trim());
      i--;
      const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const body = rows.filter((r) => !/^\|[\s:|-]+\|$/.test(r));
      out.push('<table>');
      body.forEach((r, k) => {
        const tag = k === 0 ? 'th' : 'td';
        out.push(`<tr>${cells(r).map((c) => `<${tag}>${inline(c)}</${tag}>`).join('')}</tr>`);
      });
      out.push('</table>');
      continue;
    }
    const ul = /^[-*]\s+(.*)$/.exec(t);
    const ol = /^\d+[.)]\s+(.*)$/.exec(t);
    if (ul || ol) {
      flushPara();
      const kind = ul ? 'ul' : 'ol';
      if (list !== kind) { closeList(); out.push(`<${kind}>`); list = kind; }
      out.push(`<li>${inline((ul || ol)[1])}</li>`);
      continue;
    }
    if (t.startsWith('>')) { flushPara(); closeList(); out.push(`<blockquote>${inline(t.replace(/^>\s?/, ''))}</blockquote>`); continue; }
    closeList();
    para.push(t);
  }
  flushPara();
  closeList();
  return out.join('\n');
}
