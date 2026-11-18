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
export function signatureHtml(data, assetsBase) {
  const selected = units.find(([id]) => id === data.unit);
  const image = (id, label, width) => `<img src="${escapeHtml(new URL(id + '.png', assetsBase).href)}" alt="${escapeHtml(label)}" width="${width}" border="0" style="display:block;width:${width}px;height:auto;border:0;">`;
  const logos = selected && selected[0] !== 'hotels'
    ? [selected, ['hotels', 'Sueds Hotels']]
    : [['hotels', 'Sueds Hotels']];
  const logoRows = logos.map(([id, label]) =>
    '<tr><td>' + image(id, label, 120) + '</td></tr>'
  ).join('<tr><td height="12" style="height:12px;font-size:1px;line-height:12px;">&nbsp;</td></tr>');
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="font-family:Arial,Helvetica,sans-serif;color:#2b3e50;">
    <tr>
      <td valign="middle"><table role="presentation" cellpadding="0" cellspacing="0" border="0">${logoRows}</table></td>
      <td width="16"></td><td width="2" bgcolor="#caa352" style="width:2px;"></td><td width="18"></td>
      <td valign="middle"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,Helvetica,sans-serif;color:#2b3e50;">
        <tr><td style="font-size:19px;line-height:24px;"><strong>${escapeHtml(data.name)}</strong></td></tr>
        <tr><td style="font-size:14px;line-height:22px;color:#617d88;">${escapeHtml(data.role)}</td></tr>
        <tr><td height="10"></td></tr>
        <tr><td style="font-size:13px;line-height:20px;">${escapeHtml(data.email)}</td></tr>
        <tr><td style="font-size:13px;line-height:20px;">${escapeHtml(data.phone)}</td></tr>
      </table></td>
    </tr>
  </table>`;
}