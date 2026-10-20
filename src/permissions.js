// Three team levels. "employee" is stored in the database for Staff.
const PAGES = {
  owner: null,
  manager: ["leads", "customers", "vehicles", "schedule", "followups", "settings"],
  employee: ["leads", "customers", "vehicles", "schedule", "followups", "settings"],
};
const SETTINGS = {
  owner: null,
  manager: ["employees", "hours", "account"],
  employee: ["account"],
};

let currentRole = "owner";
export function setCurrentRole(role) { currentRole = PAGES[role] === undefined ? "employee" : role; }
export function getCurrentRole() { return currentRole; }

export const ROLE_LABEL = { owner: "Owner", manager: "Manager", employee: "Staff" };

export function canSeePage(id, role = currentRole) {
  const list = PAGES[role];
  return !list || id === "more" || list.includes(id);
}
export function allowNav(items) { return items.filter((i) => canSeePage(i.id)); }
export function canSeeSetting(id, role = currentRole) {
  const list = SETTINGS[role];
  return !list || list.includes(id);
}
export function firstPage(role) {
  const list = PAGES[role === undefined ? "employee" : role];
  return list ? list[0] : "dashboard";
}
