const PORTAL_DEPARTMENTS = [
  "Geral",
  "Vendas / Reservas",
  "Recepção",
  "Governança / Camareiras",
  "Manutenção",
  "Alimentos e Bebidas",
  "Administrativo",
  "Diretoria"
];

function normalizePortalDepartment(value) {
  const department = String(value ?? "").trim().slice(0, 80);
  return ["Vendas", "Reservas", "Vendas/Reservas", "Vendas / Reservas"].includes(department)
    ? "Vendas / Reservas"
    : department;
}

function validPortalDepartments(values, options = {}) {
  if (!Array.isArray(values)) return [];
  const allowed = new Set(PORTAL_DEPARTMENTS.filter((department) => options.includeGeneral || department !== "Geral"));
  return [...new Set(values.map(normalizePortalDepartment).filter((department) => allowed.has(department)))];
}

module.exports = { PORTAL_DEPARTMENTS, normalizePortalDepartment, validPortalDepartments };
