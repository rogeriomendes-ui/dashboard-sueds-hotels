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
  const email = escapeHtml(data.email);
  const phone = escapeHtml(data.phone);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,Helvetica,sans-serif;color:#2b3e50;background-color:#ffffff;"><tr><td style="padding:0;font-size:19px;line-height:24px;font-weight:bold;">${escapeHtml(data.name)}</td></tr><tr><td height="8"></td></tr><tr><td style="padding:0 0 0px;font-size:13px;line-height:19px;color:#617d88;">${escapeHtml(data.role)}</td></tr><tr><td height="12"></td></tr><tr><td style="padding:0 0 4px;font-size:13px;line-height:20px;">${email}</td></tr><tr><td style="padding:0;font-size:13px;line-height:20px;">${phone}</td></tr><tr><td height="16"></td></tr><tr><td style="border-top:2px solid #caa352;padding-top:16px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="vertical-align:middle;padding-right:18px;">${selected && selected[0] !== 'hotels' ? image(selected[0],selected[1],selected[0].startsWith('beach-') ? 170 : 150) : image('hotels','Sueds Hotels',150)}</td>${selected && selected[0] !== 'hotels' ? `<td style="vertical-align:middle;border-left:1px solid #dfe4e5;padding-left:18px;">${image('hotels','Sueds Hotels',150)}</td>` : ''}</tr></table></td></tr></table>`;
}
