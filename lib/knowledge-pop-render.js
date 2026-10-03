const mammoth = require('mammoth');
const sanitizeHtml = require('sanitize-html');
const { parseDocument } = require('htmlparser2');
const { textContent } = require('domutils');
const PDFDocument = require('pdfkit');

async function wordToHtml(buffer) {
  const converted = await mammoth.convertToHtml({ buffer }, { externalFileAccess: false, convertImage: mammoth.images.dataUri });
  const safe = sanitizeHtml(converted.value, {
    allowedTags: ['h1','h2','h3','h4','h5','h6','p','br','strong','b','em','i','u','ul','ol','li','table','thead','tbody','tr','th','td','blockquote','img','a'],
    allowedAttributes: { a: ['href'], img: ['src','alt'] },
    allowedSchemes: ['https','http','mailto'],
    allowedSchemesByTag: { img: ['data'] },
    allowedSchemesAppliedToAttributes: ['href','src'],
    allowProtocolRelative: false,
    transformTags: {
      img: (tagName, attrs) => ({ tagName, attribs: /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(attrs.src || '') ? { src: attrs.src, alt: attrs.alt || '' } : {} })
    }
  });
  // Word often uses nested tables only to position instructions. Flatten those
  // wrappers so each instruction reflows on a narrow screen.
  return safe.replace(/<\/?(?:table|thead|tbody|tr|th|td)(?:\s[^>]*)?>/gi, '');
}

function pdfFromHtml(html, title) {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true, info: { Title: title, Author: 'SUEDS Hotels' } });
    const chunks = [];
    pdf.on('data', (chunk) => chunks.push(chunk));
    pdf.on('error', reject);
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.fillColor('#075b4e').font('Helvetica-Bold').fontSize(10).text('SUEDS HOTELS · PROCEDIMENTO OPERACIONAL PADRÃO');
    pdf.moveDown(0.7).fillColor('#182321').fontSize(19).text(title);
    pdf.moveDown(0.8);
    const draw = (node, depth = 0) => {
      if (!node || node.type !== 'tag') return;
      if (node.name === 'img') {
        const match = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(node.attribs?.src || '');
        if (match) {
          try { const y = pdf.y; pdf.image(Buffer.from(match[2], 'base64'), 48, y, { fit: [180, 75] }); pdf.y = y + 84; } catch (_) { /* imagem não suportada no PDF */ }
        }
        return;
      }
      if (node.name === 'ul' || node.name === 'ol') {
        let number = 0;
        for (const child of node.children || []) if (child.name === 'li') {
          const value = textContent(child).trim();
          if (value) { number++; pdf.font('Helvetica').fontSize(10.5).fillColor('#182321').text(`${node.name === 'ol' ? `${number}.` : '•'} ${value}`, { indent: 15 + depth * 12, lineGap: 3 }); pdf.moveDown(0.3); }
        }
        pdf.moveDown(0.2); return;
      }
      if (['p','h1','h2','h3','h4','h5','h6','blockquote'].includes(node.name)) {
        for (const image of (node.children || []).filter((item) => item.name === 'img')) draw(image, depth);
        const value = textContent(node).trim();
        if (value) {
          const heading = node.name.startsWith('h');
          pdf.font(heading ? 'Helvetica-Bold' : 'Helvetica').fontSize(heading ? 14 : 10.5).fillColor(heading ? '#075b4e' : '#182321').text(value, { lineGap: 3, indent: node.name === 'blockquote' ? 15 : 0 });
          pdf.moveDown(heading ? 0.6 : 0.45);
        }
        return;
      }
      for (const child of node.children || []) draw(child, depth);
    };
    for (const node of parseDocument(html).children || []) draw(node);
    pdf.end();
  });
}

module.exports = { wordToHtml, pdfFromHtml };
