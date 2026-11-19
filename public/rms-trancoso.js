/* Níveis tarifários do Trancoso, a partir da captura WEB. */
const RmsTrancoso=(()=>{
  // Períodos inferidos da grade WEB importada do Trancoso.
  const periods=[
    ['FE26','Feriados 2º semestre 2026','2026-11-19','2026-11-22'],
    ['BT26','Baixa Temporada 2026','2026-11-23','2026-12-17'],
    ['NT26','Natal 2026','2026-12-18','2026-12-24'],
    ['RE26','Réveillon 2026','2026-12-25','2027-01-01'],
    ['TR2701','Transição de Réveillon 2027','2027-01-02','2027-01-02'],
    ['AT27','Alta Temporada 2027','2027-01-03','2027-02-04'],
    ['CA27','Carnaval 2027','2027-02-05','2027-02-12'],
    ['BT127','Baixa Temporada · 1º semestre 2027','2027-02-13','2027-03-24'],
    ['FE127','Feriados · 1º semestre 2027','2027-03-25','2027-03-28'],
    ['BT127B','Baixa Temporada · março a maio 2027','2027-03-29','2027-05-25'],
    ['FE127','Feriados · 1º semestre 2027','2027-05-26','2027-05-30'],
    ['BT127','Baixa Temporada · 1º semestre 2027','2027-05-31','2027-06-30'],
    ['JU27','Julho 2027','2027-07-01','2027-07-31'],
    ['BT227','Baixa Temporada · 2º semestre 2027','2027-08-01','2027-09-02'],
    ['FE227','Feriados · 2º semestre 2027','2027-09-03','2027-09-07'],
    ['BT227','Baixa Temporada · 2º semestre 2027','2027-09-08','2027-10-01'],
    ['SC27','Saco Cheio 2027','2027-10-02','2027-10-17'],
    ['BT227','Baixa Temporada · 2º semestre 2027','2027-10-18','2027-10-28'],
    ['FE227','Feriados · 2º semestre 2027','2027-10-29','2027-11-02'],
    ['BT227','Baixa Temporada · 2º semestre 2027','2027-11-03','2027-11-11'],
    ['FE227','Feriados · 2º semestre 2027','2027-11-12','2027-11-15'],
    ['BT227','Baixa Temporada · 2º semestre 2027','2027-11-16','2027-12-17'],
    ['NT27','Natal 2027','2027-12-18','2027-12-24'],
    ['RE27','Réveillon 2027','2027-12-25','2028-01-03'],
    ['AT28','Alta Temporada 2028','2028-01-04','2028-02-04'],
    ['MT28','Média Temporada 2028','2028-02-05','2028-02-25'],
    ['CA28','Carnaval 2028','2028-02-26','2028-03-04'],
    ['BT128','Baixa Temporada · 1º semestre 2028','2028-03-05','2028-04-08']
  ];
  const weekday=iso=>(new Date(iso+'T00:00:00Z').getUTCDay()+6)%7;
  const levelFor=night=>periods.find(([, ,start,end])=>start<=night&&night<=end)?.[0];
  const cellKey=(level,room,occupancy,day)=>JSON.stringify([level,room,occupancy,day]);
  const isAdult=occupancy=>/^\d+\s+Pax$/i.test(occupancy);
  return {periods,weekday,levelFor,cellKey,isAdult};
})();
if(typeof module!=='undefined')module.exports=RmsTrancoso;
