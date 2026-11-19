import { units, signatureHtml, whatsappUrl } from './signature.mjs';
const form = document.querySelector('#form');
const preview = document.querySelector('#signature');
const status = document.querySelector('#status');
const unit = document.querySelector('#unit');
const whatsapp = document.querySelector('#whatsapp');
for (const [value, label] of units) unit.add(new Option(label, value));
const assetsBase = new URL('assets/', location.href.endsWith('/') || location.pathname.endsWith('.html') ? location.href : location.href + '/');
let revision = 0;
const data = () => Object.fromEntries([...new FormData(form)].map(([key,value]) => [key,value.trim()]));
function render() {
  revision++;
  const values = data();
  whatsapp.setCustomValidity(values.whatsapp && !whatsappUrl(values.whatsapp) ? 'Informe um link HTTPS do WhatsApp, como https://wa.me/5573999999999.' : '');
  preview.innerHTML = signatureHtml({...values,name:values.name || 'Seu nome completo',role:values.role || 'Seu cargo',email:values.email || 'seuemail@seudominio.com.br',phone:values.phone || '(73) 00000-0000'}, assetsBase);
  status.textContent = '';
}
form.addEventListener('input', render);
function selectSignature() {
  const range = document.createRange();
  range.selectNodeContents(preview);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}
document.querySelector('#select').addEventListener('click', () => {
  if (!form.reportValidity()) return;
  selectSignature();
  status.textContent = 'Assinatura selecionada. Pressione Ctrl + C (ou ⌘ + C) e cole no webmail.';
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  const values = data();
  if (['name', 'role', 'email', 'phone', 'unit'].some(key => !values[key])) { status.textContent = 'Preencha os campos obrigatórios, sem usar apenas espaços.'; return; }
  const currentRevision = revision;
  const html = signatureHtml(values, assetsBase);
  const plain = `${values.name}\n${values.role}\n${values.email}\n${values.phone}${values.whatsapp ? '\nWhatsApp: ' + values.whatsapp : ''}\n${units.find(([id])=>id===values.unit)?.[1]}\nSueds Hotels`;
  try {
    await navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([html],{type:'text/html'}),'text/plain':new Blob([plain],{type:'text/plain'})})]);
    status.textContent = currentRevision === revision ? 'Assinatura copiada! Cole no editor de assinatura do webmail e salve.' : 'Os dados mudaram durante a cópia. Clique novamente para copiar a versão atual.';
  } catch {
    selectSignature();
    status.textContent = 'A cópia automática não está disponível. Pressione Ctrl + C (ou ⌘ + C) para copiar a assinatura selecionada.';
  }
});
render();
