const assert = require('node:assert/strict');
const { DEPARTMENTS, canManageAnnouncements, canSeeDepartment, summarizeReads, visibleDepartments, listAnnouncements, announcementNotificationSummary } = require('../api/portal/announcements')._test;

async function main() {
  const profile = { id: 'ordinary-user', roles: [] };
  const salesProfile = { id: 'sales-user', roles: [], departments: ['Vendas / Reservas'] };
  const publisherProfile = { id: 'publisher', roles: [], environments: ['comunicados', 'inclusao_comunicados'], departments: ['Vendas / Reservas'] };
  assert.equal(canManageAnnouncements(profile),false,'Ordinary users cannot publish');
  assert.equal(canManageAnnouncements(publisherProfile),true,'The individual environment grant permits publishing');
  assert.equal(canManageAnnouncements({roles:['admin_geral']}),true,'General administrators retain access');
  assert.equal(canSeeDepartment(publisherProfile,'Diretoria'),true,'Authorized publishers can manage all departments');
  assert.deepEqual(visibleDepartments(publisherProfile),DEPARTMENTS);
  assert.ok(DEPARTMENTS.includes('Diretoria'),'Diretoria is available for announcements');
  assert.equal(canSeeDepartment(salesProfile,'Geral'),true);
  assert.equal(canSeeDepartment(salesProfile,'Vendas / Reservas'),true);
  assert.equal(canSeeDepartment(salesProfile,'Diretoria'),false);
  assert.deepEqual(visibleDepartments(salesProfile),['Geral','Vendas / Reservas']);
  assert.deepEqual(visibleDepartments(profile),['Geral'],'Legacy users without an assignment only receive general announcements');
  const receipts = [
    {userId:'ordinary-user',readerName:'Ana',readerEmail:'ana@example.com',readAt:'2026-09-11T12:00:00Z'},
    {userId:'other',readerName:'Bruno',readerEmail:'bruno@example.com',readAt:'2026-09-11T11:00:00Z'},
    {userId:'other',readerName:'Bruno',readerEmail:'bruno@example.com',readAt:'2026-09-11T11:00:00Z'}
  ];
  const summary = summarizeReads(receipts, profile);
  assert.equal(summary.readCount,2,'Repeated acknowledgements count once per person');
  assert.equal(summary.read,true);
  assert.deepEqual(summary.readers.map(r=>r.name),['Ana','Bruno']);
  assert.ok(summary.readers.every(r=>!Object.hasOwn(r,'email')),'Ordinary users receive names only');
  assert.equal(summarizeReads(receipts,{id:'unread-user'}).read,false);
  assert.equal(summarizeReads(receipts,profile,true).readers[0].email,'ana@example.com');

  const snapshots = [
    {source:'portal_announcement',payload:{id:'published',title:'Aviso',status:'published',department:'Geral'}},
    {source:'portal_announcement',payload:{id:'sales',title:'Meta',status:'published',department:'Vendas / Reservas'}},
    {source:'portal_announcement',payload:{id:'board',title:'Diretoria',status:'published',department:'Diretoria'}},
    {source:'portal_announcement',payload:{id:'draft',title:'Rascunho',status:'draft',department:'Geral'}},
    ...Array.from({length:1002},(_,i)=>({source:'portal_announcement_read',payload:{announcementId:'published',userId:'u'+i,readerName:'Pessoa '+i}})),
    {source:'portal_announcement_read',payload:{announcementId:'draft',userId:profile.id,readerName:'Ana'}}
  ];
  const pages = [];
  const db = {from(table) {
    assert.equal(table,'dashboard_snapshots');
    const query = {select(){return query;},in(){return query;},order(){return query;},range(start,end){pages.push(start);return Promise.resolve({data:snapshots.slice(start,end+1)});}};
    return query;
  }};
  const visible = await listAnnouncements(db,profile,false);
  assert.equal(visible.length,1,'Draft announcements and their readers stay hidden');
  assert.equal(visible[0].readCount,1002,'Count includes readers beyond the first database page');
  assert.equal(visible[0].read,false);
  assert.deepEqual(pages,[0,1000]);
  pages.length = 0;
  const notification = await announcementNotificationSummary(db,profile);
  assert.deepEqual(notification,{totalCount:1,unreadCount:1},'Only published, unread announcements appear in the bell');
  assert.deepEqual(pages,[0,1000]);
  pages.length = 0;
  const salesVisible = await listAnnouncements(db,salesProfile,false);
  assert.deepEqual(salesVisible.map(item=>item.id),['published','sales'],'Users receive general and assigned-department announcements only');
  const salesNotification = await announcementNotificationSummary(db,salesProfile);
  assert.deepEqual(salesNotification,{totalCount:2,unreadCount:2},'Bell count follows department visibility');
  console.log('PASS: department visibility, Diretoria, reader counts, draft isolation and pagination.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
