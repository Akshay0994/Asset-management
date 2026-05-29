import React, { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { X, FileSpreadsheet, Download } from 'lucide-react';
import { upsertEmployeeByEmployeeNumber } from '../data/localStore';

export default function EmployeeExcelImportDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.xlsx') && !lower.endsWith('.xls')) {
      setMessage('Please choose an .xlsx or .xls file.');
      setErrors([]);
      return;
    }

    setBusy(true);
    setMessage(null);
    setErrors([]);
    try {
      const { parseEmployeeExcelBuffer } = await import('../lib/employeeExcelImport');
      const buf = await file.arrayBuffer();
      const { rows, rowErrors } = parseEmployeeExcelBuffer(buf);
      if (rows.length === 0 && rowErrors.length === 0) {
        setMessage('No data rows found. Use the template: header row first, then one employee per row.');
        return;
      }
      let created = 0;
      let updated = 0;
      for (const r of rows) {
        const { created: isNew } = upsertEmployeeByEmployeeNumber(r);
        if (isNew) created += 1;
        else updated += 1;
      }
      setMessage(`Imported ${rows.length} row(s): ${created} new, ${updated} updated.`);
      if (rowErrors.length) {
        setErrors(rowErrors.map((err) => `Row ${err.excelRow}: ${err.message}`));
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not read that file.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white w-full max-w-lg rounded-3xl shadow-2xl p-6"
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-indigo-50 text-indigo-600">
              <FileSpreadsheet size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Import employees from Excel</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                .xlsx or .xls — first sheet only. Matches existing staff by Employee ID, or by email if ID is
                blank.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors shrink-0"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3 text-sm text-gray-600 mb-4">
          <p>
            <span className="font-semibold text-gray-800">Required:</span> Employee ID (or Employee Number),{' '}
            <span className="font-semibold text-gray-800">or</span> a work email when there is no ID (common for
            contractors). <span className="font-semibold text-gray-800">Optional:</span> Name, Department,
            Location, Employee Type (Regular / Intern / Contract / Contractor), Status (Active / Inactive / On
            Leave).
          </p>
          <button
            type="button"
            onClick={async () => {
              const { downloadEmployeeImportTemplate } = await import('../lib/employeeExcelImport');
              downloadEmployeeImportTemplate();
            }}
            className="inline-flex items-center gap-2 text-indigo-600 font-semibold hover:text-indigo-700"
          >
            <Download size={16} />
            Download example template
          </button>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          className="hidden"
          onChange={handleFile}
        />

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {busy ? 'Reading…' : 'Choose Excel file'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-colors"
          >
            Close
          </button>
        </div>

        {message && (
          <p className="mt-4 text-sm font-medium text-gray-800 bg-gray-50 rounded-xl px-4 py-3">{message}</p>
        )}

        {errors.length > 0 && (
          <div className="mt-3 max-h-40 overflow-y-auto rounded-xl border border-amber-100 bg-amber-50/80 px-3 py-2 text-xs text-amber-900 space-y-1 custom-scrollbar">
            <p className="font-bold text-amber-800">Warnings / skipped rows</p>
            {errors.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
