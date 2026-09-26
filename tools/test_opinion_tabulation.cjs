const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const server=require('../server').__test;
const sandbox=vm.createContext({});
vm.runInContext(fs.readFileSync('google-apps-script/operacional_opinarios_drive.gs','utf8')+'\nthis.api={profiles:OPINARIOS_FORM_PROFILES,headers:OPINARIOS_HEADERS,apply:applyOmrRatings_,row:buildOpinionRow_,score:calculateOpinionScore_};',sandbox);
const script=sandbox.api,options=['Excelente','Muito bom','Bom','Regular'],scores=[100,75,50,25];
const file={getId:()=> 'test-photo',getName:()=> '20260825-test.jpg',getUrl:()=> 'https://example.invalid/photo'};
let tested=0;
for(const [hotel,p] of Object.entries(script.profiles)){
 const profile=server.opinionOmrProfile({hotelSlug:p.slug});
 assert.deepEqual(profile.fields.map(f=>f[0]),Array.from(p.fields,f=>f[0]),hotel+' question order');
 for(const [field,label] of p.fields){
  for(let i=0;i<options.length;i++){
   const extracted={confidence:72,formVersion:'20260729'};
   const ratings=Object.fromEntries(p.fields.map(([key])=>[key,key===field?options[i]:'']));
   script.apply(extracted,{ok:true,confidence:98,ratings},hotel);
   assert.equal(extracted.omrAnswered,1);assert.equal(extracted.score,scores[i]);
   const row=script.row(file,new Date('2026-08-25T15:00:00Z'),hotel,extracted,'Aprovado',{});
   const object=Object.fromEntries(script.headers.map((h,j)=>[h,row[j]]));
   assert.equal(object[label],options[i]);
   const normalized=server.normalizeOperationalOpinion(object);
   assert.equal(normalized.fieldScores[field],scores[i]);
   assert.equal(Object.values(normalized.fieldScores).filter(Number.isFinite).length,1,'No invented rating');
   const summary=server.summarizeOperationalHotel(hotel,[normalized]);
   assert.equal(summary.answeredItems,1);assert.equal(summary.finalScore,scores[i]);
   tested++;
  }
 }
 const blank={confidence:98};script.apply(blank,{ok:true,confidence:98,ratings:{}},hotel);
 assert.equal(blank.omrAnswered,0);assert.equal(blank.score,0);
}
console.log(`PASS: ${tested} question/option round-trips through OMR → Apps Script → sheet columns → dashboard; six hotel profiles; blanks excluded`);
