import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import type { Asset, AssetStatus, Employee, WarrantyStatus } from '../types';
import { Timestamp } from './timestamp';
import { normalizeAssetTypeInput } from './utils';
import { downloadCsvFile, rowsToCsv } from './csvExport';

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

function mapRow(raw: Record<string, unknown>): {
  mapped: Partial<Record<HeaderField, string>>;
  provided: Set<HeaderField>;
} {
  const mapped: Partial<Record<HeaderField, string>> = {};
  const provided = new Set<HeaderField>();
  for (const [key, val] of Object.entries(raw)) {
    const nk = normHeader(key);
    const field = HEADER_TO_FIELD[nk];
    if (!field) continue;
    provided.add(field);
    const s = field === 'serialNumber' ? serialCellStr(val) : cellStr(val);
    if (s === '') continue;
    mapped[field] = s;
  }
  return { mapped, provided };
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
    const d = new Date(iso + 'T12:00:00');
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
} {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return { rows: [], rowErrors: [{ excelRow: 0, message: 'Workbook has no sheets.' }] };
  }
  const sheet = wb.Sheets[sheetName];
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
      provided.add(f);
      const ts = parseFlexibleDate(val);
      if (ts && !((f === 'warrantyExpiry' && m.warrantyExpiry) || (f === 'purchaseDate' && m.purchaseDate))) {
        dateExtras[f] = ts;
      }
    }

    const serialRaw = readSerialFromRow(raw, m).trim();
    if (!serialRaw) {
      rowErrors.push({ excelRow, message: 'Serial Number is required for each asset row.' });
      return;
    }

    const assignKey = (m.assigneeEmployeeKey || '').trim();

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

export function downloadAssetsCsv(
  assets: Asset[],
  employees: Employee[],
  filenamePrefix = 'asset_inventory'
): void {
  if (assets.length === 0) return;
  const employeesById = new Map(employees.map((e) => [e.id, e]));
  const csv = rowsToCsv(
    [...ASSET_IMPORT_HEADERS],
    assets.map((a) => assetToImportRow(a, employeesById))
  );
  downloadCsvFile(csv, `${filenamePrefix}_${format(new Date(), 'yyyy-MM-dd')}.csv`);
}

export function downloadAssetImportTemplate(): void {
  const ws = XLSX.utils.aoa_to_sheet([
    [...ASSET_IMPORT_HEADERS],
    [
      'ABC123XYZ',
      'MacBook Pro 16',
      'M4 Pro',
      'laptop',
      'HQ',
      'Inventory',
      'Active',
      '2026-06-01',
      '2024-11-01',
      '48GB',
      '1TB',
      'Apple M4 Pro',
      'Finance pool',
      '',
      '',
    ],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Assets');
  XLSX.writeFile(wb, 'asset_import_template.xlsx');
}
