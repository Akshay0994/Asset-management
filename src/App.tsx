import { useState, useCallback } from 'react';
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

export default function App() {
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

  return (
    <ErrorBoundary>
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
          <EmployeeList onView={setViewingEmployee} searchQuery={employeeSearch} />
        )}

        {editingAsset && <AssetForm asset={editingAsset} onClose={() => setEditingAsset(null)} />}

        {viewingAsset && (
          <AssetDetails asset={viewingAsset} onClose={() => setViewingAsset(null)} />
        )}

        {viewingEmployee && (
          <EmployeeDetails employee={viewingEmployee} onClose={() => setViewingEmployee(null)} />
        )}

        {assigningAsset && (
          <AssignmentForm asset={assigningAsset} onClose={() => setAssigningAsset(null)} />
        )}
      </Layout>
    </ErrorBoundary>
  );
}
