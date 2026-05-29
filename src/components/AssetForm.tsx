import React, { useEffect, useState } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Asset, AssetStatus, Employee, WarrantyStatus } from '../types';
import { Timestamp } from '../lib/timestamp';
import {
  insertAsset,
  patchAsset,
  insertHistory,
  insertAssignment,
  reconcileAssetAssignmentState,
  getState,
  subscribe,
  PERFORMED_BY,
} from '../data/localStore';
import { normalizeAssetTypeInput, cn } from '../lib/utils';
import { timestampFromDateInput, todayDateInputValue } from '../lib/assignmentDates';
import { X, Save, UserPlus, Search, Package, RotateCcw } from 'lucide-react';
import { motion } from 'motion/react';

const assetSchema = z.object({
  name: z.string(),
  model: z.string(),
  type: z.string(),
  serialNumber: z.string(),
  location: z.string(),
  status: z.union([
    z.enum(['Inventory', 'Assigned', 'Repaired', 'Retired', 'Stolen']),
    z.literal(''),
  ]),
  warrantyStatus: z.union([z.enum(['Active', 'Expired', 'N/A']), z.literal('')]),
  warrantyExpiry: z.string().optional(),
  purchaseDate: z.string().optional(),
  ram: z.string().optional(),
  storage: z.string().optional(),
  chip: z.string().optional(),
  notes: z.string().optional(),
});

type AssetFormData = z.infer<typeof assetSchema>;

export default function AssetForm({
  asset,
  onClose,
}: {
  asset: Partial<Asset>;
  onClose: () => void;
}) {
  const isEditing = !!asset.id;
  const [formTab, setFormTab] = useState<'details' | 'assignment'>('details');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [assignEmployeeId, setAssignEmployeeId] = useState('');
  const [assignSearch, setAssignSearch] = useState('');
  const [assignCondition, setAssignCondition] = useState('');
  const [assignNotes, setAssignNotes] = useState('');
  const [assignTransferDate, setAssignTransferDate] = useState(todayDateInputValue);
  const [assignSubTab, setAssignSubTab] = useState<'assign' | 'return'>('assign');

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

  const filteredAssignEmployees = employees.filter(
    (e) =>
      (e.name || '').toLowerCase().includes(assignSearch.toLowerCase()) ||
      (e.email || '').toLowerCase().includes(assignSearch.toLowerCase()) ||
      (e.employeeNumber || '').toLowerCase().includes(assignSearch.toLowerCase())
  );

  const { register, handleSubmit, formState: { isSubmitting } } = useForm<AssetFormData>({
    resolver: zodResolver(assetSchema),
    defaultValues: {
      name: asset.name || '',
      model: asset.model || '',
      type: asset.type || '',
      serialNumber: asset.serialNumber || '',
      location: asset.location || '',
      status: asset.status || '',
      warrantyStatus: asset.warrantyStatus || '',
      warrantyExpiry: asset.warrantyExpiry
        ? asset.warrantyExpiry.toDate().toISOString().split('T')[0]
        : '',
      purchaseDate: asset.purchaseDate
        ? asset.purchaseDate.toDate().toISOString().split('T')[0]
        : '',
      ram: asset.ram || '',
      storage: asset.storage || '',
      chip: asset.chip || '',
      notes: asset.notes || '',
    },
  });

  const onSubmit: SubmitHandler<AssetFormData> = async (data) => {
    const now = Timestamp.now();
    const purchaseDate = data.purchaseDate?.trim()
      ? Timestamp.fromDate(new Date(data.purchaseDate))
      : undefined;
    const warrantyExpiry = data.warrantyExpiry?.trim()
      ? Timestamp.fromDate(new Date(data.warrantyExpiry))
      : undefined;

    const { purchaseDate: _pd, warrantyExpiry: _we, status: st, warrantyStatus: ws, ...textFields } = data;

    let status: AssetStatus = (st || 'Inventory') as AssetStatus;
    const warrantyStatus: WarrantyStatus = (ws || 'N/A') as WarrantyStatus;

    if (!isEditing && assignEmployeeId) {
      status = 'Inventory';
    }

    const payload = {
      name: textFields.name.trim(),
      model: textFields.model.trim(),
      type: normalizeAssetTypeInput(textFields.type),
      serialNumber: textFields.serialNumber.trim(),
      location: textFields.location.trim(),
      status,
      warrantyStatus,
      ram: textFields.ram?.trim() || undefined,
      storage: textFields.storage?.trim() || undefined,
      chip: textFields.chip?.trim() || undefined,
      notes: textFields.notes?.trim() || undefined,
      purchaseDate,
      warrantyExpiry,
    };

    if (isEditing) {
      patchAsset(asset.id!, {
        ...payload,
        updatedAt: now,
      });

      const prevStatus = asset.status ?? 'Inventory';
      if (prevStatus !== status) {
        insertHistory({
          assetId: asset.id!,
          type: 'StatusChange',
          description: `Status changed from ${prevStatus} to ${status}`,
          timestamp: now,
          performedBy: PERFORMED_BY,
        });
      }
    } else {
      const deviceId = `DEV-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
      const newId = insertAsset({
        ...payload,
        deviceId,
        createdAt: now,
        updatedAt: now,
      });

      insertHistory({
        assetId: newId,
        type: 'Creation',
        description: `Asset created with Device ID: ${deviceId}`,
        timestamp: now,
        performedBy: PERFORMED_BY,
      });

      if (assignEmployeeId) {
        const transferAt = timestampFromDateInput(assignTransferDate);
        const assigneeName = employees.find((emp) => emp.id === assignEmployeeId)?.name || 'employee';

        insertAssignment({
          assetId: newId,
          employeeId: assignEmployeeId,
          assignedAt: transferAt,
          returnedAt: undefined,
          returnDate: null,
          condition: assignCondition || undefined,
          notes: assignNotes.trim() || undefined,
        });

        reconcileAssetAssignmentState(newId);

        insertHistory({
          assetId: newId,
          type: 'assignment',
          event: 'Assigned',
          details: `Checked out to ${assigneeName} when asset was created. Condition: ${assignCondition || '—'}.`,
          userId: assignEmployeeId,
          employeeId: assignEmployeeId,
          timestamp: transferAt,
        });
      }
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{isEditing ? 'Edit Asset' : 'Add New Asset'}</h2>
            {asset.deviceId && <p className="text-xs text-indigo-600 font-mono">{asset.deviceId}</p>}
          </div>
          <button type="button" onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        {!isEditing && (
          <div className="flex border-b border-gray-100 px-4 pt-2 gap-1 bg-white shrink-0">
            <button
              type="button"
              onClick={() => setFormTab('details')}
              className={cn(
                'flex-1 py-3 text-sm font-bold rounded-t-xl transition-colors border-b-2 -mb-px',
                formTab === 'details'
                  ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              )}
            >
              <span className="inline-flex items-center justify-center gap-2">
                <Package size={16} />
                Details
              </span>
            </button>
            <button
              type="button"
              onClick={() => setFormTab('assignment')}
              className={cn(
                'flex-1 py-3 text-sm font-bold rounded-t-xl transition-colors border-b-2 -mb-px',
                formTab === 'assignment'
                  ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              )}
            >
              <span className="inline-flex items-center justify-center gap-2">
                <UserPlus size={16} />
                Assignment
                {assignEmployeeId && (
                  <span className="rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
                    1
                  </span>
                )}
              </span>
            </button>
          </div>
        )}

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col flex-1 min-h-0"
        >
          <div
            className={cn(
              'p-6 space-y-4 overflow-y-auto custom-scrollbar flex-1',
              !isEditing && formTab === 'assignment' && 'hidden'
            )}
          >
            <p className="text-xs text-gray-400 -mt-2 mb-2">
              All fields are optional. Status and warranty default when left unset.
              {!isEditing && (
                <span className="block mt-1 text-indigo-600">
                  Use the <strong>Assignment</strong> tab to check out this device to someone when saving.
                </span>
              )}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Asset Name</label>
              <input
                {...register('name')}
                className="w-full px-4 py-2 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all"
                placeholder="e.g. MacBook Pro 16"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Model</label>
              <input
                {...register('model')}
                className="w-full px-4 py-2 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all"
                placeholder="e.g. A2485 (M1 Max)"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Type</label>
              <input
                {...register('type')}
                className="w-full px-4 py-2 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all"
                placeholder="e.g. Laptop, Monitor"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Serial Number</label>
              <input
                {...register('serialNumber')}
                className="w-full px-4 py-2 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all font-mono"
                placeholder="SN-123456789"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Location</label>
              <input
                {...register('location')}
                className="w-full px-4 py-2 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all"
                placeholder="e.g. HQ - Floor 2"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Status</label>
              <select
                {...register('status')}
                className="w-full px-4 py-2 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all"
              >
                <option value="">Not set (defaults to Inventory)</option>
                <option value="Inventory">Inventory</option>
                <option value="Assigned">Assigned</option>
                <option value="Repaired">Repaired</option>
                <option value="Retired">Retired</option>
                <option value="Stolen">Stolen</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Warranty Status</label>
              <select
                {...register('warrantyStatus')}
                className="w-full px-4 py-2 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all"
              >
                <option value="">Not set (defaults to N/A)</option>
                <option value="Active">Active</option>
                <option value="Expired">Expired</option>
                <option value="N/A">N/A</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Warranty Expiry</label>
              <input
                type="date"
                {...register('warrantyExpiry')}
                className="w-full px-4 py-2 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Purchase Date</label>
              <input
                type="date"
                {...register('purchaseDate')}
                className="w-full px-4 py-2 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Chip / Processor</label>
              <input
                {...register('chip')}
                className="w-full px-4 py-2 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all"
                placeholder="e.g. Apple M2 Max"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">RAM</label>
              <input
                {...register('ram')}
                className="w-full px-4 py-2 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all"
                placeholder="e.g. 32GB"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Storage</label>
              <input
                {...register('storage')}
                className="w-full px-4 py-2 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all"
                placeholder="e.g. 1TB SSD"
              />
            </div>

            <div className="col-span-1 md:col-span-2 space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Notes</label>
              <textarea
                {...register('notes')}
                rows={3}
                className="w-full px-4 py-2 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all resize-none"
                placeholder="Any additional details..."
              />
            </div>
          </div>
          </div>

          {!isEditing && (
            <div
              className={cn(
                'p-6 space-y-4 overflow-y-auto custom-scrollbar flex-1',
                formTab === 'details' && 'hidden'
              )}
            >
              <p className="text-xs text-gray-500">
                Optional: pick who receives this device when you save. To check a device back in later, open the asset in
                the list and use <strong>Assign or return</strong> → <strong>Return</strong>.
              </p>

              <div className="flex gap-1 rounded-2xl bg-gray-100/90 p-1">
                <button
                  type="button"
                  onClick={() => setAssignSubTab('assign')}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition-all sm:text-sm',
                    assignSubTab === 'assign'
                      ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-indigo-100'
                      : 'text-gray-500 hover:text-gray-800'
                  )}
                >
                  <UserPlus size={16} />
                  Assign to employees
                </button>
                <button
                  type="button"
                  onClick={() => setAssignSubTab('return')}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition-all sm:text-sm',
                    assignSubTab === 'return'
                      ? 'bg-white text-sky-700 shadow-sm ring-1 ring-sky-100'
                      : 'text-gray-500 hover:text-gray-800'
                  )}
                >
                  <RotateCcw size={16} />
                  Return
                </button>
              </div>

              {assignSubTab === 'return' ? (
                <div className="rounded-2xl border border-sky-100 bg-sky-50/80 p-4 text-sm leading-relaxed text-sky-900">
                  <p className="font-semibold text-sky-950">Return after the asset is saved</p>
                  <p className="mt-2 text-xs text-sky-800/90">
                    New assets must be saved first. Then use <strong>Assign</strong> on the asset row and open the{' '}
                    <strong>Return</strong> tab to check the device back into inventory.
                  </p>
                </div>
              ) : (
                <>
              <div className="space-y-3">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Select employee (all statuses)
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <input
                    type="text"
                    placeholder="Search employees..."
                    value={assignSearch}
                    onChange={(e) => setAssignSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
                  />
                </div>

                <div className="max-h-52 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                  {filteredAssignEmployees.map((emp) => (
                    <button
                      key={emp.id}
                      type="button"
                      onClick={() => setAssignEmployeeId(emp.id)}
                      className={cn(
                        'w-full p-3 rounded-xl border-2 text-left transition-all flex items-center justify-between',
                        assignEmployeeId === emp.id
                          ? 'border-indigo-500 bg-indigo-50'
                          : 'border-transparent bg-gray-50 hover:bg-gray-100'
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-gray-900 truncate">{emp.name}</p>
                          <span
                            className={cn(
                              'shrink-0 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded',
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
                      {assignEmployeeId === emp.id && <div className="w-4 h-4 bg-indigo-500 rounded-full shrink-0" />}
                    </button>
                  ))}
                  {filteredAssignEmployees.length === 0 && (
                    <p className="text-center py-4 text-sm text-gray-400 italic">No employees match your search</p>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setAssignEmployeeId('')}
                className="text-xs font-semibold text-gray-500 hover:text-indigo-600"
              >
                Clear selection
              </button>

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Date transferred</label>
                <input
                  type="date"
                  value={assignTransferDate}
                  onChange={(e) => setAssignTransferDate(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all"
                />
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Condition (optional)</label>
                  <select
                    value={assignCondition}
                    onChange={(e) => setAssignCondition(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all"
                  >
                    <option value="">Not set</option>
                    <option>Excellent</option>
                    <option>Good</option>
                    <option>Fair</option>
                    <option>Poor</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Assignment notes (optional)
                </label>
                <textarea
                  value={assignNotes}
                  onChange={(e) => setAssignNotes(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-2 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all resize-none"
                  placeholder="e.g. Issued for remote work"
                />
              </div>
                </>
              )}
            </div>
          )}

          <div className="p-6 pt-2 flex gap-3 border-t border-gray-100 bg-gray-50/50 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Save size={20} />
              {isSubmitting ? 'Saving...' : !isEditing && assignEmployeeId ? 'Save & assign' : 'Save Asset'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
