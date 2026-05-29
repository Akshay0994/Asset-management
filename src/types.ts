import type { Timestamp } from './lib/timestamp';

export type AssetType = 'laptop' | 'monitor' | 'keyboard' | 'mouse' | 'other';
export type AssetStatus = 'Inventory' | 'Assigned' | 'Repaired' | 'Retired' | 'Stolen';

/** Assets list filter: match Retired or Stolen (dashboard “Retired/Stolen” tile). */
export const ASSET_LIST_STATUS_RETIRED_STOLEN = '__retired_stolen__';

/** Assets list filter: warranty end date within the next 30 days (dashboard “Expiring soon”). */
export const ASSET_LIST_WARRANTY_EXPIRING_30D = '__warranty_expiring_30d__';

export type AssetListNavigateFilters = {
  filterType: string;
  filterStatus: string;
  filterLocation: string;
  filterModel: string;
  filterWarranty: string;
  /** all | assigned | unassigned */
  filterAssignment: string;
  /** Exact RAM config or "__empty__" for unset */
  filterRam: string;
  filterStorage: string;
  filterChip: string;
  /** all | unset | last_12m | last_3y | older_3y */
  filterPurchase: string;
  /** all | air | pro — match MacBook Air vs MacBook Pro in name/model text */
  filterMacBookLine: string;
};

export const DEFAULT_ASSET_LIST_FILTERS: AssetListNavigateFilters = {
  filterType: 'all',
  filterStatus: 'all',
  filterLocation: 'all',
  filterModel: 'all',
  filterWarranty: 'all',
  filterAssignment: 'all',
  filterRam: 'all',
  filterStorage: 'all',
  filterChip: 'all',
  filterPurchase: 'all',
  filterMacBookLine: 'all',
};
export type EmploymentStatus = 'Active' | 'Inactive' | 'On Leave';
export type EmployeeType = 'Regular' | 'Intern' | 'Contract';
export type WarrantyStatus = 'Active' | 'Expired' | 'N/A';

export interface Asset {
  id: string;
  deviceId: string;
  name: string;
  model: string;
  type: string;
  serialNumber: string;
  location: string;
  status: AssetStatus;
  assignedTo?: string; // Employee ID
  purchaseDate?: Timestamp;
  warrantyStatus: WarrantyStatus;
  warrantyExpiry?: Timestamp;
  ram?: string;
  storage?: string;
  chip?: string;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Employee {
  id: string;
  employeeNumber: string;
  name: string;
  email: string;
  department?: string;
  location: string;
  status: EmploymentStatus;
  /** Defaults to Regular when missing (legacy records). */
  employeeType?: EmployeeType;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Assignment {
  id: string;
  assetId: string;
  employeeId: string;
  assignedAt: Timestamp;
  returnedAt?: Timestamp;
  /** Expected return date while assignment is active (set from AssignmentForm). */
  returnDate?: Timestamp | null;
  condition?: string;
  notes?: string;
}

export interface HistoryEvent {
  id: string;
  assetId?: string;
  employeeId?: string;
  /** Semantic category — e.g. `assignment` (check-out), `return` (check-in), `Creation`, `StatusChange`. */
  type: string;
  description?: string;
  timestamp: Timestamp;
  performedBy?: string;
  /** Alternate shape used by some history writes (e.g. AssignmentForm). */
  event?: string;
  details?: string;
  userId?: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: 'admin' | 'user';
}
