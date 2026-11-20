import { ambiente, portalOrigin, omniOrigin } from "./ambiente.mjs";
import { executar } from "./omnibees.mjs";
import { setTimeout as sleep } from "node:timers/promises";
const {context,omni,portal}=await ambiente();
let closed=false;
context.on("close",()=>{closed=true;});
async function api(body) {
  const response=await context.request.post(portalOrigin+"/api/portal/inventario-pontual",{
    data:body,headers:{Origin:portalOrigin},maxRedirects:0,timeout:30000
  });
  try {
    if(response.status()===401 || response.status()===403) throw Error("Entre no Portal como administrador no Chrome do robô.");
    const result=await response.json();
    if(!response.ok()) throw Error(result.error || "Falha de comunicação com o Portal.");
    return result;
  } finally {await response.dispose();}
}
let lastMessage="";
while(!closed) {
  try {
    if(new URL(omni.url()).origin!==omniOrigin || !await omni.getByText("Tarifários e Disponibilidade",{exact:true}).first().isVisible())
      throw Error("Entre na Omnibees no Chrome do robô.");
    const {job}=await api({action:"claim"});
    if(job) {
      let done=0,activeDay="";
      const report=async(action,message)=>api({action,id:job.id,token:job.token,done,activeDay,message});
      try {
        await executar(omni,job,async(n,date,message)=>{done=n;activeDay=date;await report("progress",message);});
        await report("finish","Ocupados e disponíveis conferidos.");
      } catch(err) {
        await report("failed","Confira a última noite "+activeDay+". "+err.message.split("\n")[0].slice(0,210));
      }
    }
    lastMessage="";
  } catch(err) {
    if(!closed && lastMessage!==err.message) console.error(err.message);
    lastMessage=err.message;
  }
  if(!closed) await sleep(10000);
}
