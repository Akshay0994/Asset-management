import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import type { Asset, AssetStatus, Assignment, Employee, WarrantyStatus } from '../types';
import { Timestamp } from './timestamp';
import { normalizeAssetTypeInput } from './utils';

export const ASSET_IMPORT_HEADERS = [
  'Serial Number',
  'Asset Name',
  'Model',
  'Type',
  'Location',
  'Status',
  'Warranty Status',
  'Warranty Expiry',
  'Purchase Date',
  'RAM',
  'Storage',
  'Chip',
  'Notes',
  'Employee ID',
  'Assignee Email',
] as const;

export const ASSET_ASSIGNMENT_HEADERS = [
  'Serial Number',
  'Assignee Name',
  'Employee ID',
  'Assignee Email',
  'Assigned Date',
  'Returned Date',
  'Expected Return Date',
  'Condition',
  'Notes',
] as const;

export type ParsedAssetAssignmentImportRow = {
  excelRow: number;
  serialNumber: string;
  employeeKey: string;
  assignedAt: Timestamp;
  returnedAt?: Timestamp;
  returnDate?: Timestamp | null;
  condition?: string;
  notes?: string;
};

export type ParsedAssetCatalogRow = {
  serialNumber: string;
  name: string;
  model: string;
  type: string;
  location: string;
  status: AssetStatus;
  warrantyStatus: WarrantyStatus;
  warrantyExpiry?: Timestamp;
  purchaseDate?: Timestamp;
  ram?: string;
  storage?: string;
  chip?: string;
  notes?: string;
};

export type ParsedAssetImportRow = {
  /** Spreadsheet row (1-based, including header row) for messaging. */
  excelRow: number;
  catalog: ParsedAssetCatalogRow;
  /** Employee number or email to assign after catalog upsert (optional). */
  assigneeEmployeeKey?: string;
  /** Columns present on this row — used to merge updates without wiping blank cells. */
  providedFields: HeaderField[];
};

export type AssetImportRowError = { excelRow: number; message: string };

function cellStr(v: unknown): string {
  if (v == null || v === '') return '';
  if (typeof v === 'number' && Number.isFinite(v)) {
    return Number.isInteger(v) ? String(v) : String(v);
  }
  return String(v).trim();
}

/** Read hardware serials from Excel without scientific notation or float drift. */
function serialCellStr(v: unknown): string {
  if (v == null || v === '') return '';
  if (typeof v === 'number' && Number.isFinite(v)) {
    if (Number.isInteger(v)) return String(v);
    const rounded = Math.round(v);
    if (Math.abs(v - rounded) < 1e-6) return String(rounded);
    return String(v);
  }
  const s = String(v).trim();
  if (/^[\d.]+e[+-]?\d+$/i.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) {
      const rounded = Math.round(n);
      if (Math.abs(n - rounded) < 1e-6) return String(rounded);
      return String(n);
    }
  }
  return s;
}

function normHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '');
}

/** Map normalized header → field keys for catalog + assignee */
type HeaderField =
  | 'serialNumber'
  | 'name'
  | 'model'
  | 'type'
  | 'location'
  | 'status'
  | 'warrantyStatus'
  | 'warrantyExpiry'
  | 'purchaseDate'
  | 'ram'
  | 'storage'
  | 'chip'
  | 'notes'
  | 'assigneeEmployeeKey';

const HEADER_TO_FIELD: Record<string, HeaderField | null> = {
  serial: 'serialNumber',
  'serial number': 'serialNumber',
  'serialnumber': 'serialNumber',
  sn: 'serialNumber',
  'serial no': 'serialNumber',
  'serial #': 'serialNumber',
  's n': 'serialNumber',
  'hardware serial': 'serialNumber',
  'asset serial': 'serialNumber',
  'asset tag': 'serialNumber',

  name: 'name',
  'asset name': 'name',

  model: 'model',

  type: 'type',
  category: 'type',
  'asset type': 'type',

  location: 'location',
  site: 'location',

  status: 'status',
  'asset status': 'status',

  warranty: 'warrantyStatus',
  'warranty status': 'warrantyStatus',

  'warranty expiry': 'warrantyExpiry',
  'warranty expiration': 'warrantyExpiry',
  expiry: 'warrantyExpiry',
  'expiration date': 'warrantyExpiry',

  'purchase date': 'purchaseDate',
  purchased: 'purchaseDate',

  ram: 'ram',
  memory: 'ram',

  storage: 'storage',
  disk: 'storage',

  chip: 'chip',
  processor: 'chip',
  cpu: 'chip',

  notes: 'notes',
  comments: 'notes',

  'employee id': 'assigneeEmployeeKey',
  employeeid: 'assigneeEmployeeKey',
  assignee: 'assigneeEmployeeKey',
  assignedto: 'assigneeEmployeeKey',
  assigned: 'assigneeEmployeeKey',
  'employee number': 'assigneeEmployeeKey',
  emp: 'assigneeEmployeeKey',
  'assignee email': 'assigneeEmployeeKey',
};

type AssignmentHeaderField =
  | 'serialNumber'
  | 'employeeKey'
  | 'assignedAt'
  | 'returnedAt'
  | 'returnDate'
  | 'condition'
  | 'notes';

const ASSIGNMENT_HEADER_TO_FIELD: Record<string, AssignmentHeaderField | null> = {
  serial: 'serialNumber',
  'serial number': 'serialNumber',
  serialnumber: 'serialNumber',
  sn: 'serialNumber',

  'employee id': 'employeeKey',
  employeeid: 'employeeKey',
  'employee number': 'employeeKey',
  emp: 'employeeKey',
  assignee: 'employeeKey',
  assignedto: 'employeeKey',
  'assignee email': 'employeeKey',

  'assigned date': 'assignedAt',
  assigned: 'assignedAt',
  'check out date': 'assignedAt',
  checkout: 'assignedAt',

  'returned date': 'returnedAt',
  returned: 'returnedAt',
  'check in date': 'returnedAt',
  checkin: 'returnedAt',

  'expected return date': 'returnDate',
  'return date': 'returnDate',

  condition: 'condition',
  notes: 'notes',
};

function mapAssignmentRow(raw: Record<string, unknown>): Partial<Record<AssignmentHeaderField, string>> {
  const mapped: Partial<Record<AssignmentHeaderField, string>> = {};
  for (const [key, val] of Object.entries(raw)) {
    const nk = normHeader(key);
    if (nk === 'assignee name') continue;
    const field = ASSIGNMENT_HEADER_TO_FIELD[nk];
    if (!field) continue;
    const s = field === 'serialNumber' ? serialCellStr(val) : cellStr(val);
    if (s === '') continue;
    mapped[field] = s;
  }
  return mapped;
}

function sheetLooksLikeAssets(sheet: XLSX.WorkSheet): boolean {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, range: 0, defval: '' });
  const headerRow = rows[0];
  if (!Array.isArray(headerRow)) return false;
  const headers = headerRow.map((h) => normHeader(String(h ?? '')));
  const hasSerial = headers.some((h) => HEADER_TO_FIELD[h] === 'serialNumber');
  const hasName = headers.some((h) => HEADER_TO_FIELD[h] === 'name');
  return hasSerial && hasName;
}

function findAssetsSheet(wb: XLSX.WorkBook): { sheet: XLSX.WorkSheet; name: string } | null {
  const byName = findWorksheet(wb, ['Assets', 'Asset', 'Sheet1'], 0);
  if (byName) return byName;

  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    if (sheet && sheetLooksLikeAssets(sheet) && !sheetLooksLikeAssignments(sheet)) {
      return { sheet, name };
    }
  }
  return null;
}

function sheetLooksLikeAssignments(sheet: XLSX.WorkSheet): boolean {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, range: 0, defval: '' });
  const headerRow = rows[0];
  if (!Array.isArray(headerRow)) return false;
  const headers = headerRow.map((h) => normHeader(String(h ?? '')));
  const hasSerial = headers.some((h) => ASSIGNMENT_HEADER_TO_FIELD[h] === 'serialNumber');
  const hasAssignedDate = headers.some((h) => ASSIGNMENT_HEADER_TO_FIELD[h] === 'assignedAt');
  return hasSerial && hasAssignedDate;
}

function findAssignmentsSheet(
  wb: XLSX.WorkBook,
  assetsSheetName: string
): { sheet: XLSX.WorkSheet; name: string } | null {
  const byName = findWorksheet(wb, ['Assignments', 'Assignment']);
  if (byName) return byName;

  for (const name of wb.SheetNames) {
    if (name.trim().toLowerCase() === assetsSheetName.trim().toLowerCase()) continue;
    const sheet = wb.Sheets[name];
    if (sheet && sheetLooksLikeAssignments(sheet)) return { sheet, name };
  }
  return null;
}

function readAssignmentEmployeeKey(
  raw: Record<string, unknown>,
  mapped: Partial<Record<AssignmentHeaderField, string>>
): string {
  let employeeId = '';
  let assigneeEmail = '';
  let assigneeName = '';

  for (const [key, val] of Object.entries(raw)) {
    const nk = normHeader(key);
    if (nk === 'employee id' || nk === 'employeeid' || nk === 'employee number' || nk === 'emp') {
      const s = cellStr(val);
      if (s) employeeId = s;
    } else if (nk === 'assignee email') {
      const s = cellStr(val);
      if (s) assigneeEmail = s;
    } else if (nk === 'assignee name' || nk === 'name') {
      const s = cellStr(val);
      if (s) assigneeName = s;
    }
  }

  return (employeeId || assigneeEmail || assigneeName || mapped.employeeKey || '').trim();
}

function findWorksheet(
  wb: XLSX.WorkBook,
  preferredNames: string[],
  fallbackIndex?: number
): { sheet: XLSX.WorkSheet; name: string } | null {
  for (const preferred of preferredNames) {
    const match = wb.SheetNames.find((n) => n.trim().toLowerCase() === preferred.toLowerCase());
    if (match && wb.Sheets[match]) return { sheet: wb.Sheets[match]!, name: match };
  }
  if (fallbackIndex != null && wb.SheetNames[fallbackIndex] && wb.Sheets[wb.SheetNames[fallbackIndex]!]) {
    const name = wb.SheetNames[fallbackIndex]!;
    const sheet = wb.Sheets[name]!;
    if (preferredNames.some((p) => p.toLowerCase() === 'assets' || p.toLowerCase() === 'asset')) {
      return { sheet, name };
    }
    if (sheetLooksLikeAssignments(sheet)) return { sheet, name };
  }
  return null;
}

function readAssignmentSerial(raw: Record<string, unknown>, mapped: Partial<Record<AssignmentHeaderField, string>>): string {
  for (const [key, val] of Object.entries(raw)) {
    if (ASSIGNMENT_HEADER_TO_FIELD[normHeader(key)] !== 'serialNumber') continue;
    const s = serialCellStr(val);
    if (s) return s.trim();
  }
  return serialCellStr(mapped.serialNumber ?? '').trim();
}

function readAssignmentTimestamp(
  raw: Record<string, unknown>,
  mapped: Partial<Record<AssignmentHeaderField, string>>,
  field: 'assignedAt' | 'returnedAt' | 'returnDate'
): Timestamp | undefined {
  for (const [key, val] of Object.entries(raw)) {
    const nk = normHeader(key);
    if (ASSIGNMENT_HEADER_TO_FIELD[nk] !== field) continue;
    const ts = parseFlexibleDate(val);
    if (ts) return ts;
  }
  const fromMapped = mapped[field];
  return fromMapped ? parseFlexibleDate(fromMapped) : undefined;
}

function parseAssignmentSheet(sheet: XLSX.WorkSheet): {
  rows: ParsedAssetAssignmentImportRow[];
  rowErrors: AssetImportRowError[];
} {
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: true });
  const rows: ParsedAssetAssignmentImportRow[] = [];
  const rowErrors: AssetImportRowError[] = [];

  json.forEach((raw, i) => {
    const excelRow = i + 2;
    const hasAnyCell = Object.values(raw).some((v) => {
      if (v == null || v === '') return false;
      if (typeof v === 'string') return v.trim().length > 0;
      return true;
    });
    if (!hasAnyCell) return;

    const m = mapAssignmentRow(raw);
    const serialRaw = readAssignmentSerial(raw, m);
    if (!serialRaw) {
      rowErrors.push({ excelRow, message: 'Serial Number is required on each assignment row.' });
      return;
    }

    const employeeKey = readAssignmentEmployeeKey(raw, m);
    if (!employeeKey) {
      rowErrors.push({
        excelRow,
        message: 'Employee ID, Assignee Email, or Assignee Name is required on each assignment row.',
      });
      return;
    }

    const assignedAt = readAssignmentTimestamp(raw, m, 'assignedAt');
    if (!assignedAt) {
      rowErrors.push({ excelRow, message: 'Assigned Date is required on each assignment row.' });
      return;
    }

    const returnedAt = readAssignmentTimestamp(raw, m, 'returnedAt');
    const returnDate = readAssignmentTimestamp(raw, m, 'returnDate');

    rows.push({
      excelRow,
      serialNumber: serialRaw,
      employeeKey,
      assignedAt,
      returnedAt,
      returnDate: returnDate ?? undefined,
      condition: m.condition?.trim() || undefined,
      notes: m.notes?.trim() || undefined,
    });
  });

  return { rows, rowErrors };
}

function mapRow(raw: Record<string, unknown>): {
  mapped: Partial<Record<HeaderField, string>>;
  provided: Set<HeaderField>;
} {
  const mapped: Partial<Record<HeaderField, string>> = {};
  const provided = new Set<HeaderField>();
  for (const [key, val] of Object.entries(raw)) {
    const nk = normHeader(key);
    const field = HEADER_TO_FIELD[nk];
    if (!field || field === 'assigneeEmployeeKey') continue;
    const s = field === 'serialNumber' ? serialCellStr(val) : cellStr(val);
    if (s === '') continue;
    provided.add(field);
    mapped[field] = s;
  }
  return { mapped, provided };
}

function readAssetAssigneeKey(
  raw: Record<string, unknown>,
  mapped: Partial<Record<HeaderField, string>>
): string {
  let employeeId = '';
  let assigneeEmail = '';

  for (const [key, val] of Object.entries(raw)) {
    const nk = normHeader(key);
    if (nk === 'employee id' || nk === 'employeeid' || nk === 'employee number' || nk === 'emp') {
      const s = cellStr(val);
      if (s) employeeId = s;
    } else if (nk === 'assignee email') {
      const s = cellStr(val);
      if (s) assigneeEmail = s;
    }
  }

  return (employeeId || assigneeEmail || mapped.assigneeEmployeeKey || '').trim();
}

function readSerialFromRow(
  raw: Record<string, unknown>,
  mapped: Partial<Record<HeaderField, string>>
): string {
  for (const [key, val] of Object.entries(raw)) {
    const nk = normHeader(key);
    if (HEADER_TO_FIELD[nk] !== 'serialNumber') continue;
    const s = serialCellStr(val);
    if (s) return s;
  }
  return serialCellStr(mapped.serialNumber ?? '');
}

/** Parse Excel-serial-ish days or ISO-like strings into Timestamp */
export function parseFlexibleDate(raw: unknown): Timestamp | undefined {
  if (raw == null || raw === '') return undefined;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return Timestamp.fromDate(raw);
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (raw >= 25000 && raw <= 55000) {
      const ms = Math.round((raw - 25569) * 86400 * 1000);
      return Timestamp.fromMillis(ms);
    }
  }
  const s = typeof raw === 'string' ? raw.trim() : String(raw).trim();
  if (!s) return undefined;
  const iso = /\d{4}-\d{2}-\d{2}/.exec(s)?.[0];
  if (iso) {
    const rest = s.slice(iso.length).trim();
    const timeMatch = rest.match(/^(\d{1,2}:\d{2}(?::\d{2})?)/);
    const d = timeMatch
      ? new Date(`${iso}T${timeMatch[1]}`)
      : new Date(`${iso}T12:00:00`);
    if (!Number.isNaN(d.getTime())) return Timestamp.fromDate(d);
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return Timestamp.fromDate(d);
  return undefined;
}

function parseStatus(raw: string, hasAssignee: boolean): AssetStatus {
  const t = raw.trim().toLowerCase().replace(/_/g, ' ');
  if (!t && hasAssignee) return 'Assigned';
  if (t === 'assigned') return 'Assigned';
  if (t === 'repaired') return 'Repaired';
  if (t === 'retired') return 'Retired';
  if (t === 'stolen') return 'Stolen';
  return 'Inventory';
}

function parseWarrantyStatus(raw: string): WarrantyStatus {
  const t = raw.trim().toLowerCase();
  if (t === 'active') return 'Active';
  if (t === 'expired') return 'Expired';
  return 'N/A';
}

export function parseAssetExcelBuffer(buffer: ArrayBuffer): {
  rows: ParsedAssetImportRow[];
  rowErrors: AssetImportRowError[];
  assignmentRows: ParsedAssetAssignmentImportRow[];
  assignmentRowErrors: AssetImportRowError[];
} {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const assetsSheet = findAssetsSheet(wb);
  if (!assetsSheet) {
    return {
      rows: [],
      rowErrors: [{ excelRow: 0, message: 'Workbook has no Assets sheet.' }],
      assignmentRows: [],
      assignmentRowErrors: [],
    };
  }

  const { rows, rowErrors } = parseAssetSheet(assetsSheet.sheet);

  const assignmentSheet = findAssignmentsSheet(wb, assetsSheet.name);
  let assignmentRows: ParsedAssetAssignmentImportRow[] = [];
  let assignmentRowErrors: AssetImportRowError[] = [];
  if (assignmentSheet) {
    const parsed = parseAssignmentSheet(assignmentSheet.sheet);
    assignmentRows = parsed.rows;
    assignmentRowErrors = parsed.rowErrors;
  }

  return { rows, rowErrors, assignmentRows, assignmentRowErrors };
}

function parseAssetSheet(sheet: XLSX.WorkSheet): {
  rows: ParsedAssetImportRow[];
  rowErrors: AssetImportRowError[];
} {
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: true });

  const rows: ParsedAssetImportRow[] = [];
  const rowErrors: AssetImportRowError[] = [];

  json.forEach((raw, i) => {
    const excelRow = i + 2;
    const hasAnyCell = Object.values(raw).some((v) => {
      if (v == null || v === '') return false;
      if (typeof v === 'string') return v.trim().length > 0;
      return true;
    });
    if (!hasAnyCell) return;

    const { mapped: m, provided } = mapRow(raw);

    /** Raw cell fallbacks for date columns Excel left as serial numbers */
    const dateExtras: Partial<Record<'warrantyExpiry' | 'purchaseDate', Timestamp | undefined>> = {};
    for (const [key, val] of Object.entries(raw)) {
      const nk = normHeader(key);
      const f = HEADER_TO_FIELD[nk];
      if (!f || (f !== 'warrantyExpiry' && f !== 'purchaseDate')) continue;
      const ts = parseFlexibleDate(val);
      if (!ts) continue;
      provided.add(f);
      if (!((f === 'warrantyExpiry' && m.warrantyExpiry) || (f === 'purchaseDate' && m.purchaseDate))) {
        dateExtras[f] = ts;
      }
    }

    const serialRaw = readSerialFromRow(raw, m).trim();
    if (!serialRaw) {
      rowErrors.push({ excelRow, message: 'Serial Number is required for each asset row.' });
      return;
    }

    const assignKey = readAssetAssigneeKey(raw, m);
    if (assignKey) provided.add('assigneeEmployeeKey');

    let warrantyExpiry: Timestamp | undefined;
    let purchaseDate: Timestamp | undefined;
    if (m.warrantyExpiry) warrantyExpiry = parseFlexibleDate(m.warrantyExpiry);
    else if (dateExtras.warrantyExpiry) warrantyExpiry = dateExtras.warrantyExpiry;
    if (m.purchaseDate) purchaseDate = parseFlexibleDate(m.purchaseDate);
    else if (dateExtras.purchaseDate) purchaseDate = dateExtras.purchaseDate;

    const typeNorm = normalizeAssetTypeInput((m.type || 'other').trim() ? m.type!.trim() : 'other');

    const catalog: ParsedAssetCatalogRow = {
      serialNumber: serialRaw,
      name: (m.name?.trim() || m.model?.trim() || serialRaw || 'Imported asset').trim(),
      model: (m.model || '').trim(),
      type: typeNorm || 'other',
      location: (m.location || '').trim() || '',
      status: parseStatus(m.status ?? '', !!assignKey),
      warrantyStatus: parseWarrantyStatus(m.warrantyStatus || ''),
      warrantyExpiry,
      purchaseDate,
      ram: m.ram?.trim() || undefined,
      storage: m.storage?.trim() || undefined,
      chip: m.chip?.trim() || undefined,
      notes: m.notes?.trim() || undefined,
    };

    rows.push({
      excelRow,
      catalog,
      assigneeEmployeeKey: assignKey || undefined,
      providedFields: [...provided],
    });
  });

  return { rows, rowErrors };
}

function formatImportDate(ts: Timestamp | undefined): string {
  if (!ts) return '';
  return format(ts.toDate(), 'yyyy-MM-dd');
}

function formatWorksheetTextColumns(ws: XLSX.WorkSheet, columnIndexes: number[]): void {
  const ref = ws['!ref'];
  if (!ref) return;
  const range = XLSX.utils.decode_range(ref);
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    for (const c of columnIndexes) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      if (!cell || cell.v == null || cell.v === '') continue;
      cell.t = 's';
      cell.v = String(cell.v);
      cell.z = '@';
    }
  }
}

function buildWorksheet(data: unknown[][], textColumnIndexes: number[] = []): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(data);
  if (textColumnIndexes.length > 0) formatWorksheetTextColumns(ws, textColumnIndexes);
  return ws;
}

function formatDateTime(ts: Timestamp | undefined): string {
  if (!ts) return '';
  return format(ts.toDate(), 'yyyy-MM-dd HH:mm');
}

function assigneeExportColumns(
  employee: Employee | undefined
): { employeeId: string; assigneeEmail: string } {
  if (!employee) return { employeeId: '', assigneeEmail: '' };

  const num = employee.employeeNumber.trim();
  const email = (employee.email || '').trim();

  if (num && !num.includes('@')) {
    return { employeeId: num, assigneeEmail: '' };
  }

  return { employeeId: '', assigneeEmail: email || num };
}

/** One data row in the same column order as the import template. */
export function assetToImportRow(asset: Asset, employeesById: Map<string, Employee>): string[] {
  const assignee = asset.assignedTo ? employeesById.get(asset.assignedTo) : undefined;
  const { employeeId, assigneeEmail } = assigneeExportColumns(assignee);

  return [
    asset.serialNumber.trim(),
    asset.name.trim(),
    asset.model.trim(),
    asset.type.trim(),
    asset.location.trim(),
    asset.status,
    asset.warrantyStatus,
    formatImportDate(asset.warrantyExpiry),
    formatImportDate(asset.purchaseDate),
    asset.ram?.trim() || '',
    asset.storage?.trim() || '',
    asset.chip?.trim() || '',
    asset.notes?.trim() || '',
    employeeId,
    assigneeEmail,
  ];
}

/** One assignment row in the same column order as the Assignments sheet. */
export function assignmentToImportRow(
  assignment: Assignment,
  asset: Asset,
  employeesById: Map<string, Employee>
): string[] {
  const emp = employeesById.get(assignment.employeeId);
  const { employeeId, assigneeEmail } = assigneeExportColumns(emp);

  return [
    asset.serialNumber.trim(),
    emp?.name?.trim() || '',
    employeeId,
    assigneeEmail,
    formatDateTime(assignment.assignedAt),
    assignment.returnedAt ? formatDateTime(assignment.returnedAt) : '',
    assignment.returnDate ? formatImportDate(assignment.returnDate) : '',
    assignment.condition || '',
    assignment.notes || '',
  ];
}

export function downloadAssetsWorkbook(
  assets: Asset[],
  employees: Employee[],
  assignments: Assignment[],
  filenamePrefix = 'asset_inventory'
): void {
  if (assets.length === 0) return;
  const employeesById = new Map(employees.map((e) => [e.id, e]));
  const assetIds = new Set(assets.map((a) => a.id));
  const assetById = new Map(assets.map((a) => [a.id, a]));

  const assetsWs = buildWorksheet(
    [[...ASSET_IMPORT_HEADERS], ...assets.map((a) => assetToImportRow(a, employeesById))],
    [0, 13, 14]
  );

  const assignmentData = assignments
    .filter((a) => assetIds.has(a.assetId))
    .sort((a, b) => {
      const sa = assetById.get(a.assetId)?.serialNumber ?? '';
      const sb = assetById.get(b.assetId)?.serialNumber ?? '';
      const cmp = sa.localeCompare(sb);
      if (cmp !== 0) return cmp;
      return a.assignedAt.toMillis() - b.assignedAt.toMillis();
    })
    .map((a) => assignmentToImportRow(a, assetById.get(a.assetId)!, employeesById));

  const assignmentsWs = buildWorksheet([[...ASSET_ASSIGNMENT_HEADERS], ...assignmentData], [0, 2, 3]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, assetsWs, 'Assets');
  XLSX.utils.book_append_sheet(wb, assignmentsWs, 'Assignments');
  XLSX.writeFile(wb, `${filenamePrefix}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
}

export function downloadAssetImportTemplate(): void {
  const assetsWs = buildWorksheet(
    [
      [...ASSET_IMPORT_HEADERS],
      [
        'ABC123XYZ',
        'MacBook Pro 16',
        'M4 Pro',
        'laptop',
        'HQ',
        'Assigned',
        'Active',
        '2026-06-01',
        '2024-11-01',
        '48GB',
        '1TB',
        'Apple M4 Pro',
        'Finance pool',
        'E001',
        '',
      ],
    ],
    [0, 13, 14]
  );
  const assignmentsWs = buildWorksheet(
    [
      [...ASSET_ASSIGNMENT_HEADERS],
      [
        'ABC123XYZ',
        'Jane Doe',
        'E001',
        '',
        '2024-11-15 09:00',
        '',
        '2025-11-15',
        'Good',
        'Current checkout',
      ],
      [
        'ABC123XYZ',
        'John Smith',
        'E002',
        '',
        '2024-01-10 14:30',
        '2024-11-14 17:00',
        '',
        'Good',
        'Previous assignee',
      ],
    ],
    [0, 2, 3]
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, assetsWs, 'Assets');
  XLSX.utils.book_append_sheet(wb, assignmentsWs, 'Assignments');
  XLSX.writeFile(wb, 'asset_import_template.xlsx');
}
