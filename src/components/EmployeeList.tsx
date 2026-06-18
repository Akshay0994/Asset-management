import React, { useState, useEffect, useMemo } from 'react';
import {
  subscribe,
  getState,
  patchEmployee,
  deleteEmployee,
  deleteEmployees,
  upsertEmployeeByEmployeeNumber,
} from '../data/localStore';
import { Timestamp } from '../lib/timestamp';
import { Employee, EmployeeType, EmploymentStatus, Asset } from '../types';
import {
  Users,
  Plus,
  Trash2,
  Edit,
  Mail,
  Building,
  History,
  FileSpreadsheet,
  LayoutGrid,
  List,
} from 'lucide-react';
import EmployeeExcelImportDialog from './EmployeeExcelImportDialog';
import BulkSelectionBar from './BulkSelectionBar';
import { motion, AnimatePresence } from 'motion/react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { cn } from '../lib/utils';

const DEPT_EMPTY = '__empty__';
const MS_DAY = 86_400_000;

function employeeMatchesJoined(emp: Employee, filterJoined: string): boolean {
  if (filterJoined === 'all') return true;
  const c = emp.createdAt.toMillis();
  const now = Date.now();
  if (filterJoined === 'last_30d') return c >= now - 30 * MS_DAY;
  if (filterJoined === 'last_90d') return c >= now - 90 * MS_DAY;
  if (filterJoined === 'last_year') return c >= now - 365 * MS_DAY;
  if (filterJoined === 'older') return c < now - 365 * MS_DAY;
  return true;
}

const employeeSchema = z.object({
  name: z.string(),
  employeeNumber: z.string(),
  email: z.union([z.literal(''), z.string().email('Enter a valid email address')]),
  department: z.string().optional(),
  location: z.string(),
  employeeType: z.enum(['Regular', 'Intern', 'Contract']),
  status: z.union([z.enum(['Active', 'Inactive', 'On Leave']), z.literal('')]),
});

type EmployeeFormData = z.infer<typeof employeeSchema>;

function resolveEmployeeType(emp: Employee): EmployeeType {
  return emp.employeeType ?? 'Regular';
}

export default function EmployeeList({
  onView,
  searchQuery,
}: {
  onView: (employee: Employee) => void;
  searchQuery: string;
}) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterLocation, setFilterLocation] = useState<string>('all');
  const [filterEmployeeType, setFilterEmployeeType] = useState<string>('all');
  const [filterDepartment, setFilterDepartment] = useState<string>('all');
  const [filterEmail, setFilterEmail] = useState<string>('all');
  const [filterJoined, setFilterJoined] = useState<string>('all');
  const [filterHardware, setFilterHardware] = useState<string>('all');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [importExcelOpen, setImportExcelOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<EmployeeFormData>({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      name: '',
      employeeNumber: '',
      email: '',
      department: '',
      location: '',
      employeeType: 'Regular' as const,
      status: '',
    },
  });

  useEffect(() => {
    const sync = () => {
      const s = getState();
      setEmployees(s.employees);
      setAssets(s.assets);
    };
    sync();
    return subscribe(sync);
  }, []);

  useEffect(() => {
    if (editingEmployee) {
      reset({
        name: editingEmployee.name,
        employeeNumber: editingEmployee.employeeNumber,
        email: editingEmployee.email,
        department: editingEmployee.department || '',
        location: editingEmployee.location || '',
        employeeType: resolveEmployeeType(editingEmployee),
        status: editingEmployee.status,
      });
    } else {
      reset({
        name: '',
        employeeNumber: '',
        email: '',
        department: '',
        location: '',
        employeeType: 'Regular',
        status: '',
      });
    }
  }, [editingEmployee, reset]);

  const onSubmit: SubmitHandler<EmployeeFormData> = async (data) => {
    const now = Timestamp.now();
    const status: EmploymentStatus = (data.status || 'Active') as EmploymentStatus;
    const row = {
      name: data.name.trim(),
      employeeNumber: data.employeeNumber.trim(),
      email: data.email.trim(),
      department: data.department?.trim() || undefined,
      location: data.location.trim(),
      employeeType: data.employeeType,
      status,
      updatedAt: now,
    };
    if (editingEmployee) {
      patchEmployee(editingEmployee.id, row);
    } else {
      upsertEmployeeByEmployeeNumber({
        name: row.name,
        employeeNumber: row.employeeNumber,
        email: row.email,
        department: row.department,
        location: row.location,
        employeeType: row.employeeType,
        status,
      });
    }
    setIsFormOpen(false);
    setEditingEmployee(null);
  };

  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      const matchesSearch =
        (emp.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (emp.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (emp.employeeNumber || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (emp.department || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = filterStatus === 'all' || emp.status === filterStatus;
      const matchesLocation = filterLocation === 'all' || emp.location === filterLocation;
      const matchesType =
        filterEmployeeType === 'all' || resolveEmployeeType(emp) === filterEmployeeType;
      const deptTrim = (emp.department || '').trim();
      const matchesDepartment =
        filterDepartment === 'all' ||
        (filterDepartment === DEPT_EMPTY && !deptTrim) ||
        (filterDepartment !== DEPT_EMPTY && deptTrim === filterDepartment);
      const emailTrim = (emp.email || '').trim();
      const matchesEmail =
        filterEmail === 'all' ||
        (filterEmail === 'has' && !!emailTrim) ||
        (filterEmail === 'missing' && !emailTrim);
      const matchesJoined = employeeMatchesJoined(emp, filterJoined);
      const hasAssignedAsset = assets.some((a) => a.assignedTo === emp.id);
      const matchesHardware =
        filterHardware === 'all' ||
        (filterHardware === 'has_asset' && hasAssignedAsset) ||
        (filterHardware === 'none' && !hasAssignedAsset);
      return (
        matchesSearch &&
        matchesStatus &&
        matchesLocation &&
        matchesType &&
        matchesDepartment &&
        matchesEmail &&
        matchesJoined &&
        matchesHardware
      );
    });
  }, [
    employees,
    assets,
    searchQuery,
    filterStatus,
    filterLocation,
    filterEmployeeType,
    filterDepartment,
    filterEmail,
    filterJoined,
    filterHardware,
  ]);

  const filteredIdSet = useMemo(() => new Set(filteredEmployees.map((e) => e.id)), [filteredEmployees]);
  const allFilteredSelected =
    filteredEmployees.length > 0 && filteredEmployees.every((e) => selectedIds.has(e.id));

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const e of filteredEmployees) next.delete(e.id);
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const e of filteredEmployees) next.add(e.id);
        return next;
      });
    }
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkDelete = () => {
    const ids = [...selectedIds].filter((id) => filteredIdSet.has(id));
    if (ids.length === 0) return;
    if (
      !window.confirm(
        `Delete ${ids.length} employee(s)? Their asset assignment links will remain on assets until reassigned.`
      )
    )
      return;
    deleteEmployees(ids);
    clearSelection();
  };

  const locations = Array.from(new Set(employees.map((e) => e.location))).filter(Boolean);
  const departmentSet = new Set<string>();
  for (const e of employees) {
    const d = (e.department || '').trim();
    if (d) departmentSet.add(d);
  }
  const departments = Array.from(departmentSet).sort((a, b) => a.localeCompare(b));
  const hasDeptMissing = employees.some((e) => !(e.department || '').trim());

  const handleDelete = (id: string) => {
    if (!window.confirm('Are you sure? This will not remove their asset assignments.')) return;
    deleteEmployee(id);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Employees</h2>
          <p className="text-gray-500 text-sm">
            Manage staff and departments. Search from the top bar by name, email, employee ID, or department.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setImportExcelOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-800 rounded-xl font-medium hover:bg-gray-50 transition-colors shadow-sm"
            >
              <FileSpreadsheet size={20} />
              Import Excel
            </button>
            <button
              type="button"
              onClick={() => {
                setIsFormOpen(true);
                setEditingEmployee(null);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors shadow-sm"
            >
              <Plus size={20} />
              Add Employee
            </button>
          </div>
      </div>

      <div className="flex flex-col gap-4 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="flex flex-wrap items-center gap-4 flex-1 min-w-0">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
            >
              <option value="all">All Status</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="On Leave">On Leave</option>
            </select>
            <select
              value={filterLocation}
              onChange={(e) => setFilterLocation(e.target.value)}
              className="px-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
            >
              <option value="all">All Locations</option>
              {locations.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
            <select
              value={filterEmployeeType}
              onChange={(e) => setFilterEmployeeType(e.target.value)}
              className="px-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
            >
              <option value="all">All types</option>
              <option value="Regular">Regular</option>
              <option value="Intern">Intern</option>
              <option value="Contract">Contract</option>
            </select>
          </div>
          <div
            className="flex shrink-0 items-center gap-0.5 rounded-xl border border-gray-200 bg-gray-50 p-0.5"
            role="group"
            aria-label="View as grid or list"
          >
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              aria-pressed={viewMode === 'grid'}
              title="Grid view"
              className={cn(
                'rounded-lg p-2 transition-all',
                viewMode === 'grid'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-800'
              )}
            >
              <LayoutGrid size={18} aria-hidden />
              <span className="sr-only">Grid view</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              aria-pressed={viewMode === 'list'}
              title="List view"
              className={cn(
                'rounded-lg p-2 transition-all',
                viewMode === 'list'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-800'
              )}
            >
              <List size={18} aria-hidden />
              <span className="sr-only">List view</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 border-t border-gray-100 pt-4">
          <select
            value={filterDepartment}
            onChange={(e) => setFilterDepartment(e.target.value)}
            className="px-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
            aria-label="Filter by department"
          >
            <option value="all">All departments</option>
            {hasDeptMissing && <option value={DEPT_EMPTY}>No department</option>}
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <select
            value={filterEmail}
            onChange={(e) => setFilterEmail(e.target.value)}
            className="px-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
            aria-label="Filter by email"
          >
            <option value="all">Any email</option>
            <option value="has">Has email</option>
            <option value="missing">Missing email</option>
          </select>
          <select
            value={filterJoined}
            onChange={(e) => setFilterJoined(e.target.value)}
            className="px-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
            aria-label="Filter by record age"
          >
            <option value="all">Any hire / record date</option>
            <option value="last_30d">Added in last 30 days</option>
            <option value="last_90d">Added in last 90 days</option>
            <option value="last_year">Added in last year</option>
            <option value="older">Added over a year ago</option>
          </select>
          <select
            value={filterHardware}
            onChange={(e) => setFilterHardware(e.target.value)}
            className="px-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
            aria-label="Filter by assigned hardware"
          >
            <option value="all">All (hardware)</option>
            <option value="has_asset">Has asset assigned</option>
            <option value="none">No asset assigned</option>
          </select>
        </div>

        <BulkSelectionBar
          filteredCount={filteredEmployees.length}
          selectedCount={[...selectedIds].filter((id) => filteredIdSet.has(id)).length}
          allFilteredSelected={allFilteredSelected}
          onToggleSelectAll={toggleSelectAllFiltered}
          onClearSelection={clearSelection}
          onBulkDelete={handleBulkDelete}
          nounSingular="employee"
        />
      </div>

      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence mode="popLayout">
            {filteredEmployees.map((emp) => (
              <motion.div
                layout
                key={emp.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={cn(
                  'bg-white p-6 rounded-2xl border shadow-sm hover:shadow-md transition-all',
                  selectedIds.has(emp.id)
                    ? 'border-indigo-300 ring-2 ring-indigo-500/30'
                    : 'border-gray-100'
                )}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-start gap-3">
                    <label className="mt-3 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(emp.id)}
                        onChange={() => toggleSelect(emp.id)}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        aria-label={`Select ${emp.name || 'employee'}`}
                      />
                    </label>
                    <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
                      <Users size={24} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onView(emp)}
                      className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                      title="View Details"
                    >
                      <History size={16} />
                    </button>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${
                        resolveEmployeeType(emp) === 'Regular'
                          ? 'bg-indigo-50 text-indigo-600'
                          : resolveEmployeeType(emp) === 'Intern'
                            ? 'bg-violet-50 text-violet-600'
                            : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {resolveEmployeeType(emp)}
                    </span>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${
                        emp.status === 'Active'
                          ? 'bg-green-50 text-green-600'
                          : emp.status === 'On Leave'
                            ? 'bg-yellow-50 text-yellow-600'
                            : 'bg-gray-50 text-gray-500'
                      }`}
                    >
                      {emp.status}
                    </span>
                    <div className="flex gap-1">
                        <button
                          onClick={() => {
                            setEditingEmployee(emp);
                            setIsFormOpen(true);
                          }}
                          className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(emp.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <h3 className="font-bold text-gray-900 text-lg">{emp.name || 'Unnamed'}</h3>
                    <p className="text-xs text-gray-400 font-mono">{emp.employeeNumber || '—'}</p>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Mail size={14} />
                      <span className="truncate">{emp.email}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Building size={14} />
                      <span>
                        {emp.department || 'General'} • {emp.location}
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
          <AnimatePresence mode="popLayout">
            {filteredEmployees.map((emp) => (
              <motion.div
                layout
                key={emp.id}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className={cn(
                  'flex flex-col gap-3 border-b border-gray-100 p-4 last:border-b-0 hover:bg-gray-50/60 sm:flex-row sm:items-center sm:gap-4',
                  selectedIds.has(emp.id) && 'bg-indigo-50/40'
                )}
              >
                <label className="flex shrink-0 items-center" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(emp.id)}
                    onChange={() => toggleSelect(emp.id)}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    aria-label={`Select ${emp.name || 'employee'}`}
                  />
                </label>
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                  <Users size={22} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-bold text-gray-900">{emp.name || 'Unnamed'}</h3>
                  <p className="text-xs text-gray-400 font-mono">{emp.employeeNumber || '—'}</p>
                </div>
                <div className="min-w-0 flex-1 sm:max-w-[220px]">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Mail size={14} className="shrink-0 text-gray-400" />
                    <span className="truncate">{emp.email || '—'}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                    <Building size={12} className="shrink-0 text-gray-400" />
                    <span className="truncate">
                      {emp.department || 'General'} • {emp.location || '—'}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${
                      resolveEmployeeType(emp) === 'Regular'
                        ? 'bg-indigo-50 text-indigo-600'
                        : resolveEmployeeType(emp) === 'Intern'
                          ? 'bg-violet-50 text-violet-600'
                          : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    {resolveEmployeeType(emp)}
                  </span>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${
                      emp.status === 'Active'
                        ? 'bg-green-50 text-green-600'
                        : emp.status === 'On Leave'
                          ? 'bg-yellow-50 text-yellow-600'
                          : 'bg-gray-50 text-gray-500'
                    }`}
                  >
                    {emp.status}
                  </span>
                </div>
                <div className="flex shrink-0 items-center justify-end gap-1 sm:ml-auto">
                  <button
                    type="button"
                    onClick={() => onView(emp)}
                    className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
                    title="View Details"
                  >
                    <History size={16} />
                  </button>
                  <>
                    <button
                        type="button"
                        onClick={() => {
                          setEditingEmployee(emp);
                          setIsFormOpen(true);
                        }}
                        className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
                        title="Edit"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(emp.id)}
                        className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <EmployeeExcelImportDialog open={importExcelOpen} onClose={() => setImportExcelOpen(false)} />

      {isFormOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-6"
          >
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              {editingEmployee ? 'Edit Employee' : 'Add Employee'}
            </h2>
            <p className="text-xs text-gray-400 mb-6">All fields are optional. Status defaults to Active when unset.</p>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Full Name</label>
                  <input
                    {...register('name')}
                    className="w-full px-4 py-2 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all"
                    placeholder="John Doe"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Employee ID</label>
                  <input
                    {...register('employeeNumber')}
                    className="w-full px-4 py-2 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all font-mono"
                    placeholder="EMP001"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Email Address</label>
                <input
                  {...register('email')}
                  className="w-full px-4 py-2 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all"
                  placeholder="john@company.com"
                />
                {errors.email && <p className="text-red-500 text-[10px]">{errors.email.message}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Department</label>
                  <input
                    {...register('department')}
                    className="w-full px-4 py-2 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all"
                    placeholder="e.g. Engineering"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Location</label>
                  <input
                    {...register('location')}
                    className="w-full px-4 py-2 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all"
                    placeholder="e.g. New York"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Employee type</label>
                  <select
                    {...register('employeeType')}
                    className="w-full px-4 py-2 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all"
                  >
                    <option value="Regular">Regular</option>
                    <option value="Intern">Intern</option>
                    <option value="Contract">Contract</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Status</label>
                  <select
                    {...register('status')}
                    className="w-full px-4 py-2 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all"
                  >
                    <option value="">Not set (defaults to Active)</option>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                    <option value="On Leave">On Leave</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsFormOpen(false);
                    setEditingEmployee(null);
                  }}
                  className="flex-1 px-4 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : 'Save Employee'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
