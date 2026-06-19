import React, { useState, useEffect } from 'react';
import { iconSize } from '../lib/icons';
import {
  subscribe,
  getState,
  patchAssignment,
  reconcileAssetAssignmentState,
  insertHistory,
  deleteAssignment,
} from '../data/localStore';
import { Timestamp } from '../lib/timestamp';
import { timestampFromDateInput, toDateInputValue } from '../lib/assignmentDates';
import { Asset, Assignment, Employee } from '../types';
import { X, Save, Search, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import { format } from 'date-fns';
import { cn } from '../lib/utils';

export default function AssignmentEditForm({
  assignment,
  asset,
  onClose,
}: {
  assignment: Assignment;
  asset: Asset;
  onClose: () => void;
}) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(assignment.employeeId);
  const [transferDate, setTransferDate] = useState(toDateInputValue(assignment.assignedAt));
  const [returnedDate, setReturnedDate] = useState(toDateInputValue(assignment.returnedAt));
  const [expectedReturnDate, setExpectedReturnDate] = useState(
    assignment.returnedAt ? '' : toDateInputValue(assignment.returnDate ?? null)
  );
  const [condition, setCondition] = useState(assignment.condition ?? '');
  const [notes, setNotes] = useState(assignment.notes ?? '');
  const [search, setSearch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  useEffect(() => {
    setSelectedEmployeeId(assignment.employeeId);
    setTransferDate(toDateInputValue(assignment.assignedAt));
    setReturnedDate(toDateInputValue(assignment.returnedAt));
    setExpectedReturnDate(
      assignment.returnedAt ? '' : toDateInputValue(assignment.returnDate ?? null)
    );
    setCondition(assignment.condition ?? '');
    setNotes(assignment.notes ?? '');
  }, [assignment.id]);

  const filteredEmployees = employees.filter(
    (e) =>
      (e.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (e.email || '').toLowerCase().includes(search.toLowerCase()) ||
      (e.employeeNumber || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployeeId) return;

    setIsSubmitting(true);
    try {
      const transferTs = timestampFromDateInput(transferDate);
      const returnAtTs = returnedDate.trim() ? timestampFromDateInput(returnedDate) : undefined;
      const stillOpen = !returnAtTs;
      const hadReturn = !!assignment.returnedAt;
      const hasReturn = !!returnAtTs;

      const nextReturnDate =
        stillOpen && expectedReturnDate.trim() ? timestampFromDateInput(expectedReturnDate) : null;

      const prevExpMs = assignment.returnDate?.toMillis() ?? null;
      const nextExpMs = nextReturnDate?.toMillis() ?? null;

      patchAssignment(assignment.id, {
        employeeId: selectedEmployeeId,
        assignedAt: transferTs,
        returnedAt: returnAtTs,
        returnDate: stillOpen ? nextReturnDate : null,
        condition: condition || undefined,
        notes: notes.trim() || undefined,
      });

      reconcileAssetAssignmentState(asset.id);

      const assigneeName = employees.find((e) => e.id === selectedEmployeeId)?.name || 'employee';

      if (hasReturn && !hadReturn) {
        insertHistory({
          assetId: asset.id,
          type: 'return',
          event: 'Returned to inventory',
          details: `${asset.name || 'Asset'} checked in from ${assigneeName}${
            returnAtTs ? ` on ${format(returnAtTs.toDate(), 'MMM d, yyyy')}` : ''
          }.`,
          userId: selectedEmployeeId,
          employeeId: selectedEmployeeId,
          timestamp: returnAtTs!,
        });
      } else if (!hasReturn && hadReturn) {
        insertHistory({
          assetId: asset.id,
          type: 'assignment',
          event: 'Check-in removed',
          details: `Return date cleared for ${assigneeName}; assignment treated as open again.`,
          userId: selectedEmployeeId,
          employeeId: selectedEmployeeId,
          timestamp: Timestamp.now(),
        });
      } else {
        const returnDateChanged =
          hasReturn &&
          hadReturn &&
          assignment.returnedAt &&
          returnAtTs &&
          assignment.returnedAt.toMillis() !== returnAtTs.toMillis();

        const metaChanged =
          assignment.employeeId !== selectedEmployeeId ||
          assignment.assignedAt.toMillis() !== transferTs.toMillis() ||
          (assignment.condition || '') !== (condition || '') ||
          (assignment.notes || '').trim() !== notes.trim() ||
          returnDateChanged ||
          (stillOpen && (prevExpMs ?? -1) !== (nextExpMs ?? -1));

        if (metaChanged) {
          insertHistory({
            assetId: asset.id,
            type: 'assignment',
            event: 'Assignment updated',
            details: `Assignment record updated for ${asset.name || 'asset'} (${assigneeName}).`,
            userId: selectedEmployeeId,
            employeeId: selectedEmployeeId,
            timestamp: Timestamp.now(),
          });
        }
      }

      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = () => {
    const assigneeName = employees.find((e) => e.id === assignment.employeeId)?.name || 'employee';
    if (
      !window.confirm(
        `Delete this assignment for ${assigneeName}? The checkout state for this asset will be updated from any remaining rows.`
      )
    ) {
      return;
    }
    setIsSubmitting(true);
    try {
      const removed = deleteAssignment(assignment.id);
      if (removed) {
        insertHistory({
          assetId: asset.id,
          type: 'assignment',
          event: 'Assignment deleted',
          details: `Assignment removed (${assigneeName}; assigned ${format(removed.assignedAt.toDate(), 'MMM d, yyyy')}${removed.returnedAt ? `; returned ${format(removed.returnedAt.toDate(), 'MMM d, yyyy')}` : '; was open'}).`,
          userId: removed.employeeId,
          employeeId: removed.employeeId,
          timestamp: Timestamp.now(),
        });
      }
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-60 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white w-full max-w-md max-h-[90vh] overflow-x-hidden overflow-y-auto rounded-3xl shadow-2xl custom-scrollbar"
      >
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 sticky top-0 z-10">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Edit assignment</h2>
            <p className="text-xs text-indigo-600 font-medium">{asset.name || 'Untitled asset'}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
            <X className={iconSize.md} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-3">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Employee (all statuses)
            </label>
            <div className="relative">
              <Search className={cn('absolute left-3 top-1/2 -translate-y-1/2 text-gray-400', iconSize.sm)} />
              <input
                type="text"
                placeholder="Search employees..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
              />
            </div>
            <div className="max-h-40 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
              {filteredEmployees.map((emp) => (
                <button
                  key={emp.id}
                  type="button"
                  onClick={() => setSelectedEmployeeId(emp.id)}
                  className={`w-full p-3 rounded-xl border-2 text-left transition-all flex items-center justify-between ${
                    selectedEmployeeId === emp.id
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-transparent bg-gray-50 hover:bg-gray-100'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-gray-900 truncate">{emp.name}</p>
                      <span
                        className={`shrink-0 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                          emp.status === 'Active'
                            ? 'bg-green-50 text-green-600'
                            : emp.status === 'On Leave'
                              ? 'bg-yellow-50 text-yellow-600'
                              : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {emp.status}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-500">{emp.department || 'General'}</p>
                  </div>
                  {selectedEmployeeId === emp.id && <div className="w-4 h-4 bg-indigo-500 rounded-full shrink-0" />}
                </button>
              ))}
              {filteredEmployees.length === 0 && (
                <p className="text-center py-4 text-sm text-gray-400 italic">No employees match</p>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Date transferred</label>
            <input
              type="date"
              value={transferDate}
              onChange={(e) => setTransferDate(e.target.value)}
              className="w-full px-4 py-2 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Condition (optional)</label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                className="w-full px-4 py-2 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all"
              >
                <option value="">Not set</option>
                <option>Excellent</option>
                <option>Good</option>
                <option>Fair</option>
                <option>Poor</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                Return date (optional — inventory)
              </label>
              <input
                type="date"
                value={returnedDate}
                onChange={(e) => setReturnedDate(e.target.value)}
                className="w-full px-4 py-2 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all"
              />
            </div>
          </div>

          {!returnedDate.trim() && (
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                Expected return (optional)
              </label>
              <input
                type="date"
                value={expectedReturnDate}
                onChange={(e) => setExpectedReturnDate(e.target.value)}
                className="w-full px-4 py-2 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all"
              />
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-4 py-2 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all resize-none"
            />
          </div>

          <div className="rounded-xl border border-red-100 bg-red-50/50 p-4">
              <p className="mb-2 text-xs text-red-800/90">
                Removed rows cannot be restored. Use this if the record was added by mistake.
              </p>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isSubmitting}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-bold text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 className={iconSize.lg} />
                Delete assignment
              </button>
            </div>

          <div className="pt-2 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!selectedEmployeeId || isSubmitting}
              className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Save className={iconSize.md} />
              {isSubmitting ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
