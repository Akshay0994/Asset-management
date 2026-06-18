import React from 'react';
import { LayoutDashboard, Package, Users, Bell, Search, Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

export default function Layout({
  children,
  activeTab,
  setActiveTab,
  headerSearch,
  onHeaderSearchChange,
  searchPlaceholder,
}: {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  headerSearch: string;
  onHeaderSearchChange: (value: string) => void;
  searchPlaceholder: string;
}) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'assets', label: 'Assets', icon: Package },
    { id: 'employees', label: 'Employees', icon: Users },
  ];

  return (
    <div className="min-h-screen bg-canvas flex">
      {/* Sidebar - Desktop */}
      <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-gray-200 p-6 fixed h-full">
        <div className="flex items-center gap-3 mb-10 px-2">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
            <Package size={24} />
          </div>
          <span className="text-xl font-bold text-gray-900 tracking-tight">AssetTrack IT</span>
        </div>

        <nav className="flex-1 space-y-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200",
                activeTab === item.id 
                  ? "bg-indigo-50 text-indigo-600 shadow-sm shadow-indigo-100" 
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <item.icon size={20} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="mt-auto pt-6 border-t border-gray-100">
          <div className="bg-indigo-600 rounded-2xl p-4 text-white relative overflow-hidden">
            <div className="relative z-10">
              <p className="text-xs font-medium opacity-80">System Status</p>
              <p className="text-sm font-bold mt-1">All Systems Operational</p>
            </div>
            <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-white/10 rounded-full blur-2xl" />
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 lg:ml-64 min-h-screen flex flex-col" id="main">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-indigo-700 focus:shadow-lg focus:ring-2 focus:ring-indigo-500"
        >
          Skip to content
        </a>
        {/* Header */}
        <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur-md supports-[backdrop-filter]:bg-white/80">
          <div className="flex h-16 items-center gap-3 px-4 sm:h-20 sm:gap-4 sm:px-6">
            <button
              type="button"
              className="shrink-0 rounded-xl p-2 text-gray-500 hover:bg-gray-100 lg:hidden"
              onClick={() => setIsMobileMenuOpen(true)}
              aria-label="Open navigation menu"
            >
              <Menu size={22} />
            </button>

            <div className="relative min-w-0 flex-1 sm:max-w-md">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                size={18}
                aria-hidden
              />
              <input
                type="search"
                value={headerSearch}
                onChange={(e) => onHeaderSearchChange(e.target.value)}
                placeholder={searchPlaceholder}
                autoComplete="off"
                aria-label={searchPlaceholder}
                className="w-full rounded-xl border border-transparent bg-gray-50 py-2.5 pl-10 pr-4 text-sm text-gray-900 shadow-inner shadow-gray-100/50 transition-all placeholder:text-gray-400 focus:border-indigo-200 focus:bg-white focus:ring-2 focus:ring-indigo-500/30"
              />
            </div>

            <div className="flex shrink-0 items-center gap-2 sm:gap-4">
              <button
                type="button"
                className="relative rounded-xl p-2 text-gray-400 opacity-70 hover:bg-gray-50 hover:opacity-100"
                title="Notifications (optional — not configured in this build)"
                aria-label="Notifications. Not configured in this local build."
                onClick={(e) => e.preventDefault()}
              >
                <Bell size={20} />
                <span
                  className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full border-2 border-white bg-amber-400"
                  aria-hidden
                />
              </button>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div id="main-content" className="mx-auto w-full max-w-7xl p-6 lg:p-10" tabIndex={-1}>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 w-72 bg-white z-50 p-6 lg:hidden flex flex-col shadow-2xl"
            >
              <div className="flex items-center justify-between mb-10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white">
                    <Package size={24} />
                  </div>
                  <span className="text-xl font-bold text-gray-900 tracking-tight">AssetTrack IT</span>
                </div>
                <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 text-gray-400 hover:bg-gray-100 rounded-xl">
                  <X size={24} />
                </button>
              </div>

              <nav className="space-y-2">
                {navItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => { setActiveTab(item.id); setIsMobileMenuOpen(false); }}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all",
                      activeTab === item.id 
                        ? "bg-indigo-50 text-indigo-600" 
                        : "text-gray-500 hover:bg-gray-50"
                    )}
                  >
                    <item.icon size={20} />
                    {item.label}
                  </button>
                ))}
              </nav>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
