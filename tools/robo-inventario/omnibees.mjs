import { properties, revisar } from "../../public/inventario-regra.mjs";
const exact = (page,text) => page.getByText(text,{exact:true}).filter({visible:true});
const pause = ms => new Promise(resolve=>setTimeout(resolve,ms));
const br = iso => iso.split("-").reverse().join("/");
async function until(read, label, ms=12000) {
  const deadline=Date.now()+ms;
  let last;
  while(Date.now()<deadline) {
    try {const result=await read(); if(result) return result;} catch(e){last=e;}
    await pause(300);
  }
  throw Error(label+(last?": "+last.message.split("\n")[0].slice(0,100):""));
}
async function chooseHotel(page, property) {
  const header = page.locator('[id="sh-context"],[id="context-sh-context"],header,[role="banner"]').filter({hasText:/SUEDS/i}).filter({visible:true});
  const active = async()=>header.getByText(property,{exact:true}).filter({visible:true}).count()===1;
  if (!await active()) {
    const list=Object.values(properties).filter(Boolean).map(p=>p.name).concat(["Sueds Trancoso"]);
    let current;
    for(const name of list) {
      const item=header.getByText(name,{exact:true}).filter({visible:true});
      if(await item.count()===1) {current=item;break;}
    }
    if(!current) throw Error("Abra a Omnibees e selecione uma propriedade do grupo SUEDS.");
    await current.click();
    await exact(page,property).click();
    const confirm=page.getByRole("button",{name:"Sim",exact:true});
    await exact(page,"Tem a certeza que pretende mudar de propriedade?").waitFor();
    await confirm.click();
    await until(active,"Propriedade não confirmada");
  }
  if(!await page.getByRole("heading",{name:"Inventário",exact:true}).isVisible()) {
    if(!await exact(page,"Inventário").count()) await exact(page,"Tarifários e Disponibilidade").click();
    await exact(page,"Inventário").first().click();
    await page.getByRole("heading",{name:"Inventário",exact:true}).waitFor();
  }
  return active;
}
const months=["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const monthNumber=label=>{const [name,year]=label.split(" ");return Number(year)*12+months.indexOf(name);};
async function selectDate(page,date) {
  const input=page.getByPlaceholder("dd/mm/aaaa — dd/mm/aaaa").or(page.locator("input#tdt-excel-from-date"));
  const expected=br(date)+" — "+br(date);
  const value=async()=>(await input.inputValue()).replace(/\s+/g," ").trim();
  if(await value()===expected) return;
  await input.click();
  const apply=page.getByRole("button",{name:"Definir Período",exact:true});
  await apply.waitFor();
  const monthRe=new RegExp("^("+months.join("|")+") \\d{4}$");
  const headings=page.getByText(monthRe).filter({visible:true});
  const target=Number(date.slice(0,4))*12+Number(date.slice(5,7))-1;
  for(let steps=0; steps<30; steps++) {
    const labels=await headings.allTextContents();
    if(labels.length!==2) throw Error("Calendário da Omnibees não reconhecido.");
    const pos=labels.findIndex(label=>monthNumber(label.trim())===target);
    if(pos>=0) {
      const month= headings.nth(pos);
      // Find the calendar panel containing only this month and its day buttons.
      const day=String(Number(date.slice(8)));
      const panel=month.locator("xpath=ancestor::*[.//*[normalize-space(text())='"+day+"']][1]");
      const dayButton=panel.getByText(day,{exact:true}).filter({visible:true});
      if(await dayButton.count()!==1) throw Error("Dia ambíguo no calendário.");
      await dayButton.click(); await dayButton.click();
      await apply.click();
      await until(async()=>await value()===expected,"O período da grade diverge da noite solicitada");
      return;
    }
    const direction=target>monthNumber(labels[1].trim())?1:-1;
    const h=headings.nth(direction>0?1:0);
    const arrow=await h.evaluate((el,dir)=>{
      const box=el.getBoundingClientRect(),y=box.top+box.height/2;
      for(let node=el.parentElement;node;node=node.parentElement) {
        const candidates=[...node.querySelectorAll('button,[role=button],i,svg,a')].filter(n=>{
          const r=n.getBoundingClientRect();
          return r.width>0 && r.width<65 && r.top<=y+7 && r.bottom>=y-7 &&
            (dir>0?r.left>=box.right-2:r.right<=box.left+2);
        });
        if(candidates.length){const r=candidates[0].getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};}
        if(node.tagName==="BODY")break;
      }
      return null;
    },direction);
    if(!arrow) throw Error("Seta do calendário não identificada.");
    await page.mouse.click(arrow.x,arrow.y);
    await until(async()=>String(await headings.allTextContents())!==String(labels),"O calendário não avançou");
  }
  throw Error("Data fora do calendário suportado.");
}
export function parseGrade(text, names) {
  const lines=text.split(/\n|\t/).map(x=>x.trim()).filter(Boolean);
  const namesSeen=[];
  const rows={};
  for(const name of names) {
    const idx=lines.lastIndexOf(name);
    if(idx<0) throw Error("Categoria ausente: "+name);
    const tail=lines.slice(idx+1);
    const occupied=tail.indexOf("Ocupados"),available=tail.indexOf("Total de Disponíveis");
    if(occupied<1 || available!==occupied+2 || !tail.slice(0,occupied).some(s=>s.startsWith("Total de Apartamentos"))) throw Error("Grade inesperada para "+name);
    const parse=s=>/^\d+$/.test(s||"")?Number(s):NaN;
    const row={capacity:parse(tail[occupied-1]),occupied:parse(tail[occupied+1]),available:parse(tail[available+1])};
    if(!Number.isSafeInteger(row.capacity)||row.occupied+row.available!==row.capacity) throw Error("Totais da grade inválidos para "+name);
    namesSeen.push([name,idx]); rows[name]=row;
  }
  if(lines.filter(s=>s==="Ocupados").length!==names.length) throw Error("Categorias da grade divergentes.");
  return {rows,order:namesSeen.sort((a,b)=>a[1]-b[1]).map(([name])=>name)};
}
async function openEditor(page,name,index) {
  const label=exact(page,"Ocupados").nth(index);
  await label.scrollIntoViewIfNeeded();
  const pos=await label.evaluate(el=>{
    const r=el.getBoundingClientRect(),y=r.y+r.height/2;
    for(let node=el.parentElement;node && node.tagName!=="BODY";node=node.parentElement) {
      const n=[...node.querySelectorAll("*")].find(x=>{
        const b=x.getBoundingClientRect();return /^\d+$/.test(x.textContent.trim()) && b.width && b.left>r.left+30 && b.top<=y && b.bottom>=y;
      });
      if(n){const b=n.getBoundingClientRect();return {x:b.x+b.width/2,y};}
    }
  });
  if(!pos)throw Error("Célula de ocupação indisponível para "+name);
  await page.mouse.click(pos.x,pos.y);
  const title=exact(page,"Atualizar Ocupação");
  if(!await title.count()){
    const icon=await page.evaluate(({x,y})=>{
      for(let el=document.elementFromPoint(x,y);el&&el!==document.body;el=el.parentElement){
        const box=el.getBoundingClientRect(); if(box.width>130 || box.height>75)break;
        const i=[...el.querySelectorAll("svg,i,button,[role=button],img")].find(n=>n.getBoundingClientRect().width>0);
        if(i){const b=i.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};}
        if(box.width>=35 && box.height>=23) return {x:box.right-7,y:box.top+7};
      }
    },pos);
    if(!icon)throw Error("Edição da célula não localizada.");
    await page.mouse.click(icon.x,icon.y);
  }
  await title.waitFor();
}
export async function executar(page,job,progress,{simulate=false}={}) {
  const {hotel,start,end,rows}=job,issue=revisar(rows,hotel,start,end);
  if(issue)throw Error(issue);
  page.setDefaultTimeout(9000);
  const config=properties[hotel], names=Object.values(config.rooms);
  const active=await chooseHotel(page,config.name);
  let done=0;
  for(const date of [...new Set(rows.map(r=>r.date))].sort()) {
    await progress(done,date,"Conferindo a grade.");
    await selectDate(page,date);
    const range=br(date)+" — "+br(date);
    const checkScope=async()=>{
      if(new URL(page.url()).origin!=="https://myhotel2.omnibees.com" || !await active()) throw Error("A propriedade ativa mudou.");
      const field=page.getByPlaceholder("dd/mm/aaaa — dd/mm/aaaa").or(page.locator("input#tdt-excel-from-date")).first();
      if((await field.inputValue()).trim()!==range)throw Error("O período ativo mudou.");
    };
    const grade=async()=>{await checkScope(); return parseGrade(await page.locator("body").innerText(),names);};
    const actual=await until(grade,"Grade de inventário indisponível");
    const dayRows=rows.filter(r=>r.date===date);
    for(const r of dayRows) if(actual.rows[config.rooms[r.code]].capacity!==r.capacity) throw Error("Capacidade divergente em "+date+" / "+r.code);
    for(const r of dayRows) {
      const name=config.rooms[r.code];
      const current=await grade();
      if(current.rows[name].capacity!==r.capacity)throw Error("Capacidade alterada em "+name);
      if(current.rows[name].occupied===r.targetOccupied) continue;
      await openEditor(page,name,current.order.indexOf(name));
      const save=page.getByRole("button",{name:"Salvar",exact:true});
      const form=save.locator("xpath=ancestor::*[.//*[normalize-space(text())='Apartamentos Ocupados' or contains(normalize-space(text()),'Apartamentos Ocupados')]][1]");
      await form.waitFor();
      const values=await form.locator("input").evaluateAll(inputs=>inputs.map(i=>i.value));
      const text=await form.innerText();
      if(!values.includes(range) || !(values.includes(name)||text.split("\n").some(s=>s.trim()===name))) throw Error("Hotel, data ou quarto do formulário divergente.");
      const number=form.locator('input[type=number],input[role=spinbutton],input[inputmode=numeric]').filter({visible:true});
      if(await number.count()!==1)throw Error("Campo de ocupação ambíguo.");
      if(simulate){await form.getByRole("button",{name:"Cancelar",exact:true}).click();continue;}
      await number.fill(String(r.targetOccupied));
      if(await number.inputValue()!==String(r.targetOccupied) || !await active()) throw Error("Ocupação ou propriedade divergente.");
      await progress(done,date,"Enviando "+name+".");
      await save.click();
      await save.waitFor({state:"hidden"});
      await until(async()=>{const now=(await grade()).rows[name];return now.occupied===r.targetOccupied && now.available===r.targetAvailable;},"Envio sem confirmação na grade de "+name);
    }
    if(!simulate) {
      const updated=await grade();
      for(const r of dayRows){const v=updated.rows[config.rooms[r.code]];if(v.occupied!==r.targetOccupied||v.available!==r.targetAvailable)throw Error("Revisar "+date+" / "+r.code);}
    }
    await progress(++done,date,simulate?"Simulação sem gravação.":"Noite conferida na Omnibees.");
  }
  return done;
}
