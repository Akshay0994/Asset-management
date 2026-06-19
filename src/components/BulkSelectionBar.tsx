import { Trash2 } from 'lucide-react';
import { iconSize } from '../lib/icons';

export default function BulkSelectionBar({
  filteredCount,
  selectedCount,
  allFilteredSelected,
  onToggleSelectAll,
  onClearSelection,
  onBulkDelete,
  nounSingular,
}: {
  filteredCount: number;
  selectedCount: number;
  allFilteredSelected: boolean;
  onToggleSelectAll: () => void;
  onClearSelection: () => void;
  onBulkDelete: () => void;
  nounSingular: 'asset' | 'employee';
}) {
  const nounPlural = nounSingular === 'asset' ? 'assets' : 'employees';

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
      <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-gray-700">
        <input
          type="checkbox"
          checked={allFilteredSelected && filteredCount > 0}
          onChange={onToggleSelectAll}
          disabled={filteredCount === 0}
          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
        />
        Select all ({filteredCount} {filteredCount === 1 ? nounSingular : nounPlural} shown)
      </label>
      {selectedCount > 0 && (
        <>
          <span className="text-sm text-gray-500">{selectedCount} selected</span>
          <button
            type="button"
            onClick={onBulkDelete}
            className="inline-flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700 transition-colors hover:bg-red-100"
          >
            <Trash2 className={iconSize.sm} aria-hidden />
            Delete selected
          </button>
          <button
            type="button"
            onClick={onClearSelection}
            className="text-sm font-semibold text-gray-600 transition-colors hover:text-gray-900"
          >
            Clear selection
          </button>
        </>
      )}
    </div>
  );
}
