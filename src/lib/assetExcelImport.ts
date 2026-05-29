import * as XLSX from 'xlsx';
import type { AssetStatus, WarrantyStatus } from '../types';
import { Timestamp } from './timestamp';
import { normalizeAssetTypeInput } from './utils';

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
};

export type AssetImportRowError = { excelRow: number; message: string };

function cellStr(v: unknown): string {
  if (v == null || v === '') return '';
  if (typeof v === 'number' && Number.isFinite(v)) {
    return Number.isInteger(v) ? String(v) : String(v);
  }
  return String(v).trim();
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

function mapRow(raw: Record<string, unknown>): Partial<Record<HeaderField, string>> {
  const out: Partial<Record<HeaderField, string>> = {};
  for (const [key, val] of Object.entries(raw)) {
    const nk = normHeader(key);
    const field = HEADER_TO_FIELD[nk];
    if (!field) continue;
    const s = cellStr(val);
    if (s === '') continue;
    out[field] = s;
  }
  return out;
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

    const m = mapRow(raw);

    /** Raw cell fallbacks for date columns Excel left as serial numbers */
    const dateExtras: Partial<Record<'warrantyExpiry' | 'purchaseDate', Timestamp | undefined>> = {};
    for (const [key, val] of Object.entries(raw)) {
      const nk = normHeader(key);
      const f = HEADER_TO_FIELD[nk];
      if (!f || (f !== 'warrantyExpiry' && f !== 'purchaseDate')) continue;
      const ts = parseFlexibleDate(val);
      if (ts && !((f === 'warrantyExpiry' && m.warrantyExpiry) || (f === 'purchaseDate' && m.purchaseDate))) {
        dateExtras[f] = ts;
      }
    }

    let serialRaw = (m.serialNumber ?? '').trim();
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
    });
  });

  return { rows, rowErrors };
}

export function downloadAssetImportTemplate(): void {
  const ws = XLSX.utils.aoa_to_sheet([
    [
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
    ],
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
