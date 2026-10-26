import { tokenizeLine } from './editor/asmEditor';

const COLORS: Record<string, string> = {
  ins: '#0000c0', reg: '#800000', num: '#000000', str: '#a00000', com: '#008000', dir: '#000080', lbl: '#000000', txt: '#000000',
};

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function sourceToHtml(text: string, title: string): string {
  const lines = text.split(/\r?\n/).map((line, i) => {
    const body = tokenizeLine(line.replace(/\t/g, '        '))
      .map((t) => `<span style="color:${COLORS[t.cls]}">${esc(t.text)}</span>`)
      .join('');
    return `<span style="color:#808080">${String(i + 1).padStart(2, '0')}</span>  ${body}`;
  });
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font-family:'Courier New',monospace;font-size:13px;margin:16px}pre{margin:0}h1{font:bold 15px sans-serif}</style>
</head><body><h1>${esc(title)}</h1><pre>${lines.join('\n')}</pre></body></html>`;
}

export function exportHtml(text: string, fileName: string): void {
  const html = sourceToHtml(text, fileName);
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.replace(/\.[^.]*$/, '') + '.html';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function printSource(text: string, fileName: string): void {
  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(sourceToHtml(text, fileName));
  doc.close();
  frame.contentWindow!.focus();
  frame.contentWindow!.print();
  setTimeout(() => frame.remove(), 1000);
}
