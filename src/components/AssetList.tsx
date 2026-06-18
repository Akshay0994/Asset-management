import React, { useState, useEffect, useMemo } from 'react';
import { subscribe, getState, deleteAsset, deleteAssets } from '../data/localStore';
import {
  Asset,
  ASSET_LIST_STATUS_RETIRED_STOLEN,
  ASSET_LIST_WARRANTY_EXPIRING_30D,
  AssetListNavigateFilters,
  Employee,
} from '../types';
import {
  Plus,
  MoreVertical,
  Trash2,
  Edit,
  UserPlus,
  Laptop,
  Monitor,
  Keyboard,
  Mouse,
  Package,
  History,
  LayoutGrid,
  List,
  FileSpreadsheet,
} from 'lucide-react';
import AssetExcelImportDialog from './AssetExcelImportDialog';
import BulkSelectionBar from './BulkSelectionBar';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

function assetMatchesWarrantyFilter(asset: Asset, filterWarranty: string): boolean {
  if (filterWarranty === 'all') return true;
  if (filterWarranty === ASSET_LIST_WARRANTY_EXPIRING_30D) {
    if (!asset.warrantyExpiry) return false;
    const days =
      (asset.warrantyExpiry.toDate().getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return days > 0 && days < 30;
  }
  return asset.warrantyStatus === filterWarranty;
}

/** Select value for assets with no RAM / storage / chip recorded */
const ASSET_SPEC_EMPTY = '__empty__';
const MS_YEAR_APPROX = 365.25 * 86_400_000;

function assetMatchesPurchaseFilter(asset: Asset, filterPurchase: string): boolean {
  if (filterPurchase === 'all') return true;
  const pd = asset.purchaseDate;
  if (filterPurchase === 'unset') return !pd;
  if (!pd) return false;
  const now = Date.now();
  const t = pd.toMillis();
  if (filterPurchase === 'last_12m') return t >= now - MS_YEAR_APPROX;
  if (filterPurchase === 'last_3y') return t >= now - 3 * MS_YEAR_APPROX;
  if (filterPurchase === 'older_3y') return t < now - 3 * MS_YEAR_APPROX;
  return true;
}

function matchesSpecFilter(field: string | undefined, filterVal: string): boolean {
  if (filterVal === 'all') return true;
  const v = (field || '').trim();
  if (filterVal === ASSET_SPEC_EMPTY) return v === '';
  return v === filterVal;
}

function assetMatchesMacBookLineFilter(asset: Asset, filterMacBookLine: string): boolean {
  if (filterMacBookLine === 'all') return true;
  const haystack = `${asset.name || ''} ${asset.model || ''}`.toLowerCase();
  if (filterMacBookLine === 'air') return haystack.includes('macbook air');
  if (filterMacBookLine === 'pro') return haystack.includes('macbook pro');
  return true;
}

function typeTabLabel(normalizedKey: string): string {
  if (!normalizedKey) return 'Unspecified';
  if (normalizedKey === 'mouse') return 'Mice';
  return normalizedKey.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

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

export default function AssetList({
  onEdit,
  onAssign,
  onView,
  navigateFilters,
  onNavigateFiltersApplied,
  searchQuery,
  onSearchChange,
}: {
  onEdit: (asset: Asset) => void;
  onAssign: (asset: Asset) => void;
  onView: (asset: Asset) => void;
  navigateFilters?: { token: number; filters: AssetListNavigateFilters } | null;
  onNavigateFiltersApplied?: () => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
}) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterLocation, setFilterLocation] = useState<string>('all');
  const [filterModel, setFilterModel] = useState<string>('all');
  const [filterWarranty, setFilterWarranty] = useState<string>('all');
  const [filterAssignment, setFilterAssignment] = useState<string>('all');
  const [filterRam, setFilterRam] = useState<string>('all');
  const [filterStorage, setFilterStorage] = useState<string>('all');
  const [filterChip, setFilterChip] = useState<string>('all');
  const [filterPurchase, setFilterPurchase] = useState<string>('all');
  const [filterMacBookLine, setFilterMacBookLine] = useState<string>('all');
  const [openMenuAssetId, setOpenMenuAssetId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [importExcelOpen, setImportExcelOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (openMenuAssetId === null) return;
    const close = () => setOpenMenuAssetId(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [openMenuAssetId]);

  useEffect(() => {
    const sync = () => {
      const s = getState();
      setAssets(s.assets);
      setEmployees(s.employees);
    };
    sync();
    return subscribe(sync);
  }, []);

  useEffect(() => {
    if (!navigateFilters) return;
    const { filters } = navigateFilters;
    setFilterType(filters.filterType);
    setFilterStatus(filters.filterStatus);
    setFilterLocation(filters.filterLocation);
    setFilterModel(filters.filterModel);
    setFilterWarranty(filters.filterWarranty);
    setFilterAssignment(filters.filterAssignment);
    setFilterRam(filters.filterRam);
    setFilterStorage(filters.filterStorage);
    setFilterChip(filters.filterChip);
    setFilterPurchase(filters.filterPurchase);
    setFilterMacBookLine(filters.filterMacBookLine ?? 'all');
    onNavigateFiltersApplied?.();
  }, [navigateFilters, onNavigateFiltersApplied]);

  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      const matchesSearch =
        (asset.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (asset.serialNumber || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (asset.deviceId || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (asset.assignedTo &&
          employees
            .find((e) => e.id === asset.assignedTo)
            ?.name.toLowerCase()
            .includes(searchQuery.toLowerCase()));
      const matchesType =
        filterType === 'all' || (asset.type || '').trim().toLowerCase() === filterType;
      const matchesStatus =
        filterStatus === 'all' ||
        (filterStatus === ASSET_LIST_STATUS_RETIRED_STOLEN
          ? asset.status === 'Retired' || asset.status === 'Stolen'
          : asset.status === filterStatus);
      const matchesLocation = filterLocation === 'all' || asset.location === filterLocation;
      const matchesModel = filterModel === 'all' || asset.model === filterModel;
      const matchesWarranty = assetMatchesWarrantyFilter(asset, filterWarranty);
      const matchesAssignment =
        filterAssignment === 'all' ||
        (filterAssignment === 'assigned' && !!asset.assignedTo) ||
        (filterAssignment === 'unassigned' && !asset.assignedTo);
      const matchesRam = matchesSpecFilter(asset.ram, filterRam);
      const matchesStorage = matchesSpecFilter(asset.storage, filterStorage);
      const matchesChip = matchesSpecFilter(asset.chip, filterChip);
      const matchesPurchase = assetMatchesPurchaseFilter(asset, filterPurchase);
      const matchesMacBookLine = assetMatchesMacBookLineFilter(asset, filterMacBookLine);
      return (
        matchesSearch &&
        matchesType &&
        matchesStatus &&
        matchesLocation &&
        matchesModel &&
        matchesWarranty &&
        matchesAssignment &&
        matchesRam &&
        matchesStorage &&
        matchesChip &&
        matchesPurchase &&
        matchesMacBookLine
      );
    });
  }, [
    assets,
    employees,
    searchQuery,
    filterType,
    filterStatus,
    filterLocation,
    filterModel,
    filterWarranty,
    filterAssignment,
    filterRam,
    filterStorage,
    filterChip,
    filterPurchase,
    filterMacBookLine,
  ]);

  const filteredIdSet = useMemo(() => new Set(filteredAssets.map((a) => a.id)), [filteredAssets]);
  const allFilteredSelected =
    filteredAssets.length > 0 && filteredAssets.every((a) => selectedIds.has(a.id));

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
        for (const a of filteredAssets) next.delete(a.id);
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const a of filteredAssets) next.add(a.id);
        return next;
      });
    }
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkDelete = () => {
    const ids = [...selectedIds].filter((id) => filteredIdSet.has(id));
    if (ids.length === 0) return;
    if (!window.confirm(`Delete ${ids.length} asset(s)? This cannot be undone.`)) return;
    deleteAssets(ids);
    clearSelection();
  };

  const locations = Array.from(new Set(assets.map((a) => a.location))).filter(Boolean);
  const models = Array.from(new Set(assets.map((a) => a.model))).filter(Boolean);

  const ramValues = useMemo(() => {
    const set = new Set<string>();
    for (const a of assets) {
      const v = (a.ram || '').trim();
      if (v) set.add(v);
    }
    return [...set].sort((x, y) => x.localeCompare(y));
  }, [assets]);
  const storageValues = useMemo(() => {
    const set = new Set<string>();
    for (const a of assets) {
      const v = (a.storage || '').trim();
      if (v) set.add(v);
    }
    return [...set].sort((x, y) => x.localeCompare(y));
  }, [assets]);
  const chipValues = useMemo(() => {
    const set = new Set<string>();
    for (const a of assets) {
      const v = (a.chip || '').trim();
      if (v) set.add(v);
    }
    return [...set].sort((x, y) => x.localeCompare(y));
  }, [assets]);
  const hasEmptyRam = useMemo(() => assets.some((a) => !(a.ram || '').trim()), [assets]);
  const hasEmptyStorage = useMemo(() => assets.some((a) => !(a.storage || '').trim()), [assets]);
  const hasEmptyChip = useMemo(() => assets.some((a) => !(a.chip || '').trim()), [assets]);

  const typeTabs = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of assets) {
      const key = (a.type || '').trim().toLowerCase();
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([key, count]) => ({ key, count, label: typeTabLabel(key) }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [assets]);

  const handleDelete = (id: string) => {
    if (!window.confirm('Are you sure you want to delete this asset?')) return;
    deleteAsset(id);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Assets</h2>
          <p className="text-gray-500 text-sm">
            Manage your hardware inventory. Use the top bar to search by name, serial, or assignee.
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
              onClick={() => onEdit({} as Asset)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors shadow-sm"
            >
              <Plus size={20} />
              Add Asset
            </button>
          </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 custom-scrollbar border-b border-gray-100">
        <button
          type="button"
          onClick={() => setFilterType('all')}
          className={cn(
            'flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors border-2',
            filterType === 'all'
              ? 'border-indigo-500 bg-indigo-50 text-indigo-800'
              : 'border-transparent bg-gray-50 text-gray-600 hover:bg-gray-100'
          )}
        >
          <Package size={16} className="shrink-0 opacity-80" />
          All types
          <span
            className={cn(
              'rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums',
              filterType === 'all' ? 'bg-indigo-200/80 text-indigo-900' : 'bg-gray-200/80 text-gray-600'
            )}
          >
            {assets.length}
          </span>
        </button>
        {typeTabs.map((tab) => (
          <button
            key={tab.key || '__unspecified__'}
            type="button"
            onClick={() => setFilterType(tab.key)}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors border-2',
              filterType === tab.key
                ? 'border-indigo-500 bg-indigo-50 text-indigo-800'
                : 'border-transparent bg-gray-50 text-gray-600 hover:bg-gray-100'
            )}
          >
            <span className="text-indigo-600 opacity-90">
              <TypeIcon type={tab.key} />
            </span>
            <span className="max-w-[140px] truncate">{tab.label}</span>
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums shrink-0',
                filterType === tab.key ? 'bg-indigo-200/80 text-indigo-900' : 'bg-gray-200/80 text-gray-600'
              )}
            >
              {tab.count}
            </span>
          </button>
        ))}
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
              <option value="Inventory">Inventory</option>
              <option value="Assigned">Assigned</option>
              <option value="Repaired">Repaired</option>
              <option value="Retired">Retired</option>
              <option value="Stolen">Stolen</option>
              <option value={ASSET_LIST_STATUS_RETIRED_STOLEN}>Retired / Stolen</option>
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
              value={filterModel}
              onChange={(e) => setFilterModel(e.target.value)}
              className="px-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
            >
              <option value="all">All Models</option>
              {models.map((mod) => (
                <option key={mod} value={mod}>
                  {mod}
                </option>
              ))}
            </select>
            <select
              value={filterMacBookLine}
              onChange={(e) => setFilterMacBookLine(e.target.value)}
              className="px-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
              aria-label="Filter by MacBook line"
            >
              <option value="all">All MacBook lines</option>
              <option value="air">MacBook Air</option>
              <option value="pro">MacBook Pro</option>
            </select>
            <select
              value={filterWarranty}
              onChange={(e) => setFilterWarranty(e.target.value)}
              className="px-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
            >
              <option value="all">All warranties</option>
              <option value="Active">Warranty active</option>
              <option value="Expired">Warranty expired</option>
              <option value="N/A">Warranty N/A</option>
              <option value={ASSET_LIST_WARRANTY_EXPIRING_30D}>Expiring in 30 days</option>
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
            value={filterAssignment}
            onChange={(e) => setFilterAssignment(e.target.value)}
            className="px-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
            aria-label="Filter by assignment"
          >
            <option value="all">All (assignment)</option>
            <option value="assigned">Assigned to someone</option>
            <option value="unassigned">Unassigned</option>
          </select>
          <select
            value={filterRam}
            onChange={(e) => setFilterRam(e.target.value)}
            className="px-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
            aria-label="Filter by RAM"
          >
            <option value="all">All RAM</option>
            {hasEmptyRam && <option value={ASSET_SPEC_EMPTY}>RAM not set</option>}
            {ramValues.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select
            value={filterStorage}
            onChange={(e) => setFilterStorage(e.target.value)}
            className="px-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
            aria-label="Filter by storage"
          >
            <option value="all">All storage</option>
            {hasEmptyStorage && <option value={ASSET_SPEC_EMPTY}>Storage not set</option>}
            {storageValues.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={filterChip}
            onChange={(e) => setFilterChip(e.target.value)}
            className="px-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
            aria-label="Filter by chip or CPU"
          >
            <option value="all">All processors</option>
            {hasEmptyChip && <option value={ASSET_SPEC_EMPTY}>Processor not set</option>}
            {chipValues.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={filterPurchase}
            onChange={(e) => setFilterPurchase(e.target.value)}
            className="px-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
            aria-label="Filter by purchase date"
          >
            <option value="all">Any purchase date</option>
            <option value="unset">Purchase date missing</option>
            <option value="last_12m">Purchased in last 12 months</option>
            <option value="last_3y">Purchased in last 3 years</option>
            <option value="older_3y">Purchased over 3 years ago</option>
          </select>
        </div>

        <BulkSelectionBar
          filteredCount={filteredAssets.length}
          selectedCount={[...selectedIds].filter((id) => filteredIdSet.has(id)).length}
          allFilteredSelected={allFilteredSelected}
          onToggleSelectAll={toggleSelectAllFiltered}
          onClearSelection={clearSelection}
          onBulkDelete={handleBulkDelete}
          nounSingular="asset"
        />
      </div>

      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence mode="popLayout">
            {filteredAssets.map((asset) => (
              <motion.div
                layout
                key={asset.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={cn(
                  'bg-white p-5 rounded-2xl border shadow-sm hover:shadow-md transition-all group',
                  selectedIds.has(asset.id)
                    ? 'border-indigo-300 ring-2 ring-indigo-500/30'
                    : 'border-gray-100'
                )}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-start gap-2">
                    <label
                      className="mt-1 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(asset.id)}
                        onChange={() => toggleSelect(asset.id)}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        aria-label={`Select ${asset.name || 'asset'}`}
                      />
                    </label>
                    <div
                      className={cn(
                        'p-2.5 rounded-xl',
                      asset.status === 'Inventory'
                        ? 'bg-green-50 text-green-600'
                        : asset.status === 'Assigned'
                          ? 'bg-blue-50 text-blue-600'
                          : asset.status === 'Repaired'
                            ? 'bg-yellow-50 text-yellow-600'
                            : asset.status === 'Retired'
                              ? 'bg-gray-50 text-gray-500'
                              : asset.status === 'Stolen'
                                ? 'bg-red-50 text-red-600'
                                : 'bg-gray-50 text-gray-500'
                    )}
                  >
                    <TypeIcon type={asset.type} />
                  </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span
                      className={cn(
                        'text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full',
                        asset.status === 'Inventory'
                          ? 'bg-green-50 text-green-600'
                          : asset.status === 'Assigned'
                            ? 'bg-blue-50 text-blue-600'
                            : asset.status === 'Repaired'
                              ? 'bg-yellow-50 text-yellow-600'
                              : asset.status === 'Retired'
                                ? 'bg-gray-50 text-gray-500'
                                : asset.status === 'Stolen'
                                  ? 'bg-red-50 text-red-600'
                                  : 'bg-gray-50 text-gray-500'
                      )}
                    >
                      {asset.status}
                    </span>
                    <div
                      className="relative"
                      onClick={(e) => e.stopPropagation()}
                    >
                        <button
                          type="button"
                          aria-expanded={openMenuAssetId === asset.id}
                          aria-haspopup="menu"
                          className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"
                          onClick={() =>
                            setOpenMenuAssetId((id) =>
                              id === asset.id ? null : asset.id
                            )
                          }
                        >
                          <MoreVertical size={16} />
                        </button>
                        {openMenuAssetId === asset.id && (
                          <div
                            role="menu"
                            className="absolute right-0 top-full pt-1 w-32 z-20"
                          >
                            <div className="bg-white rounded-xl shadow-xl border border-gray-100 py-1">
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  setOpenMenuAssetId(null);
                                  onView(asset);
                                }}
                                className="w-full px-4 py-2 text-left text-xs hover:bg-gray-50 flex items-center gap-2"
                              >
                                <History size={14} /> Details
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  setOpenMenuAssetId(null);
                                  onEdit(asset);
                                }}
                                className="w-full px-4 py-2 text-left text-xs hover:bg-gray-50 flex items-center gap-2"
                              >
                                <Edit size={14} /> Edit
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  setOpenMenuAssetId(null);
                                  handleDelete(asset.id);
                                }}
                                className="w-full px-4 py-2 text-left text-xs hover:bg-red-50 text-red-600 flex items-center gap-2"
                              >
                                <Trash2 size={14} /> Delete
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <h3 className="font-bold text-gray-900 truncate">{asset.name || 'Untitled asset'}</h3>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500 font-mono">{asset.serialNumber}</p>
                    <p className="text-[10px] text-gray-400 font-mono">{asset.deviceId}</p>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-50 flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-gray-400 uppercase font-medium">Assigned To</span>
                    <span className="text-xs font-semibold text-gray-700">
                      {asset.assignedTo
                        ? employees.find((e) => e.id === asset.assignedTo)?.name || 'Unknown'
                        : 'Unassigned'}
                    </span>
                  </div>
                  {(asset.status === 'Inventory' || asset.status === 'Assigned') && (
                    <button
                      onClick={() => onAssign(asset)}
                      className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors"
                      title={
                        asset.status === 'Assigned'
                          ? 'Assign or return (swap or check in)'
                          : 'Assign or return (check out)'
                      }
                    >
                      <UserPlus size={16} />
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
          <AnimatePresence mode="popLayout">
            {filteredAssets.map((asset) => (
              <motion.div
                layout
                key={asset.id}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className={cn(
                  'flex flex-col gap-3 border-b border-gray-100 p-4 last:border-b-0 hover:bg-gray-50/60 sm:flex-row sm:items-center sm:gap-4',
                  selectedIds.has(asset.id) && 'bg-indigo-50/40'
                )}
              >
                <label className="flex shrink-0 items-center" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(asset.id)}
                    onChange={() => toggleSelect(asset.id)}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    aria-label={`Select ${asset.name || 'asset'}`}
                  />
                </label>
                <div
                  className={cn(
                    'flex size-10 shrink-0 items-center justify-center rounded-xl sm:size-11',
                    asset.status === 'Inventory'
                      ? 'bg-green-50 text-green-600'
                      : asset.status === 'Assigned'
                        ? 'bg-blue-50 text-blue-600'
                        : asset.status === 'Repaired'
                          ? 'bg-yellow-50 text-yellow-600'
                          : asset.status === 'Retired'
                            ? 'bg-gray-50 text-gray-500'
                            : asset.status === 'Stolen'
                              ? 'bg-red-50 text-red-600'
                              : 'bg-gray-50 text-gray-500'
                  )}
                >
                  <TypeIcon type={asset.type} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-bold text-gray-900">{asset.name || 'Untitled asset'}</h3>
                  <p className="truncate text-xs text-gray-500 font-mono">
                    {[asset.serialNumber, asset.deviceId].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
                <span
                  className={cn(
                    'w-fit shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full',
                    asset.status === 'Inventory'
                      ? 'bg-green-50 text-green-600'
                      : asset.status === 'Assigned'
                        ? 'bg-blue-50 text-blue-600'
                        : asset.status === 'Repaired'
                          ? 'bg-yellow-50 text-yellow-600'
                          : asset.status === 'Retired'
                            ? 'bg-gray-50 text-gray-500'
                            : asset.status === 'Stolen'
                              ? 'bg-red-50 text-red-600'
                              : 'bg-gray-50 text-gray-500'
                  )}
                >
                  {asset.status}
                </span>
                <div className="min-w-0 flex-1 sm:max-w-[200px]">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">Assignee</p>
                  <p className="truncate text-sm font-semibold text-gray-700">
                    {asset.assignedTo
                      ? employees.find((e) => e.id === asset.assignedTo)?.name || 'Unknown'
                      : 'Unassigned'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center justify-end gap-1 sm:ml-auto">
                  {(asset.status === 'Inventory' || asset.status === 'Assigned') && (
                    <button
                      type="button"
                      onClick={() => onAssign(asset)}
                      className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors"
                      title={
                        asset.status === 'Assigned'
                          ? 'Assign or return (swap or check in)'
                          : 'Assign or return (check out)'
                      }
                    >
                      <UserPlus size={16} />
                    </button>
                  )}
                  <div className="relative" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        aria-expanded={openMenuAssetId === asset.id}
                        aria-haspopup="menu"
                        className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"
                        onClick={() =>
                          setOpenMenuAssetId((id) => (id === asset.id ? null : asset.id))
                        }
                      >
                        <MoreVertical size={16} />
                      </button>
                      {openMenuAssetId === asset.id && (
                        <div role="menu" className="absolute right-0 top-full z-20 w-36 pt-1">
                          <div className="rounded-xl border border-gray-100 bg-white py-1 shadow-xl">
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setOpenMenuAssetId(null);
                                onView(asset);
                              }}
                              className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs hover:bg-gray-50"
                            >
                              <History size={14} /> Details
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setOpenMenuAssetId(null);
                                onEdit(asset);
                              }}
                              className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs hover:bg-gray-50"
                            >
                              <Edit size={14} /> Edit
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setOpenMenuAssetId(null);
                                handleDelete(asset.id);
                              }}
                              className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs text-red-600 hover:bg-red-50"
                            >
                              <Trash2 size={14} /> Delete
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {filteredAssets.length === 0 && (
        <div className="text-center py-20 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
          <Package size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-900">No assets found</h3>
          <p className="text-gray-500">Try adjusting your search or filters</p>
        </div>
      )}

      <AssetExcelImportDialog open={importExcelOpen} onClose={() => setImportExcelOpen(false)} />
    </div>
  );
}
