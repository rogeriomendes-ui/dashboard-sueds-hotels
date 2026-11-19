export const units = [
  ['plaza', 'Sueds Plaza'], ['premium', 'Sueds Premium'],
  ['cabralia', 'Sueds Cabrália'], ['segundo-sol', 'Sueds Segundo Sol'],
  ['trancoso', 'Sueds Trancoso'], ['beach-sueds', 'Beach Club Sueds'],
  ['beach-segundo-sol', 'Beach Club Segundo Sol'], ['casas', 'Casas Sueds'],
  ['experiencias', 'Sueds Experiências'], ['grupo', 'Sueds Grupo'],
  ['hotels', 'Sueds Hotels']
];
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
export function whatsappUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['wa.me', 'api.whatsapp.com', 'web.whatsapp.com', 'chat.whatsapp.com', 'www.whatsapp.com', 'whatsapp.com'].includes(url.hostname) && !url.username && !url.password ? url.href : '';
  } catch {
    return '';
  }
}
export function signatureHtml(data, assetsBase) {
  const whatsapp = whatsappUrl(data.whatsapp);
  const selected = units.find(([id]) => id === data.unit);
  const image = (id, label, width) => `<img src="${escapeHtml(new URL(id + '.png', assetsBase).href)}" alt="${escapeHtml(label)}" width="${width}" border="0" style="display:block;width:${width}px;height:auto;border:0;">`;
  const logos = selected && selected[0] !== 'hotels'
    ? [selected, ['hotels', 'Sueds Hotels']]
    : [['hotels', 'Sueds Hotels']];
  const logoRows = logos.map(([id, label]) =>
    '<tr><td>' + image(id, label, 120) + '</td></tr>'
  ).join('<tr><td height="12" style="height:12px;font-size:1px;line-height:12px;">&nbsp;</td></tr>');
  const spacer = '<img src="' + escapeHtml(new URL('spacer.png', assetsBase).href) + '" width="16" height="1" alt="" border="0">';
  const divider = '<img src="' + escapeHtml(new URL('divider.png', assetsBase).href) + '" width="2" height="112" alt="" border="0">';
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="font-family:Arial,Helvetica,sans-serif;color:#2b3e50;">
    <tr>
      <td valign="middle"><table role="presentation" cellpadding="0" cellspacing="0" border="0">${logoRows}</table></td>
      <td>${spacer}</td><td>${divider}</td><td>${spacer}</td>
      <td valign="middle"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,Helvetica,sans-serif;color:#2b3e50;">
        <tr><td style="font-size:19px;line-height:24px;"><strong><font face="Arial, Helvetica, sans-serif">${escapeHtml(data.name)}</font></strong></td></tr>
        <tr><td style="font-size:14px;line-height:22px;color:#617d88;"><font face="Arial, Helvetica, sans-serif">${escapeHtml(data.role)}</font></td></tr>
        <tr><td height="10"></td></tr>
        <tr><td style="font-size:13px;line-height:20px;"><font face="Arial, Helvetica, sans-serif">${escapeHtml(data.email)}</font></td></tr>
        <tr><td height="6" style="font-size:1px;line-height:6px;"><img src="${escapeHtml(new URL('spacer.png', assetsBase).href)}" width="1" height="6" alt="" border="0"></td></tr>
        <tr><td nowrap style="font-size:13px;line-height:20px;white-space:nowrap;"><font face="Arial, Helvetica, sans-serif">${escapeHtml(data.phone)}</font>${whatsapp ? `&nbsp;&nbsp;<a href="${escapeHtml(whatsapp)}" title="Conversar pelo WhatsApp" style="text-decoration:none;"><img src="${escapeHtml(new URL('whatsapp.png', assetsBase).href)}" width="18" height="18" alt="WhatsApp" border="0" style="vertical-align:middle;"></a>` : ''}</td></tr>
      </table></td>
    </tr>
  </table>`;
}
