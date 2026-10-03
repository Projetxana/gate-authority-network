import fs from 'node:fs';

export function resetCustomers(path) {
  const state = { version: 1, customers: { '1234': { id: '1234', status: 'ACTIVE' }, '2345': { id: '2345', status: 'ACTIVE' }, '3456': { id: '3456', status: 'ACTIVE' }, '4567': { id: '4567', status: 'ACTIVE' }, '5678': { id: '5678', status: 'ACTIVE' } }, events: [] };
  fs.writeFileSync(path, JSON.stringify(state, null, 2));
}

function read(path) { return JSON.parse(fs.readFileSync(path, 'utf8')); }
function write(path, value) { fs.writeFileSync(path, JSON.stringify(value, null, 2)); }

export function getCustomer(path, id) { return read(path).customers[id] ?? null; }
export function deleteCustomer(path, id, metadata = {}) {
  const state = read(path);
  const customer = state.customers[id];
  if (!customer) return { found: false, changed: false, customer: null };
  const changed = customer.status !== 'DELETED';
  customer.status = 'DELETED';
  customer.deletedAt ??= new Date().toISOString();
  state.events.push({ type: 'CUSTOMER_DELETED', customerId: id, at: new Date().toISOString(), ...metadata });
  write(path, state);
  return { found: true, changed, customer: structuredClone(customer) };
}
