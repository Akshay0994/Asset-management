import React, { useState, useEffect, useMemo } from 'react';
import {
  subscribe,
  getState,
  insertAssignment,
  insertHistory,
  reconcileAssetAssignmentState,
  patchAssignment,
} from '../data/localStore';
import { timestampFromDateInput, todayDateInputValue } from '../lib/assignmentDates';
import { Asset, Employee } from '../types';
import { X, UserPlus, Search, RotateCcw } from 'lucide-react';
import { motion } from 'motion/react';
import { format } from 'date-fns';
import { cn } from '../lib/utils';

type AssignTab = 'assign' | 'return';

function findOpenAssignment(assetId: string) {
  const open = getState().assignments
    .filter((a) => a.assetId === assetId && !a.returnedAt)
    .sort((a, b) => b.assignedAt.toMillis() - a.assignedAt.toMillis());
  return open[0] ?? null;
}

export default function AssignmentForm({
  asset,
  onClose,
}: {
  asset: Asset;
  onClose: () => void;
}) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [tab, setTab] = useState<AssignTab>('assign');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [condition, setCondition] = useState('');
  const [notes, setNotes] = useState('');
  const [transferDate, setTransferDate] = useState(todayDateInputValue);
  const [search, setSearch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [returnDate, setReturnDate] = useState(todayDateInputValue);
  const [returnNotes, setReturnNotes] = useState('');

  useEffect(() => {
    const sync = () => {
      const list = [...getState().employees].sort((a, b) =>
        (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
      );
      setEmployees(list);
    };
    sync();
    return subscribe(sync);
  }, []);

  const filteredEmployees = employees.filter(
    (e) =>
      (e.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (e.email || '').toLowerCase().includes(search.toLowerCase()) ||
      (e.employeeNumber || '').toLowerCase().includes(search.toLowerCase())
  );

  const canReturn = !!(asset.assignedTo && findOpenAssignment(asset.id));
  const currentAssigneeName = useMemo(() => {
    if (!asset.assignedTo) return '';
    return employees.find((e) => e.id === asset.assignedTo)?.name || 'Assignee';
  }, [asset.assignedTo, employees]);

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployeeId) return;

    setIsSubmitting(true);
    try {
      const transferAt = timestampFromDateInput(transferDate);
      const previousEmployeeId = asset.assignedTo;
      const assigneeName =
        employees.find((emp) => emp.id === selectedEmployeeId)?.name || 'employee';

      if (previousEmployeeId) {
        insertHistory({
          assetId: asset.id,
          type: 'return',
          event: 'Returned (equipment swap)',
          details: `Checked in from ${employees.find((emp) => emp.id === previousEmployeeId)?.name || 'previous user'} before assigning to someone else.`,
          userId: previousEmployeeId,
          employeeId: previousEmployeeId,
          timestamp: transferAt,
        });
      }

      insertAssignment({
        assetId: asset.id,
        employeeId: selectedEmployeeId,
        assignedAt: transferAt,
        returnedAt: undefined,
        returnDate: null,
        condition: condition || undefined,
        notes: notes.trim() || undefined,
      });

      reconcileAssetAssignmentState(asset.id);

      insertHistory({
        assetId: asset.id,
        type: 'assignment',
        event: previousEmployeeId ? 'Assigned (swap)' : 'Assigned',
        details: `Checked out to ${assigneeName}. Condition: ${condition || '—'}.`,
        userId: selectedEmployeeId,
        employeeId: selectedEmployeeId,
        timestamp: transferAt,
      });

      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const openAsgn = findOpenAssignment(asset.id);
    const employeeId = asset.assignedTo;
    if (!openAsgn || !employeeId) return;

    setIsSubmitting(true);
    try {
      const returnAtTs = timestampFromDateInput(returnDate);
      const assigneeName = employees.find((emp) => emp.id === employeeId)?.name || 'employee';
      const mergedNotes =
        returnNotes.trim().length > 0
          ? [openAsgn.notes?.trim(), `Check-in: ${returnNotes.trim()}`].filter(Boolean).join('\n\n')
          : openAsgn.notes;

      patchAssignment(openAsgn.id, {
        returnedAt: returnAtTs,
        notes: mergedNotes || undefined,
      });

      reconcileAssetAssignmentState(asset.id);

      insertHistory({
        assetId: asset.id,
        type: 'return',
        event: 'Returned to inventory',
        details: `Checked in from ${assigneeName} on ${format(returnAtTs.toDate(), 'MMM d, yyyy')}. Asset back in inventory.`,
        userId: employeeId,
        employeeId: employeeId,
        timestamp: returnAtTs,
      });

      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const TabButton = ({
    id,
    label,
    icon: Icon,
    disabled,
  }: {
    id: AssignTab;
    label: string;
    icon: typeof UserPlus;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setTab(id)}
      className={cn(
        'flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition-all',
        tab === id
          ? id === 'return'
            ? 'bg-white text-sky-700 shadow-sm ring-1 ring-sky-100'
            : 'bg-white text-indigo-700 shadow-sm ring-1 ring-indigo-100'
          : 'text-gray-500 hover:text-gray-800',
        disabled && 'cursor-not-allowed opacity-45 hover:text-gray-500'
      )}
    >
      <Icon size={18} />
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/50 px-6 py-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Assign or return</h2>
            <p className="text-xs font-medium text-indigo-600">{asset.name || 'Untitled asset'}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 transition-colors hover:bg-gray-200">
            <X size={20} />
          </button>
        </div>

        <div className="border-b border-gray-100 bg-gray-50/80 px-3 py-2">
          <div className="flex gap-1 rounded-2xl bg-gray-100/90 p-1">
            <TabButton id="assign" label="Assign to employees" icon={UserPlus} />
            <TabButton id="return" label="Return" icon={RotateCcw} disabled={!canReturn} />
          </div>
          {tab === 'return' && !canReturn && (
            <p className="mt-2 px-1 text-center text-xs text-amber-700">
              Check out this asset first using <strong>Assign to employees</strong>.
            </p>
          )}
        </div>

        {tab === 'assign' ? (
          <form onSubmit={handleAssignSubmit} className="space-y-4 p-6">
            <div className="space-y-3">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Select employee (all statuses)
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search employees..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-xl border-none bg-gray-50 py-2 pl-10 pr-4 text-sm transition-all focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="custom-scrollbar max-h-48 space-y-2 overflow-y-auto pr-2">
                {filteredEmployees.map((emp) => (
                  <button
                    key={emp.id}
                    type="button"
                    onClick={() => setSelectedEmployeeId(emp.id)}
                    className={cn(
                      'flex w-full items-center justify-between rounded-xl border-2 p-3 text-left transition-all',
                      selectedEmployeeId === emp.id
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-transparent bg-gray-50 hover:bg-gray-100'
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-bold text-gray-900">{emp.name}</p>
                        <span
                          className={cn(
                            'shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase',
                            emp.status === 'Active' && 'bg-green-50 text-green-600',
                            emp.status === 'On Leave' && 'bg-yellow-50 text-yellow-600',
                            emp.status === 'Inactive' && 'bg-gray-100 text-gray-500'
                          )}
                        >
                          {emp.status}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-500">{emp.department || 'General'}</p>
                    </div>
                    {selectedEmployeeId === emp.id && <div className="size-4 shrink-0 rounded-full bg-indigo-500" />}
                  </button>
                ))}
                {filteredEmployees.length === 0 && (
                  <p className="py-4 text-center text-sm italic text-gray-400">No employees match your search</p>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Date transferred</label>
              <input
                type="date"
                value={transferDate}
                onChange={(e) => setTransferDate(e.target.value)}
                className="w-full rounded-xl border-none bg-gray-50 px-4 py-2 transition-all focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Condition (optional)</label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                className="w-full rounded-xl border-none bg-gray-50 px-4 py-2 transition-all focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Not set</option>
                <option>Excellent</option>
                <option>Good</option>
                <option>Fair</option>
                <option>Poor</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Assignment notes (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full resize-none rounded-xl border-none bg-gray-50 px-4 py-2 transition-all focus:ring-2 focus:ring-indigo-500"
                placeholder="e.g. Issued for remote work"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl bg-gray-100 px-4 py-3 font-bold text-gray-600 transition-colors hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!selectedEmployeeId || isSubmitting}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-bold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
              >
                <UserPlus size={20} />
                {isSubmitting ? 'Saving…' : 'Confirm assignment'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleReturnSubmit} className="space-y-4 p-6">
            {canReturn ? (
              <>
                <div className="rounded-2xl bg-sky-50 p-4 ring-1 ring-sky-100">
                  <p className="text-xs font-bold uppercase tracking-wider text-sky-800">Currently assigned to</p>
                  <p className="mt-1 text-lg font-bold text-sky-950">{currentAssigneeName}</p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-500">
                    Date returned (check-in)
                  </label>
                  <input
                    type="date"
                    value={returnDate}
                    onChange={(e) => setReturnDate(e.target.value)}
                    required
                    className="w-full rounded-xl border-none bg-gray-50 px-4 py-2 transition-all focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-500">
                    Return notes (optional)
                  </label>
                  <textarea
                    value={returnNotes}
                    onChange={(e) => setReturnNotes(e.target.value)}
                    rows={2}
                    className="w-full resize-none rounded-xl border-none bg-gray-50 px-4 py-2 transition-all focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g. Dock and charger included"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 rounded-xl bg-gray-100 px-4 py-3 font-bold text-gray-600 transition-colors hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-3 font-bold text-white transition-colors hover:bg-sky-700 disabled:opacity-50"
                  >
                    <RotateCcw size={20} />
                    {isSubmitting ? 'Recording…' : 'Confirm return'}
                  </button>
                </div>
              </>
            ) : null}
          </form>
        )}
      </motion.div>
    </div>
  );
}
