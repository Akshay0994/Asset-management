import React, { useState, useEffect, useMemo } from 'react';
import { subscribe, getState, deleteAssignment, insertHistory } from '../data/localStore';
import { Timestamp } from '../lib/timestamp';
import { Asset, HistoryEvent, Employee, Assignment } from '../types';
import { X, History, User, Calendar, Shield, Tag, Info, Pencil, StickyNote, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import { format } from 'date-fns';
import { cn, sortHistoryNewestFirst } from '../lib/utils';
import AssignmentEditForm from './AssignmentEditForm';

export default function AssetDetails({
  asset,
  onClose,
  /** When opened from another modal (e.g. employee details), stack above parent overlay. */
  nestedOverlay = false,
}: {
  asset: Asset;
  onClose: () => void;
  nestedOverlay?: boolean;
}) {
  const [resolvedAsset, setResolvedAsset] = useState<Asset>(asset);
  const [history, setHistory] = useState<HistoryEvent[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);

  useEffect(() => {
    setResolvedAsset(asset);
  }, [asset]);

  useEffect(() => {
    const sync = () => {
      const s = getState();
      const fresh = s.assets.find((a) => a.id === asset.id);
      if (fresh) setResolvedAsset(fresh);
      setEmployees(s.employees);
      setHistory(
        s.history
          .filter((h) => h.assetId === asset.id)
          .sort(sortHistoryNewestFirst)
      );
      setAssignments(
        s.assignments
          .filter((a) => a.assetId === asset.id)
          .sort((a, b) => b.assignedAt.toMillis() - a.assignedAt.toMillis())
      );
      setLoading(false);
    };
    sync();
    return subscribe(sync);
  }, [asset.id]);

  const getEmployeeName = (id: string) => employees.find((e) => e.id === id)?.name || 'Unknown';

  const handleDeleteAssignment = (asgn: Assignment) => {
    const assigneeName = getEmployeeName(asgn.employeeId);
    if (
      !window.confirm(
        `Delete this assignment for ${assigneeName}? The checkout state for this asset will be updated from any remaining rows.`
      )
    )
      return;
    const removed = deleteAssignment(asgn.id);
    if (removed) {
      insertHistory({
        assetId: resolvedAsset.id,
        type: 'assignment',
        event: 'Assignment deleted',
        details: `Assignment removed (${assigneeName}; assigned ${format(removed.assignedAt.toDate(), 'MMM d, yyyy')}${removed.returnedAt ? `; returned ${format(removed.returnedAt.toDate(), 'MMM d, yyyy')}` : '; was open'}).`,
        userId: removed.employeeId,
        employeeId: removed.employeeId,
        timestamp: Timestamp.now(),
      });
    }
    setEditingAssignment((cur) => (cur?.id === asgn.id ? null : cur));
  };

  const currentTransferAt = useMemo(() => {
    if (!resolvedAsset.assignedTo) return null;
    const open = assignments.filter(
      (a) => a.employeeId === resolvedAsset.assignedTo && !a.returnedAt
    );
    if (open.length > 0) {
      return open.reduce((latest, a) =>
        a.assignedAt.toMillis() > latest.assignedAt.toMillis() ? a : latest
      ).assignedAt;
    }
    const fromHistory = history.find(
      (h) =>
        (h.type === 'assignment' &&
          ['Assigned', 'Assigned (swap)', 'Asset Assigned', 'Asset Swapped'].includes(h.event || '')) &&
        (h.userId === resolvedAsset.assignedTo || h.employeeId === resolvedAsset.assignedTo)
    );
    return fromHistory?.timestamp ?? null;
  }, [assignments, history, resolvedAsset.assignedTo]);

  return (
    <div
      className={cn(
        'fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4',
        nestedOverlay ? 'z-60' : 'z-50'
      )}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white w-full max-w-4xl max-h-[90vh] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white">
              <Tag size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{resolvedAsset.name || 'Untitled asset'}</h2>
              <p className="text-sm text-gray-500 font-mono">
                {resolvedAsset.serialNumber} • {resolvedAsset.deviceId}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {loading ? (
            <p className="text-gray-500 text-center py-8">Loading…</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="space-y-6">
                <section>
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Info size={14} /> Device Info
                  </h3>
                  <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Model</span>
                      <span className="font-semibold text-gray-900">{resolvedAsset.model}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Type</span>
                      <span className="font-semibold text-gray-900 capitalize">{resolvedAsset.type}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Location</span>
                      <span className="font-semibold text-gray-900">{resolvedAsset.location}</span>
                    </div>
                    {resolvedAsset.chip && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Chip</span>
                        <span className="font-semibold text-gray-900">{resolvedAsset.chip}</span>
                      </div>
                    )}
                    {resolvedAsset.ram && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">RAM</span>
                        <span className="font-semibold text-gray-900">{resolvedAsset.ram}</span>
                      </div>
                    )}
                    {resolvedAsset.storage && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Storage</span>
                        <span className="font-semibold text-gray-900">{resolvedAsset.storage}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Status</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          resolvedAsset.status === 'Inventory'
                            ? 'bg-green-100 text-green-700'
                            : resolvedAsset.status === 'Assigned'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {resolvedAsset.status}
                      </span>
                    </div>
                    {resolvedAsset.notes?.trim() && (
                      <div className="pt-3 border-t border-gray-200/80">
                        <span className="text-gray-500 text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5 mb-2">
                          <StickyNote size={12} aria-hidden /> Notes
                        </span>
                        <p className="text-sm text-gray-900 whitespace-pre-wrap leading-relaxed">
                          {resolvedAsset.notes.trim()}
                        </p>
                      </div>
                    )}
                  </div>
                </section>

                <section>
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Shield size={14} /> Warranty & AppleCare
                  </h3>
                  <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Status</span>
                      <span
                        className={`font-semibold ${resolvedAsset.warrantyStatus === 'Active' ? 'text-green-600' : 'text-red-600'}`}
                      >
                        {resolvedAsset.warrantyStatus}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Expiry</span>
                      <span className="font-semibold text-gray-900">
                        {resolvedAsset.warrantyExpiry
                          ? format(resolvedAsset.warrantyExpiry.toDate(), 'MMM dd, yyyy')
                          : 'N/A'}
                      </span>
                    </div>
                  </div>
                </section>

                {resolvedAsset.assignedTo && (
                  <section>
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                      <User size={14} /> Currently Assigned
                    </h3>
                    <div className="bg-indigo-50 rounded-2xl p-4 space-y-2">
                      <p className="font-bold text-indigo-900">{getEmployeeName(resolvedAsset.assignedTo)}</p>
                      <p className="text-xs text-indigo-600">Active assignee</p>
                      {currentTransferAt && (
                        <div className="flex justify-between items-center text-sm pt-1 border-t border-indigo-100/80">
                          <span className="text-indigo-600/90">Transferred on</span>
                          <span className="font-semibold text-indigo-900 tabular-nums">
                            {format(currentTransferAt.toDate(), 'MMM dd, yyyy')}
                          </span>
                        </div>
                      )}
                    </div>
                  </section>
                )}
              </div>

              <div className="lg:col-span-2 space-y-8">
                <section>
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <History size={14} /> Lifecycle History
                  </h3>
                  <div className="space-y-4">
                    {history.length === 0 ? (
                      <p className="text-gray-400 text-sm italic">No history recorded yet.</p>
                    ) : (
                      history.map((event) => {
                        const relatedUserId = event.userId ?? event.employeeId;
                        const isReturn = (event.type || '').toLowerCase() === 'return';
                        const isAssignment = (event.type || '').toLowerCase() === 'assignment';
                        const bucketLabel = isReturn ? 'Return' : isAssignment ? 'Assignment' : 'Activity';
                        const bucketTone = isReturn
                          ? { dot: 'bg-sky-500', text: 'text-sky-600' }
                          : isAssignment
                            ? { dot: 'bg-indigo-500', text: 'text-indigo-600' }
                            : { dot: 'bg-slate-400', text: 'text-slate-600' };
                        return (
                          <div key={event.id} className="relative pl-6 pb-4 border-l border-gray-100 last:pb-0">
                            <div
                              className={cn(
                                'absolute left-[-5px] top-1 h-2.5 w-2.5 rounded-full',
                                bucketTone.dot
                              )}
                            />
                            <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                              <div className="flex justify-between items-start mb-1">
                                <span
                                  className={cn(
                                    'text-xs font-bold uppercase tracking-wider',
                                    bucketTone.text
                                  )}
                                >
                                  {bucketLabel}
                                  <span className="ml-1.5 font-semibold normal-case text-gray-500">
                                    · {event.event ?? event.type}
                                  </span>
                                </span>
                                <span className="text-[10px] text-gray-400">
                                  {format(event.timestamp.toDate(), 'MMM dd, yyyy HH:mm')}
                                </span>
                              </div>
                              <p className="text-sm text-gray-600">{event.details ?? event.description ?? '—'}</p>
                              {relatedUserId && (
                                <p className="text-[10px] text-gray-400 mt-2">
                                  Related User: {getEmployeeName(relatedUserId)}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </section>

                <section>
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Calendar size={14} /> Assignment Logs
                  </h3>
                  <div className="overflow-hidden rounded-2xl border border-gray-100">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-gray-50 text-gray-500 font-bold uppercase text-[10px] tracking-widest">
                        <tr>
                          <th className="px-4 py-3">Employee</th>
                          <th className="px-4 py-3">Assigned</th>
                          <th className="px-4 py-3">Returned</th>
                          <th className="px-4 py-3">Condition</th>
                          <th className="px-4 py-3 max-w-[200px]">Notes</th>
                          <th className="px-4 py-3 w-28 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {assignments.map((asgn) => (
                          <tr key={asgn.id}>
                            <td className="px-4 py-3 font-medium text-gray-900">
                              {getEmployeeName(asgn.employeeId)}
                            </td>
                            <td className="px-4 py-3 text-gray-500">
                              {format(asgn.assignedAt.toDate(), 'MMM dd, yyyy')}
                            </td>
                            <td className="px-4 py-3 text-gray-500">
                              {asgn.returnedAt
                                ? format(asgn.returnedAt.toDate(), 'MMM dd, yyyy')
                                : asgn.returnDate
                                  ? `Due: ${format(asgn.returnDate.toDate(), 'MMM dd, yyyy')}`
                                  : '-'}
                            </td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-0.5 bg-gray-100 rounded-full text-[10px]">
                                {asgn.condition ?? '—'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-600 max-w-[220px]">
                              {asgn.notes?.trim() ? (
                                <span className="text-xs leading-snug line-clamp-3" title={asgn.notes.trim()}>
                                  {asgn.notes.trim()}
                                </span>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setEditingAssignment(asgn)}
                                    className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                    title="Edit assignment"
                                  >
                                    <Pencil size={16} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteAssignment(asgn)}
                                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Delete assignment"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </td>
                          </tr>
                        ))}
                        {assignments.length === 0 && (
                          <tr>
                            <td
                              colSpan={6}
                              className="px-4 py-8 text-center text-gray-400 italic"
                            >
                              No assignments recorded.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {editingAssignment && (
        <AssignmentEditForm
          assignment={editingAssignment}
          asset={resolvedAsset}
          onClose={() => setEditingAssignment(null)}
        />
      )}
    </div>
  );
}
