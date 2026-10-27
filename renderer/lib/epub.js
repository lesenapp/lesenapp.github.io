// EPUB → { title, content }: the book's chapters in reading order as plain paragraphs.
import { strFromU8, unzipSync } from 'fflate';

const BLOCKS = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, dd, dt';

export function readEpub(bytes) {
  const files = unzipSync(new Uint8Array(bytes));
  const text = (path) => (files[path] ? strFromU8(files[path]) : null);
  const xml = (s, type = 'application/xml') => new DOMParser().parseFromString(s, type);

  const container = text('META-INF/container.xml');
  if (!container) throw new Error('This is not an EPUB file.');
  const opfPath = xml(container).querySelector('rootfile')?.getAttribute('full-path');
  const opf = opfPath && text(opfPath);
  if (!opf) throw new Error('The EPUB has no table of contents.');
  const doc = xml(opf);
  const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';

  const manifest = new Map(
    [...doc.getElementsByTagName('item')].map((i) => [i.getAttribute('id'), i.getAttribute('href')])
  );
  const chapters = [...doc.getElementsByTagName('itemref')]
    .map((r) => manifest.get(r.getAttribute('idref')))
    .filter(Boolean)
    .map((href) => text(base + decodeURIComponent(href.split('#')[0])))
    .filter(Boolean);

  const paragraphs = [];
  for (const html of chapters) {
    const page = xml(html, 'text/html');
    const blocks = page.body?.querySelectorAll(BLOCKS) ?? [];
    for (const b of blocks) {
      if (b.querySelector(BLOCKS)) continue; // only innermost blocks, so nothing is doubled
      const t = b.textContent.replace(/\s+/g, ' ').trim();
      if (t) paragraphs.push(t);
    }
  }
  if (!paragraphs.length) throw new Error('No text found in this EPUB.');

  const title = doc.getElementsByTagName('dc:title')[0]?.textContent.trim();
  return { title, content: paragraphs.join('\n\n') };
}
