import assert from "node:assert/strict";
import test from "node:test";
import {linhasInventario} from "../../public/inventario-kpi.mjs";
import {revisar,validPeriod} from "../../public/inventario-regra.mjs";
import {parseGrade} from "./omnibees.mjs";

const hotel="SUEDS PLAZA",date="2027-02-20";
function dados() {
  const roomTypes=[["STD",89,60],["LX",20,19],["MAS",7,6]].map(([code,apartments,available])=>({code,apartments,available}));
  return [{hotel,days:[{date,capturedAt:"2026-11-19T17:10:34Z",available:85,apartments:116,roomTypes}]}];
}
test("Plaza aplica os 80% por categoria, com a captura do Portal",()=>{
  const rows=linhasInventario(dados());
  assert.deepEqual(rows.map(r=>[r.targetOccupied,r.targetAvailable]),[[41,48],[5,15],[3,4]]);
  assert.equal(revisar(rows,hotel,date,date),"");
  assert.ok(revisar(rows,hotel,date,"2027-02-21"));
  assert.ok(revisar([...rows,rows[0]],hotel,date,date));
});
test("distingue saldo zero de captura ausente e bloqueia divergência",()=>{
  const data=dados(),day=data[0].days[0];
  day.available-=6; day.roomTypes[2].available=0;
  assert.equal(linhasInventario(data)[2].targetOccupied,7);
  day.roomTypes[2].available=null;
  assert.ok(revisar(linhasInventario(data),hotel,date,date));
  assert.ok(!validPeriod("2027-02-30","2027-03-03"));
});
test("confere a grade da noite e rejeita valores ambíguos",()=>{
  const grid="Apartamento Standard\nTotal de Apartamentos 89\n89\nOcupados\n41\nTotal de Disponíveis\n48";
  assert.deepEqual(parseGrade(grid,["Apartamento Standard"]).rows["Apartamento Standard"],{capacity:89,occupied:41,available:48});
  assert.throws(()=>parseGrade(grid.replace("48","47"),["Apartamento Standard"]));
});
