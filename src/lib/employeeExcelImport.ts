import * as XLSX from 'xlsx';
import type { EmployeeType, EmploymentStatus } from '../types';

export type ParsedEmployeeImportRow = {
  name: string;
  employeeNumber: string;
  email: string;
  department?: string;
  location: string;
  status: EmploymentStatus;
  employeeType: EmployeeType;
};

export type EmployeeImportRowError = { excelRow: number; message: string };

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

/** Map normalized header text → field */
const HEADER_TO_FIELD: Record<string, keyof ParsedEmployeeImportRow | null> = {
  name: 'name',
  'full name': 'name',
  'employee name': 'name',
  'employee number': 'employeeNumber',
  'employee id': 'employeeNumber',
  'employeeid': 'employeeNumber',
  'emp id': 'employeeNumber',
  'emp no': 'employeeNumber',
  'emp number': 'employeeNumber',
  email: 'email',
  'e mail': 'email',
  department: 'department',
  dept: 'department',
  location: 'location',
  office: 'location',
  status: 'status',
  'employment status': 'status',
  'employee type': 'employeeType',
  'employment type': 'employeeType',
  type: 'employeeType',
};

function mapRow(raw: Record<string, unknown>): Partial<Record<keyof ParsedEmployeeImportRow, string>> {
  const out: Partial<Record<keyof ParsedEmployeeImportRow, string>> = {};
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

function parseStatus(raw: string): EmploymentStatus {
  const t = raw.trim().toLowerCase().replace(/_/g, ' ');
  if (t === 'inactive') return 'Inactive';
  if (t === 'on leave' || t === 'onleave' || t === 'leave') return 'On Leave';
  if (t === 'active' || t === '') return 'Active';
  return 'Active';
}

function parseType(raw: string): EmployeeType {
  const t = raw.trim().toLowerCase();
  if (t === 'intern') return 'Intern';
  if (t === 'contract' || t === 'contractor' || t === 'contract staff') return 'Contract';
  return 'Regular';
}

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseEmployeeExcelBuffer(buffer: ArrayBuffer): {
  rows: ParsedEmployeeImportRow[];
  rowErrors: EmployeeImportRowError[];
} {
  const wb = XLSX.read(buffer, { type: 'array' });
  const name = wb.SheetNames[0];
  if (!name) {
    return { rows: [], rowErrors: [{ excelRow: 0, message: 'Workbook has no sheets.' }] };
  }
  const sheet = wb.Sheets[name];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });

  const rows: ParsedEmployeeImportRow[] = [];
  const rowErrors: EmployeeImportRowError[] = [];

  json.forEach((raw, i) => {
    const excelRow = i + 2;
    const m = mapRow(raw);
    const numRaw = (m.employeeNumber || '').trim();
    const nameVal = (m.name || '').trim();

    const hasAny = Object.values(raw).some((v) => cellStr(v) !== '');
    if (!hasAny) return;

    let email = (m.email || '').trim();
    if (email && !EMAIL_OK.test(email)) {
      rowErrors.push({ excelRow, message: `Invalid email "${email}" — cleared.` });
      email = '';
    }

    let employeeNumber = numRaw;
    if (!employeeNumber) {
      if (email) {
        employeeNumber = email;
      } else {
        rowErrors.push({
          excelRow,
          message:
            'Employee ID or Email is required — use Employee ID / Employee Number when you have one; otherwise a work email is used as the unique key (typical for contractors).',
        });
        return;
      }
    }

    const nameFinal = nameVal || employeeNumber;

    rows.push({
      name: nameFinal,
      employeeNumber,
      email,
      department: m.department?.trim() || undefined,
      location: (m.location || '').trim(),
      status: parseStatus(m.status || ''),
      employeeType: parseType(m.employeeType || ''),
    });
  });

  return { rows, rowErrors };
}

export function downloadEmployeeImportTemplate(): void {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Name', 'Employee ID', 'Email', 'Department', 'Location', 'Employee Type', 'Status'],
    [
      'Jane Doe',
      'EMP001',
      'jane@company.com',
      'Engineering',
      'New York',
      'Regular',
      'Active',
    ],
    [
      'Alex Vendor',
      '',
      'alex@vendor.com',
      'Vendor relations',
      'Remote',
      'Contract',
      'Active',
    ],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Employees');
  XLSX.writeFile(wb, 'employee_import_template.xlsx');
}
