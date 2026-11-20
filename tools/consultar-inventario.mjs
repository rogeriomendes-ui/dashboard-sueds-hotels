import portal from "../server.js";
import { linhasInventario } from "../public/inventario-kpi.mjs";

const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
const [start = today, end = start] = process.argv.slice(2);
function validDate(value) {
  const time = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
try {
  if (!validDate(start) || !validDate(end) || start > end) throw Error("Informe datas AAAA-MM-DD em ordem crescente.");
  const map = await portal.inventoryOccupancy(start, end);
  if (map.period.start !== start || map.period.end !== end) throw Error("O período retornado pelo KPI difere do solicitado.");
  const rows = linhasInventario(map.occupancy);
  console.log(JSON.stringify({ mode: "consulta", generatedAt: new Date().toISOString(), start, end, rows }, null, 2));
  if (!rows.length || rows.some(row => row.status !== "Captura disponível")) process.exitCode = 2;
} catch (error) {
  console.error("Falha ao consultar o inventário:", error.message);
  process.exitCode = 1;
}
