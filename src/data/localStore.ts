import { Timestamp } from '../lib/timestamp';
import type { ParsedAssetImportRow } from '../lib/assetExcelImport';
import type { Asset, Assignment, Employee, EmployeeType, EmploymentStatus, HistoryEvent } from '../types';

const STORAGE_KEY = 'assettrack-it-v1';
const DEDUP_MIGRATION_KEY = 'assettrack-it-migration-dedup-v2';

export const PERFORMED_BY = 'Admin';

type AppState = {
  assets: Asset[];
  employees: Employee[];
  assignments: Assignment[];
  history: HistoryEvent[];
};

function emptyState(): AppState {
  return { assets: [], employees: [], assignments: [], history: [] };
}

let state: AppState = emptyState();
const listeners = new Set<() => void>();

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function serialize(s: AppState): string {
  return JSON.stringify(s, (_k, v) => {
    if (v instanceof Timestamp) return { __ts: v.toMillis() };
    return v;
  });
}

function deserialize(json: string): AppState {
  return JSON.parse(json, (_k, v) => {
    if (v && typeof v === 'object' && typeof (v as { __ts?: number }).__ts === 'number') {
      const o = v as { __ts: number };
      if (Object.keys(o).length === 1) return Timestamp.fromMillis(o.__ts);
    }
    return v;
  });
}

function load(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) state = deserialize(raw);
  } catch {
    /* ignore */
  }
}

function persist(): void {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, serialize(state));
    } catch {
      /* quota */
    }
  }
  listeners.forEach((l) => l());
}

load();

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getState(): Readonly<AppState> {
  return state;
}

export function insertAsset(row: Omit<Asset, 'id'>): string {
  const id = newId();
  state.assets.push({ ...row, id });
  persist();
  return id;
}

export function patchAsset(id: string, patch: Partial<Asset>): void {
  const i = state.assets.findIndex((a) => a.id === id);
  if (i < 0) return;
  state.assets[i] = { ...state.assets[i], ...patch, id };
  persist();
}

export function deleteAsset(id: string): void {
  state.assets = state.assets.filter((a) => a.id !== id);
  persist();
}

export function insertEmployee(row: Omit<Employee, 'id'>): void {
  state.employees.push({ ...row, id: newId() });
  persist();
}

function findEmployeeIndexForUpsert(employeeNumber: string, email: string): number {
  const num = employeeNumber.trim().toLowerCase();
  const em = email.trim().toLowerCase();

  if (num) {
    const byNumber = state.employees.findIndex(
      (e) => e.employeeNumber.trim().toLowerCase() === num
    );
    if (byNumber >= 0) return byNumber;
  }

  const emailKeys = new Set<string>();
  if (em) emailKeys.add(em);
  if (num.includes('@')) emailKeys.add(num);

  for (const key of emailKeys) {
    const byEmail = state.employees.findIndex(
      (e) =>
        (e.email || '').trim().toLowerCase() === key ||
        e.employeeNumber.trim().toLowerCase() === key
    );
    if (byEmail >= 0) return byEmail;
  }

  return -1;
}

/** Create or update by employee number, then email (case-insensitive match). */
export function upsertEmployeeByEmployeeNumber(row: {
  name: string;
  employeeNumber: string;
  email: string;
  department?: string;
  location: string;
  status: EmploymentStatus;
  employeeType: EmployeeType;
}): { created: boolean } {
  const num = row.employeeNumber.trim();
  const i = findEmployeeIndexForUpsert(num, row.email);
  const now = Timestamp.now();
  const existing = i >= 0 ? state.employees[i] : undefined;
  const importEmail = row.email.trim();
  const base = {
    name: row.name.trim() || existing?.name || num,
    employeeNumber: num || existing?.employeeNumber || importEmail,
    email: importEmail || existing?.email || (num.includes('@') ? num : ''),
    department: row.department?.trim() || existing?.department || undefined,
    location: (row.location || '').trim() || existing?.location || '',
    status: row.status || existing?.status || 'Active',
    employeeType: row.employeeType || existing?.employeeType || 'Regular',
    updatedAt: now,
  };
  if (i >= 0) {
    const id = state.employees[i].id;
    const createdAt = state.employees[i].createdAt;
    state.employees[i] = { ...state.employees[i], ...base, id, createdAt };
    persist();
    return { created: false };
  }
  state.employees.push({
    ...base,
    id: newId(),
    createdAt: now,
  });
  persist();
  return { created: true };
}

export function patchEmployee(id: string, patch: Partial<Employee>): void {
  const i = state.employees.findIndex((e) => e.id === id);
  if (i < 0) return;
  state.employees[i] = { ...state.employees[i], ...patch, id };
  persist();
}

export function deleteEmployee(id: string): void {
  state.employees = state.employees.filter((e) => e.id !== id);
  persist();
}

function isRealEmployeeNumber(num: string): boolean {
  const t = num.trim();
  return t.length > 0 && !t.includes('@');
}

function employeesAreDuplicates(a: Employee, b: Employee): boolean {
  if (a.id === b.id) return false;

  const aEmail = (a.email || '').trim().toLowerCase();
  const bEmail = (b.email || '').trim().toLowerCase();
  const aNum = a.employeeNumber.trim().toLowerCase();
  const bNum = b.employeeNumber.trim().toLowerCase();

  if (aEmail && bEmail && aEmail === bEmail) return true;
  if (aEmail && aEmail === bNum) return true;
  if (bEmail && bEmail === aNum) return true;
  if (aNum && bNum && aNum === bNum) return true;

  return false;
}

function employeeLinkScore(emp: Employee): number {
  let score = 0;
  if (isRealEmployeeNumber(emp.employeeNumber)) score += 100;
  score += state.assignments.filter((a) => a.employeeId === emp.id).length * 10;
  score += state.assets.filter((a) => a.assignedTo === emp.id).length * 10;
  if ((emp.email || '').trim()) score += 5;
  if ((emp.department || '').trim()) score += 1;
  if ((emp.location || '').trim()) score += 1;
  return score;
}

function mergeEmployeeRecords(group: Employee[]): Employee {
  const sorted = [...group].sort((a, b) => employeeLinkScore(b) - employeeLinkScore(a));
  const canonical = sorted[0]!;
  const realNumber =
    sorted.find((e) => isRealEmployeeNumber(e.employeeNumber))?.employeeNumber.trim() ||
    canonical.employeeNumber.trim();
  const email =
    sorted.find((e) => (e.email || '').trim())?.email.trim() ||
    sorted.find((e) => e.employeeNumber.trim().includes('@'))?.employeeNumber.trim() ||
    '';
  const name = sorted.reduce(
    (best, e) => ((e.name || '').trim().length > best.length ? (e.name || '').trim() : best),
    (canonical.name || '').trim()
  );
  const department = sorted.find((e) => (e.department || '').trim())?.department?.trim();
  const location = sorted.find((e) => (e.location || '').trim())?.location.trim() || '';
  const status = sorted.find((e) => e.status)?.status || canonical.status || 'Active';
  const employeeType = sorted.find((e) => e.employeeType)?.employeeType || canonical.employeeType || 'Regular';
  const createdAt = sorted.reduce(
    (earliest, e) => (e.createdAt.toMillis() < earliest.toMillis() ? e.createdAt : earliest),
    canonical.createdAt
  );

  return {
    ...canonical,
    name: name || realNumber || email,
    employeeNumber: realNumber || email,
    email,
    department,
    location,
    status,
    employeeType,
    createdAt,
    updatedAt: Timestamp.now(),
  };
}

function reassignEmployeeReferences(fromId: string, toId: string): Set<string> {
  const affectedAssets = new Set<string>();

  for (const a of state.assignments) {
    if (a.employeeId === fromId) {
      a.employeeId = toId;
      affectedAssets.add(a.assetId);
    }
  }

  for (const asset of state.assets) {
    if (asset.assignedTo === fromId) {
      asset.assignedTo = toId;
      affectedAssets.add(asset.id);
    }
  }

  for (const h of state.history) {
    if (h.userId === fromId) h.userId = toId;
    if (h.employeeId === fromId) h.employeeId = toId;
  }

  return affectedAssets;
}

/** Merge duplicate employees (same email / email-as-ID) and reassign linked records. */
export function deduplicateEmployees(): { mergedGroups: number; removed: number } {
  const groups: Employee[][] = [];
  const assigned = new Set<string>();

  for (const emp of state.employees) {
    if (assigned.has(emp.id)) continue;
    const group = [emp];
    assigned.add(emp.id);

    let changed = true;
    while (changed) {
      changed = false;
      for (const other of state.employees) {
        if (assigned.has(other.id)) continue;
        if (group.some((member) => employeesAreDuplicates(member, other))) {
          group.push(other);
          assigned.add(other.id);
          changed = true;
        }
      }
    }

    if (group.length > 1) groups.push(group);
  }

  let removed = 0;
  const assetsToReconcile = new Set<string>();

  for (const group of groups) {
    const merged = mergeEmployeeRecords(group);
    const keepId = merged.id;
    const dropIds = group.filter((e) => e.id !== keepId).map((e) => e.id);

    const i = state.employees.findIndex((e) => e.id === keepId);
    if (i >= 0) state.employees[i] = merged;

    for (const fromId of dropIds) {
      reassignEmployeeReferences(fromId, keepId).forEach((id) => assetsToReconcile.add(id));
      state.employees = state.employees.filter((e) => e.id !== fromId);
      removed += 1;
    }
  }

  if (removed > 0) {
    for (const assetId of assetsToReconcile) {
      reconcileAssetAssignmentState(assetId);
    }
    persist();
    if (import.meta.env.DEV) {
      console.info(
        `[AssetTrack] Merged ${groups.length} duplicate employee group(s); removed ${removed} duplicate record(s).`
      );
    }
  }

  return { mergedGroups: groups.length, removed };
}

export function insertAssignment(row: Omit<Assignment, 'id'>): string {
  const id = newId();
  state.assignments.push({ ...row, id });
  persist();
  return id;
}

export function patchAssignment(id: string, patch: Partial<Omit<Assignment, 'id'>>): void {
  const i = state.assignments.findIndex((a) => a.id === id);
  if (i < 0) return;
  state.assignments[i] = { ...state.assignments[i], ...patch, id };
  persist();
}

export function deleteAssignment(id: string): Assignment | null {
  const i = state.assignments.findIndex((a) => a.id === id);
  if (i < 0) return null;
  const removed = state.assignments[i]!;
  const assetId = removed.assetId;
  state.assignments.splice(i, 1);
  persist();
  reconcileAssetAssignmentState(assetId);
  return removed;
}

/** Set asset status/assignee from open (not returned) assignment rows for this asset. */
export function reconcileAssetAssignmentState(assetId: string): void {
  const open = state.assignments
    .filter((a) => a.assetId === assetId && !a.returnedAt)
    .sort((a, b) => b.assignedAt.toMillis() - a.assignedAt.toMillis());
  const head = open[0];
  const now = Timestamp.now();
  if (head) {
    patchAsset(assetId, { status: 'Assigned', assignedTo: head.employeeId, updatedAt: now });
  } else {
    patchAsset(assetId, { status: 'Inventory', assignedTo: undefined, updatedAt: now });
  }
}

export function insertHistory(row: Omit<HistoryEvent, 'id'>): void {
  state.history.push({ ...row, id: newId() });
  persist();
}

function newDeviceId(): string {
  return `DEV-${Math.random().toString(36).slice(2, 11).toUpperCase()}`;
}

function findAssetBySerial(serial: string): Asset | undefined {
  const t = serial.trim().toLowerCase();
  return state.assets.find((a) => a.serialNumber.trim().toLowerCase() === t);
}

/** Match import column to an employee by employee number or email (case-insensitive). */
export function findEmployeeForImportAssignee(key: string): Employee | undefined {
  const k = key.trim().toLowerCase();
  if (!k) return undefined;
  if (k.includes('@')) {
    return state.employees.find(
      (e) =>
        (e.email || '').trim().toLowerCase() === k ||
        e.employeeNumber.trim().toLowerCase() === k
    );
  }
  return state.employees.find((e) => e.employeeNumber.trim().toLowerCase() === k);
}

function listOpenAssignmentsForAsset(assetId: string): Assignment[] {
  return state.assignments
    .filter((a) => a.assetId === assetId && !a.returnedAt)
    .sort((a, b) => b.assignedAt.toMillis() - a.assignedAt.toMillis());
}

/** Mark all open assignments returned (e.g. import to inventory or before re-assigning). */
export function closeOpenAssignmentsForAsset(assetId: string, returnAt: Timestamp): void {
  const open = listOpenAssignmentsForAsset(assetId);
  for (const a of open) {
    patchAssignment(a.id, { returnedAt: returnAt });
    const emp = state.employees.find((e) => e.id === a.employeeId);
    insertHistory({
      assetId,
      type: 'return',
      event: 'Returned to inventory',
      details: emp
        ? `Closed during spreadsheet import (was checked out to ${emp.name}).`
        : `Closed during spreadsheet import.`,
      userId: a.employeeId,
      employeeId: a.employeeId,
      timestamp: returnAt,
      performedBy: PERFORMED_BY,
    });
  }
}

/**
 * Upsert one parsed import row (by serial number) and optionally assign to an employee.
 * Existing assets are matched by serial (case-insensitive); only columns present in the row are updated.
 */
export function applyAssetImportRow(row: ParsedAssetImportRow): { created: boolean; warnings: string[] } {
  const warnings: string[] = [];
  const { catalog, assigneeEmployeeKey, providedFields } = row;
  const provided = new Set(providedFields);
  const assignKey = (assigneeEmployeeKey || '').trim();
  const now = Timestamp.now();
  const serial = catalog.serialNumber.trim();

  const existing = findAssetBySerial(serial);

  if (existing) {
    const patch: Partial<Asset> = {
      serialNumber: serial,
      updatedAt: now,
    };

    if (provided.has('name')) patch.name = catalog.name;
    if (provided.has('model')) patch.model = catalog.model;
    if (provided.has('type')) patch.type = catalog.type;
    if (provided.has('location')) patch.location = catalog.location;
    if (provided.has('status') && !assignKey) patch.status = catalog.status;
    if (provided.has('warrantyStatus')) patch.warrantyStatus = catalog.warrantyStatus;
    if (provided.has('warrantyExpiry') && catalog.warrantyExpiry) patch.warrantyExpiry = catalog.warrantyExpiry;
    if (provided.has('purchaseDate') && catalog.purchaseDate) patch.purchaseDate = catalog.purchaseDate;
    if (provided.has('ram')) patch.ram = catalog.ram;
    if (provided.has('storage')) patch.storage = catalog.storage;
    if (provided.has('chip')) patch.chip = catalog.chip;
    if (provided.has('notes')) patch.notes = catalog.notes;

    patchAsset(existing.id, patch);
    insertHistory({
      assetId: existing.id,
      type: 'Update',
      description: `Asset updated from spreadsheet import (serial ${serial}).`,
      timestamp: now,
      performedBy: PERFORMED_BY,
    });

    return finishAssetImportAssignment(existing.id, catalog, assignKey, row.excelRow, warnings, false);
  }

  const assetId = insertAsset({
    name: catalog.name,
    model: catalog.model,
    type: catalog.type,
    serialNumber: serial,
    location: catalog.location,
    status: catalog.status,
    purchaseDate: catalog.purchaseDate,
    warrantyStatus: catalog.warrantyStatus,
    warrantyExpiry: catalog.warrantyExpiry,
    ram: catalog.ram,
    storage: catalog.storage,
    chip: catalog.chip,
    notes: catalog.notes,
    deviceId: newDeviceId(),
    createdAt: now,
    updatedAt: now,
  });

  insertHistory({
    assetId,
    type: 'Creation',
    description: `Asset imported from spreadsheet (serial ${serial}).`,
    timestamp: now,
    performedBy: PERFORMED_BY,
  });

  return finishAssetImportAssignment(assetId, catalog, assignKey, row.excelRow, warnings, true);
}

function finishAssetImportAssignment(
  assetId: string,
  catalog: ParsedAssetImportRow['catalog'],
  assignKey: string,
  excelRow: number,
  warnings: string[],
  created: boolean
): { created: boolean; warnings: string[] } {
  const now = Timestamp.now();

  if (assignKey) {
    const emp = findEmployeeForImportAssignee(assignKey);
    if (!emp) {
      warnings.push(`Row ${excelRow}: no employee matched “${assignKey}” — asset saved without assignment.`);
    } else {
      closeOpenAssignmentsForAsset(assetId, now);
      insertAssignment({
        assetId,
        employeeId: emp.id,
        assignedAt: now,
        returnedAt: undefined,
        returnDate: null,
        condition: undefined,
        notes: undefined,
      });
      reconcileAssetAssignmentState(assetId);
      insertHistory({
        assetId,
        type: 'assignment',
        event: 'Assigned',
        details: `Checked out to ${emp.name} from spreadsheet import.`,
        userId: emp.id,
        employeeId: emp.id,
        timestamp: now,
        performedBy: PERFORMED_BY,
      });
    }
  } else if (catalog.status === 'Inventory') {
    closeOpenAssignmentsForAsset(assetId, now);
    reconcileAssetAssignmentState(assetId);
  }

  return { created, warnings };
}

export function applyAssetImportRows(rows: ParsedAssetImportRow[]): {
  created: number;
  updated: number;
  warnings: string[];
} {
  let created = 0;
  let updated = 0;
  const warnings: string[] = [];
  for (const row of rows) {
    const r = applyAssetImportRow(row);
    if (r.created) created += 1;
    else updated += 1;
    warnings.push(...r.warnings);
  }
  return { created, updated, warnings };
}

function runStartupMigrations(): void {
  if (typeof localStorage === 'undefined') return;
  if (localStorage.getItem(DEDUP_MIGRATION_KEY)) return;
  deduplicateEmployees();
  localStorage.setItem(DEDUP_MIGRATION_KEY, '1');
}

runStartupMigrations();
