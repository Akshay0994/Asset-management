import { Timestamp } from '../lib/timestamp';
import type { ParsedAssetImportRow } from '../lib/assetExcelImport';
import type { Asset, Assignment, Employee, EmployeeType, EmploymentStatus, HistoryEvent } from '../types';

const STORAGE_KEY = 'assettrack-it-v1';

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

/** Create or update by employee number (case-insensitive match). */
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
  const i = state.employees.findIndex(
    (e) => e.employeeNumber.trim().toLowerCase() === num.toLowerCase()
  );
  const now = Timestamp.now();
  const base = {
    name: row.name.trim() || num,
    employeeNumber: num,
    email: row.email.trim(),
    department: row.department?.trim() || undefined,
    location: (row.location || '').trim(),
    status: row.status,
    employeeType: row.employeeType,
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
    return state.employees.find((e) => (e.email || '').trim().toLowerCase() === k);
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
 * Returns whether the asset was newly created and any non-fatal warnings.
 */
export function applyAssetImportRow(row: ParsedAssetImportRow): { created: boolean; warnings: string[] } {
  const warnings: string[] = [];
  const { catalog, assigneeEmployeeKey } = row;
  const assignKey = (assigneeEmployeeKey || '').trim();
  const now = Timestamp.now();

  const existing = findAssetBySerial(catalog.serialNumber);
  const payload: Omit<Asset, 'id' | 'deviceId' | 'createdAt'> = {
    name: catalog.name,
    model: catalog.model,
    type: catalog.type,
    serialNumber: catalog.serialNumber.trim(),
    location: catalog.location,
    status: catalog.status,
    assignedTo: existing?.assignedTo,
    purchaseDate: catalog.purchaseDate,
    warrantyStatus: catalog.warrantyStatus,
    warrantyExpiry: catalog.warrantyExpiry,
    ram: catalog.ram,
    storage: catalog.storage,
    chip: catalog.chip,
    notes: catalog.notes,
    updatedAt: now,
  };

  let assetId: string;

  if (existing) {
    assetId = existing.id;
    patchAsset(assetId, {
      ...payload,
      deviceId: existing.deviceId,
      createdAt: existing.createdAt,
    });
  } else {
    assetId = insertAsset({
      ...payload,
      deviceId: newDeviceId(),
      createdAt: now,
    });
    insertHistory({
      assetId,
      type: 'Creation',
      description: `Asset imported from spreadsheet (serial ${catalog.serialNumber}).`,
      timestamp: now,
      performedBy: PERFORMED_BY,
    });
  }

  if (assignKey) {
    const emp = findEmployeeForImportAssignee(assignKey);
    if (!emp) {
      warnings.push(`Row ${row.excelRow}: no employee matched “${assignKey}” — asset saved without assignment.`);
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

  return { created: !existing, warnings };
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
