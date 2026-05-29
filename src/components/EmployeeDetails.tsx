import React, { useState, useEffect } from 'react';
import { subscribe, getState, deleteAssignment, insertHistory } from '../data/localStore';
import { Timestamp } from '../lib/timestamp';
import { Asset, HistoryEvent, Employee, Assignment } from '../types';
import { X, History, User, Calendar, Tag, Info, Laptop, Monitor, Keyboard, Mouse, Package, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import { format } from 'date-fns';
import { cn, sortHistoryNewestFirst } from '../lib/utils';
import AssetDetails from './AssetDetails';

const TypeIcon = ({ type }: { type: string }) => {
  const t = (type || '').trim().toLowerCase();
  switch (t) {
    case 'laptop':
      return <Laptop size={16} />;
    case 'monitor':
      return <Monitor size={16} />;
    case 'keyboard':
      return <Keyboard size={16} />;
    case 'mouse':
      return <Mouse size={16} />;
    default:
      return <Package size={16} />;
  }
};

export default function EmployeeDetails({
  employee,
  onClose,
  isAdmin = false,
}: {
  employee: Employee;
  onClose: () => void;
  isAdmin?: boolean;
}) {
  const [history, setHistory] = useState<HistoryEvent[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [assetDetail, setAssetDetail] = useState<Asset | null>(null);

  useEffect(() => {
    const sync = () => {
      const s = getState();
      setAssets(s.assets);
      setHistory(
        s.history
          .filter((h) => h.userId === employee.id || h.employeeId === employee.id)
          .sort(sortHistoryNewestFirst)
      );
      setAssignments(
        s.assignments
          .filter((a) => a.employeeId === employee.id)
          .sort((a, b) => b.assignedAt.toMillis() - a.assignedAt.toMillis())
      );
      setLoading(false);
    };
    sync();
    return subscribe(sync);
  }, [employee.id]);

  const getAssetName = (id: string) => assets.find((a) => a.id === id)?.name || 'Unknown Asset';
  const getAssetSerial = (id: string) => assets.find((a) => a.id === id)?.serialNumber || 'Unknown Serial';
  const getAssetType = (id: string) => assets.find((a) => a.id === id)?.type || 'other';
  const getAssetById = (id: string) => assets.find((a) => a.id === id);

  const activeAssets = assets.filter((a) => a.assignedTo === employee.id);

  const openAssetDetail = (assetId: string) => {
    const a = getAssetById(assetId);
    if (a) setAssetDetail(a);
  };

  const handleDeleteAssignment = (asgn: Assignment) => {
    if (!isAdmin) return;
    const assetName = getAssetName(asgn.assetId);
    if (
      !window.confirm(
        `Delete assignment for ${assetName}? The asset checkout state will be updated from any remaining rows.`
      )
    )
      return;
    const removed = deleteAssignment(asgn.id);
    if (removed) {
      insertHistory({
        assetId: removed.assetId,
        type: 'assignment',
        event: 'Assignment deleted',
        details: `Assignment removed (${employee.name}; asset ${assetName}; assigned ${format(removed.assignedAt.toDate(), 'MMM d, yyyy')}${removed.returnedAt ? `; returned ${format(removed.returnedAt.toDate(), 'MMM d, yyyy')}` : '; was open'}).`,
        userId: removed.employeeId,
        employeeId: removed.employeeId,
        timestamp: Timestamp.now(),
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white w-full max-w-4xl max-h-[90vh] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white">
              <User size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{employee.name || 'Unnamed'}</h2>
              <p className="text-sm text-gray-500 font-mono">
                {employee.employeeNumber || '—'} • {employee.department || 'General'}
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
                    <Info size={14} /> Profile Info
                  </h3>
                  <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Email</span>
                      <span className="font-semibold text-gray-900 truncate max-w-[150px]">{employee.email}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Location</span>
                      <span className="font-semibold text-gray-900">{employee.location}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Employee type</span>
                      <span className="font-semibold text-gray-900">
                        {employee.employeeType ?? 'Regular'}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Status</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          employee.status === 'Active'
                            ? 'bg-green-100 text-green-700'
                            : employee.status === 'On Leave'
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {employee.status}
                      </span>
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Tag size={14} /> Currently Assigned Assets
                  </h3>
                  <div className="space-y-3">
                    {activeAssets.length === 0 ? (
                      <p className="text-gray-400 text-sm italic">No assets currently assigned.</p>
                    ) : (
                      activeAssets.map((asset) => (
                        <button
                          key={asset.id}
                          type="button"
                          onClick={() => setAssetDetail(asset)}
                          className="w-full text-left bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex items-center gap-3 hover:border-indigo-300 hover:bg-indigo-50/90 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                          aria-label={`View details for ${asset.name || 'asset'}`}
                        >
                          <div className="p-2 bg-white rounded-xl text-indigo-600 shadow-sm">
                            <TypeIcon type={asset.type} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-indigo-900 truncate">{asset.name}</p>
                            <p className="text-[10px] text-indigo-400 font-mono truncate">{asset.serialNumber}</p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </section>
              </div>

              <div className="lg:col-span-2 space-y-8">
                <section>
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <History size={14} /> Activity History
                  </h3>
                  <div className="space-y-4">
                    {history.length === 0 ? (
                      <p className="text-gray-400 text-sm italic">No history recorded yet.</p>
                    ) : (
                      history.map((event) => {
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
                            {event.assetId && (
                              <button
                                type="button"
                                disabled={!getAssetById(event.assetId)}
                                onClick={() => openAssetDetail(event.assetId!)}
                                className="text-[10px] text-indigo-600 mt-2 hover:underline disabled:text-gray-400 disabled:no-underline disabled:cursor-not-allowed text-left"
                              >
                                Related asset: {getAssetName(event.assetId)} ({getAssetSerial(event.assetId)})
                              </button>
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
                          <th className="px-4 py-3">Asset</th>
                          <th className="px-4 py-3">Assigned</th>
                          <th className="px-4 py-3">Returned</th>
                          <th className="px-4 py-3">Condition</th>
                          {isAdmin && <th className="px-4 py-3 w-14 text-right"> </th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {assignments.map((asgn) => (
                          <tr key={asgn.id}>
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                disabled={!getAssetById(asgn.assetId)}
                                onClick={() => openAssetDetail(asgn.assetId)}
                                className="group flex items-center gap-2 text-left rounded-lg -mx-1 -my-0.5 px-1 py-0.5 hover:bg-indigo-50 disabled:hover:bg-transparent disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                                aria-label={`View ${getAssetName(asgn.assetId)}`}
                              >
                                <TypeIcon type={getAssetType(asgn.assetId)} />
                                <span className="font-medium text-gray-900 underline-offset-2 group-hover:underline">
                                  {getAssetName(asgn.assetId)}
                                </span>
                              </button>
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
                            {isAdmin && (
                              <td className="px-4 py-3">
                                <div className="flex justify-end">
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
                            )}
                          </tr>
                        ))}
                        {assignments.length === 0 && (
                          <tr>
                            <td
                              colSpan={isAdmin ? 5 : 4}
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

      {assetDetail && (
        <AssetDetails
          asset={assetDetail}
          onClose={() => setAssetDetail(null)}
          isAdmin={isAdmin}
          nestedOverlay
        />
      )}
    </div>
  );
}
