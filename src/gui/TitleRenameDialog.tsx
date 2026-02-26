import * as React from 'react'

interface TitleChange {
  noteId: string
  oldTitle: string
  newTitle: string
  date?: string
  nummer?: string
  abk?: string
  error?: string
  skip: boolean
}

interface Props {
  changes: TitleChange[]
  onApply: () => void
  onCancel: () => void
}

export const TitleRenameDialog: React.FC<Props> = ({ changes, onApply, onCancel }) => {
  const validChanges = changes.filter(c => !c.skip)
  const skippedChanges = changes.filter(c => c.skip)

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b dark:border-gray-700">
          <h2 className="text-xl font-bold">Titel umbenennen</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {validChanges.length} Notiz(en) werden umbenannt, {skippedChanges.length} übersprungen
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {validChanges.length > 0 && (
            <>
              <h3 className="font-semibold mb-2 text-green-700 dark:text-green-400">
                ✓ Folgende Titel werden geändert:
              </h3>
              <div className="space-y-3 mb-6">
                {validChanges.map((change, idx) => (
                  <div key={idx} className="border dark:border-gray-700 rounded p-3 bg-gray-50 dark:bg-gray-900">
                    <div className="text-sm">
                      <div className="font-mono text-red-600 dark:text-red-400 line-through">
                        {change.oldTitle}
                      </div>
                      <div className="font-mono text-green-600 dark:text-green-400 mt-1">
                        {change.newTitle}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {skippedChanges.length > 0 && (
            <>
              <h3 className="font-semibold mb-2 text-orange-700 dark:text-orange-400">
                ⚠ Folgende Notizen werden übersprungen:
              </h3>
              <div className="space-y-2">
                {skippedChanges.map((change, idx) => (
                  <div key={idx} className="border dark:border-gray-700 rounded p-3 bg-orange-50 dark:bg-orange-900/20">
                    <div className="text-sm">
                      <div className="font-mono">{change.oldTitle}</div>
                      <div className="text-orange-600 dark:text-orange-400 text-xs mt-1">
                        Fehler: {change.error}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="p-4 border-t dark:border-gray-700 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded bg-gray-300 dark:bg-gray-700 hover:bg-gray-400 dark:hover:bg-gray-600"
          >
            Abbrechen
          </button>
          <button
            onClick={onApply}
            disabled={validChanges.length === 0}
            className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {validChanges.length} Titel umbenennen
          </button>
        </div>
      </div>
    </div>
  )
}
