const assert = require('node:assert/strict');
const fs = require('node:fs');
const sharp = require('sharp');
const { readOpinionOmr } = require('../server').__test;
const { project, unproject } = require('../lib/opinion-omr-calibration');
const rows = [0.1852,0.2501,0.3191,0.3641,0.4093,0.4531,0.4972,0.5411,0.5850,0.6478,0.6920,0.7324];
const columns = [0.584,0.711,0.838,0.965];
const options = ['Excelente','Muito bom','Bom','Regular'];

async function fixture({ offset=0, missing=false, double=false, blank=false, ink='#222', scale=1, paper='white', rotation=0, rowPositions=rows, hotelSlug='sueds-premium', allFirst=false }={}) {
  const markers = {topLeft:{x:80,y:70},topRight:{x:1100,y:65},bottomLeft:{x:80,y:1620},bottomRight:{x:1100,y:1620}};
  let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1700"><rect width="1200" height="1700" fill="${paper}"/>`;
  for(const p of Object.values(markers)) svg+=`<rect x="${p.x-24}" y="${p.y-24}" width="48" height="48"/>`;
  rowPositions.forEach((v,i)=>columns.forEach((u,j)=>{
    if(missing && i===5) return;
    const p=project(markers,u,v+offset);
    svg+=`<circle cx="${p.x}" cy="${p.y}" r="18" fill="none" stroke="#222" stroke-width="2.5"/>`;
    if(!blank && (j===(allFirst?0:i%4) || double && i===0 && j===1)) svg+=`<path d="M ${p.x-14} ${p.y-14} l 28 28 m 0 -28 l -28 28" fill="none" stroke="${ink}" stroke-width="${allFirst?7:2.5}"/>`;
  }));
  const buffer=await sharp(Buffer.from(svg+'</svg>')).rotate(rotation).resize(Math.round(1200*scale)).png().toBuffer();
  return readOpinionOmr({hotelSlug,formVersion:'20260729',imageBase64:buffer.toString('base64')});
}

async function main(){
  const markers={topLeft:{x:20,y:15},topRight:{x:980,y:30},bottomLeft:{x:40,y:1500},bottomRight:{x:960,y:1490}};
  const uv=unproject(markers,project(markers,.83,.61));
  assert.ok(Math.abs(uv.u-.83)<1e-8 && Math.abs(uv.v-.61)<1e-8);
  for(const config of [{},{offset:-.028},{offset:.022,ink:'#b00000'},{scale:.8},{scale:1.3},{rotation:90},{rotation:180},{paper:'#c3a76b'}]){
    const r=await fixture(config);
    assert.equal(r.ok,true,JSON.stringify(config));
    assert.equal(r.layout.alignmentVerified,true);
    assert.deepEqual(Object.values(r.ratings),rows.map((_,i)=>options[i%4]));
  }
  const blank=await fixture({blank:true});
  assert.equal(blank.ok,true); assert.equal(blank.answered,0);
  const warmBlank=await fixture({blank:true,paper:'#c3a76b'});
  assert.equal(warmBlank.ok,true); assert.equal(warmBlank.answered,0);
  const allFirst=await fixture({allFirst:true,ink:'#1010a0'});
  assert.equal(allFirst.ok,true); assert.deepEqual(Object.values(allFirst.ratings),Array(12).fill('Excelente'));
  const missing=await fixture({missing:true});
  assert.equal(missing.ok,false); assert.equal(missing.answered,0); assert.equal(missing.confidence,0);
  const double=await fixture({double:true});
  assert.equal(double.ratings.generalImpression,''); assert.ok(double.uncertainFields);
  const photo=process.argv[2];
  if(photo){
    const r=await readOpinionOmr({hotelSlug:'sueds-premium',formVersion:'20260729',imageBase64:fs.readFileSync(photo).toString('base64')});
    assert.equal(r.ok,true);
    assert.deepEqual(Object.values(r.ratings),['Muito bom','Muito bom','Muito bom','Muito bom','Muito bom','Muito bom','Bom','Muito bom','Bom','Excelente','','']);
    assert.equal(r.answered,10);
  }
  if(process.argv[3]) {
    const dir=process.argv[3], E='Excelente', M='Muito bom', B='Bom', R='Regular', X='';
    const fixtures=[
      ['1te-kmvntaVc4-FfPVksidVABcLrazZIl','sueds-plaza',[E,E,E,E,M,M,M,X,M,E,X,X]],
      ['1s2cwoLoJdeHVKa0uU7rCSjZWvFc40Mrm','sueds-trancoso',[E,E,E,E,M,E,X,X,E,X]],
      ['11Eee0Qh-Ym-Wedgb3v1exrpJKS0EHhzP','sueds-trancoso',[M,M,E,E,M,E,M,R,M,M]],
      ['1UwXCy8Ls_WrnkIXwqFjNehUZh0rMh-gB','sueds-plaza',[M,M,E,E,M,E,B,X,E,E,X,X]],
      ['1C32PJhB7pdlkO7IJnm1GQ53YDQaRfA1a','sueds-plaza',[E,E,E,E,E,E,E,E,E,E,X,X]],
      ['1kChfWybFa_ZO-s8KL8AwFrJGt24zFP6Y','sueds-plaza',[M,B,X,M,M,M,X,X,X,M,M,M]],
      ['1prZwxs6KJB6K0jHe4YgP2t1jlCmBubVZ','sueds-plaza',[E,E,E,E,E,M,B,M,E,E,E,X]],
      ['1EBp11a48H_f_2Rd1_zFdolezgnZI5ahw','sueds-plaza',[E,M,E,E,M,M,B,R,B,E,R,E]],
      // Mark largely outside the beach-club circle: leave for visual review.
      ['1tSSmZ---ro20u_wOOrhGb-_dG0N1j-hN','sueds-plaza',[E,E,E,E,E,E,E,E,X,E,X,E]],
      ['1qpmqhINNPQfGZB3iUN4coBBygBK9CHpv','sueds-premium',[E,E,E,E,M,E,R,M,E,E,X,X]],
      ['1M9zYC6o6t5BjaT6OpBenGeR7VFsJd24g','sueds-cabralia',[B,B,E,E,R,E,E,B,X,E,E]],
      ['1RYkvIAicAazkuvHhKxWo-Nfte4W5IerM','sueds-plaza',[E,E,E,E,E,E,E,X,X,E,X,E]],
      ['17qccPgmx6Jn1II9KoLhwLdsozvj-qTyU','sueds-premium',[M,M,E,E,M,E,M,M,E,M,X,M]],
      ['1EB6rEvX_43mrMo3KdsUpK8qwHd-SvK_p','sueds-premium',[E,E,E,E,E,E,E,E,E,E,X,E]],
      ['1o3DHxdtDNtzGkTQqGG4HET3zCznlDel7','sueds-premium',Array(12).fill(E)],
      ['186vyit221vHAM4u4uKmSZnZfyUr_IAZQ','sueds-plaza',[E,E,M,E,E,E,B,X,E,E,X,E]],
      ['1UoASvcSJ7vDHzMnB2yrvD_MBKoMvb6mz','sueds-plaza',[E,X,X,X,X,X,E,X,E,E,E,E]],
      ['1EMu8GhaJs11IWNPnjIC8-rPHWbfNgRVL','sueds-plaza',[M,X,E,E,B,E,B,X,E,M,M,B]],
      ['1rZSuxUyQj-fFGJm7LT-5N3-G1IzU9747','sueds-premium',[E,M,E,E,M,E,M,E,M,E,X,X]],
      ['13PuO7iTY2wLkn35YtUWd2xUrwnIal_Ug','sueds-premium',[E,M,E,E,B,E,B,M,E,E,X,E]],
      ['1_1m3or_dzqgnI-pvNJmgP9K2rOBNXOfD','sueds-segundo-sol',[E,E,E,E,M,E,M,E,E,E,X,E]],
      ['1xDQfaTjr8Tx7ivdsFI1SHbqrZbtwvY1D','sueds-cabralia',[X,X,R,X,X,X,R,M,R,E,X]],
      ['12nd5G8joKxqrHPOBoeff7szHlh1rdtUx','sueds-plaza',[E,E,E,E,E,B,E,X,E,E,E,E]],
      ['1oJIOu6ryxFUHZVAGeFz6mkBr15F8_J42','sueds-plaza',[E,E,E,E,E,E,E,X,E,E,X,X]]
    ];
    for(const [id,hotelSlug,expected] of fixtures){
      const result=await readOpinionOmr({hotelSlug,formVersion:'20260729',imageBase64:fs.readFileSync(require('path').join(dir,id+'.jpg')).toString('base64')});
      if(id==='1oJIOu6ryxFUHZVAGeFz6mkBr15F8_J42' && !result.ok) {
        assert.equal(result.answered,0); // Unconfirmed legacy grid must fail closed.
        assert.ok(Object.values(result.ratings).every(value=>value===''));
      } else {
        assert.equal(result.ok,true,id);assert.deepEqual(Object.values(result.ratings),expected,id);
      }
    }
    console.log(`PASS: ${fixtures.length} additional manually checked hotel photos (including edge marks, filled circles, crossed-out rows and square legacy forms)`);
  }
  console.log('PASS: perspective, shifted layouts, red/black ink, image sizes, blanks, ambiguity, invalid grid'+(photo?', real Premium regression':''));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
