/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useContext, useCallback } from 'react';
import { AuthProvider, AuthContext, LoginForm } from './components/Auth';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import AssetList from './components/AssetList';
import AssetForm from './components/AssetForm';
import AssetDetails from './components/AssetDetails';
import EmployeeList from './components/EmployeeList';
import EmployeeDetails from './components/EmployeeDetails';
import AssignmentForm from './components/AssignmentForm';
import ErrorBoundary from './components/ErrorBoundary';
import {
  Asset,
  AssetListNavigateFilters,
  DEFAULT_ASSET_LIST_FILTERS,
  Employee,
} from './types';
import { Package } from 'lucide-react';
import { motion } from 'motion/react';

function AppContent() {
  const { user, loading, isAdmin } = useContext(AuthContext);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [assetSearch, setAssetSearch] = useState('');
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [editingAsset, setEditingAsset] = useState<Partial<Asset> | null>(null);
  const [viewingAsset, setViewingAsset] = useState<Asset | null>(null);
  const [viewingEmployee, setViewingEmployee] = useState<Employee | null>(null);
  const [assigningAsset, setAssigningAsset] = useState<Asset | null>(null);
  const [assetsNavigate, setAssetsNavigate] = useState<{
    token: number;
    filters: AssetListNavigateFilters;
  } | null>(null);

  const openAssetsTab = useCallback((partial?: Partial<AssetListNavigateFilters>) => {
    setActiveTab('assets');
    setAssetsNavigate({
      token: Date.now(),
      filters: { ...DEFAULT_ASSET_LIST_FILTERS, ...partial },
    });
  }, []);

  const headerSearch = activeTab === 'employees' ? employeeSearch : assetSearch;
  const onHeaderSearchChange = activeTab === 'employees' ? setEmployeeSearch : setAssetSearch;
  const searchPlaceholder =
    activeTab === 'employees'
      ? 'Search people by name, email, or employee ID'
      : 'Search assets by name, serial, or assignee';

  const clearAssetsNavigate = useCallback(() => setAssetsNavigate(null), []);

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 font-medium animate-pulse">Loading workspace…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-8">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white p-10 rounded-[2.5rem] shadow-2xl border border-indigo-100"
          >
            <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center text-white mx-auto mb-8 shadow-xl shadow-indigo-200">
              <Package size={40} />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">AssetTrack IT</h1>
            <p className="text-gray-500 mb-8 leading-relaxed text-[15px]">
              Secure local workspace for hardware inventory, assignments, and team records. Data is stored only in this
              browser session.
            </p>
            <LoginForm />
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <Layout
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      headerSearch={headerSearch}
      onHeaderSearchChange={onHeaderSearchChange}
      searchPlaceholder={searchPlaceholder}
    >
      {activeTab === 'dashboard' && (
        <Dashboard onOpenAssets={openAssetsTab} onOpenEmployees={() => setActiveTab('employees')} />
      )}
      {activeTab === 'assets' && (
        <AssetList
          isAdmin={isAdmin}
          onEdit={setEditingAsset}
          onAssign={setAssigningAsset}
          onView={setViewingAsset}
          navigateFilters={assetsNavigate}
          onNavigateFiltersApplied={clearAssetsNavigate}
          searchQuery={assetSearch}
          onSearchChange={setAssetSearch}
        />
      )}
      {activeTab === 'employees' && (
        <EmployeeList isAdmin={isAdmin} onView={setViewingEmployee} searchQuery={employeeSearch} />
      )}

      {editingAsset && (
        <AssetForm asset={editingAsset} onClose={() => setEditingAsset(null)} />
      )}

      {viewingAsset && (
        <AssetDetails
          asset={viewingAsset}
          onClose={() => setViewingAsset(null)}
          isAdmin={isAdmin}
        />
      )}

      {viewingEmployee && (
        <EmployeeDetails
          employee={viewingEmployee}
          onClose={() => setViewingEmployee(null)}
          isAdmin={isAdmin}
        />
      )}

      {assigningAsset && (
        <AssignmentForm asset={assigningAsset} onClose={() => setAssigningAsset(null)} />
      )}
    </Layout>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ErrorBoundary>
  );
}
