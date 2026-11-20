import { chromium } from "playwright-core";
import { join } from "node:path";
import { homedir } from "node:os";
export const portalOrigin = "https://portalsueds.com.br";
export const omniOrigin = "https://myhotel2.omnibees.com";
export async function ambiente() {
  const dir = join(process.env.LOCALAPPDATA || homedir(),"SuedsInventario","Chrome");
  const context = await chromium.launchPersistentContext(dir,{channel:"chrome",headless:false,viewport:{width:1440,height:950}});
  const pages = context.pages();
  const omni = pages.find(p=>p.url().startsWith(omniOrigin+"/")) || await context.newPage();
  const portal = pages.find(p=>p.url().startsWith(portalOrigin+"/")) || pages.find(p=>p!==omni && p.url()==="about:blank") || await context.newPage();
  await Promise.all([omni.goto(omniOrigin),portal.goto(portalOrigin+"/gestores?modulo=inventario")]);
  return {context,omni,portal};
}
