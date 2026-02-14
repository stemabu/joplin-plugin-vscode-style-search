import React, { useState, useEffect } from 'react'
import { ChannelClient } from '../shared/channelRpc'

interface LocationChange {
  noteId: string
  noteTitle: string
  originalLine: string
  newLine: string
  tagsToAdd: string[]
  changeType: 'plz-to-city' | 'city-to-state' | 'no-change' | 'error'
  errorMessage?: string
}

interface LocationProcessingDialogProps {
  client: ChannelClient<any>
  onClose: () => void
}

export default function LocationProcessingDialog({ client, onClose }: LocationProcessingDialogProps) {
  const [changes, setChanges] = useState<LocationChange[]>([])
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([])

  useEffect(() => {
    loadChanges()
  }, [])

  const loadChanges = async () => {
    console.log('[LocationDialog] ============================================')
    console.log('[LocationDialog] START: loadChanges called')
    
    setLoading(true)
    try {
      console.log('[LocationDialog] Fetching selected note IDs...')
      const noteIds = await client.stub.getSelectedNoteIds()
      console.log('[LocationDialog] Selected note IDs:', noteIds)
      setSelectedNoteIds(noteIds)
      
      if (noteIds.length === 0) {
        console.warn('[LocationDialog] No notes selected')
        alert('Bitte markieren Sie mindestens eine Notiz.')
        return
      }
      
      if (noteIds.length > 100) {
        console.warn('[LocationDialog] More than 100 notes selected, limiting to 100')
        alert('Maximal 100 Notizen können gleichzeitig verarbeitet werden. Die ersten 100 werden verarbeitet.')
      }
      
      console.log('[LocationDialog] Calling analyzeLocationData RPC method...')
      const analyzedChanges = await client.stub.analyzeLocationData(noteIds)
      console.log('[LocationDialog] Received analyzed changes:', analyzedChanges)
      console.log('[LocationDialog] Number of changes:', analyzedChanges.length)
      
      setChanges(analyzedChanges)
      console.log('[LocationDialog] Changes state updated')
      
    } catch (error) {
      console.error('[LocationDialog] ERROR in loadChanges:', error)
      console.error('[LocationDialog] Error stack:', error.stack)
      console.error('[LocationDialog] Error details:', JSON.stringify(error, null, 2))
      alert('Fehler beim Analysieren der Notizen: ' + error)
    } finally {
      setLoading(false)
      console.log('[LocationDialog] ============================================')
    }
  }

  const applyChanges = async () => {
    if (changes.length === 0) {
      alert('Keine Änderungen vorhanden.')
      return
    }
    
    const validChanges = changes.filter(c => c.changeType !== 'error' && c.changeType !== 'no-change')
    
    if (validChanges.length === 0) {
      alert('Keine gültigen Änderungen zum Anwenden vorhanden.')
      return
    }
    
    if (!confirm(`${validChanges.length} Änderung(en) werden durchgeführt. Fortfahren?`)) {
      return
    }
    
    setProcessing(true)
    try {
      await client.stub.applyLocationChanges(changes)
      alert('Änderungen erfolgreich angewendet!')
      onClose()
    } catch (error) {
      console.error('Error applying changes:', error)
      alert('Fehler beim Anwenden der Änderungen: ' + error)
    } finally {
      setProcessing(false)
    }
  }

  const getChangeTypeColor = (type: LocationChange['changeType']) => {
    switch (type) {
      case 'plz-to-city': return 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200'
      case 'city-to-state': return 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
      case 'error': return 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
      case 'no-change': return 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'
    }
  }

  const getChangeTypeLabel = (type: LocationChange['changeType']) => {
    switch (type) {
      case 'plz-to-city': return 'PLZ → Ortsname'
      case 'city-to-state': return 'Ort → Bundesland'
      case 'error': return 'Fehler'
      case 'no-change': return 'Keine Änderung'
    }
  }

  if (loading) {
    return (
      <div className="p-4 text-center">
        <div className="mb-2">Analysiere Notizen...</div>
        <div className="text-sm text-gray-500">Bitte warten...</div>
      </div>
    )
  }

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Ortsdaten verarbeiten</h1>
      
      <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900 dark:bg-opacity-20 rounded">
        <p className="text-sm">
          <strong>{selectedNoteIds.length}</strong> Notiz(en) markiert. 
          <strong className="ml-2">{changes.length}</strong> Notiz(en) mit MusliStart-Zeile gefunden.
        </p>
      </div>

      {changes.length === 0 ? (
        <div className="p-8 text-center text-gray-500">
          Keine Notizen mit MusliStart-Zeile gefunden.
        </div>
      ) : (
        <>
          <div className="space-y-3 mb-4 max-h-96 overflow-y-auto" tabIndex={0} aria-label="Liste der vorgeschlagenen Änderungen">
            {changes.map((change, index) => (
              <div key={index} className="border dark:border-gray-700 rounded p-3">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-semibold">{change.noteTitle}</h3>
                  <span className={`px-2 py-1 text-xs rounded ${getChangeTypeColor(change.changeType)}`}>
                    {getChangeTypeLabel(change.changeType)}
                  </span>
                </div>
                
                {change.errorMessage && (
                  <div className="mb-2 p-2 bg-red-50 dark:bg-red-900 dark:bg-opacity-20 text-red-800 dark:text-red-200 text-sm rounded">
                    {change.errorMessage}
                  </div>
                )}
                
                <div className="mb-2">
                  <div className="text-xs text-gray-500 mb-1">Vorher:</div>
                  <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded text-sm font-mono break-all">
                    {change.originalLine}
                  </div>
                </div>
                
                {change.changeType !== 'error' && change.changeType !== 'no-change' && (
                  <>
                    <div className="mb-2">
                      <div className="text-xs text-gray-500 mb-1">Nachher:</div>
                      <div className="p-2 bg-green-50 dark:bg-green-900 dark:bg-opacity-20 rounded text-sm font-mono break-all">
                        {change.newLine}
                      </div>
                    </div>
                    
                    {change.tagsToAdd.length > 0 && (
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Tags hinzufügen:</div>
                        <div className="flex gap-2 flex-wrap">
                          {change.tagsToAdd.map((tag, i) => (
                            <span key={i} className="px-2 py-1 bg-purple-100 dark:bg-purple-900 dark:bg-opacity-30 text-purple-700 dark:text-purple-300 text-xs rounded">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
          
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-300 dark:bg-gray-700 rounded hover:bg-gray-400 dark:hover:bg-gray-600"
              disabled={processing}
            >
              Abbrechen
            </button>
            <button
              onClick={applyChanges}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
              disabled={processing || changes.filter(c => c.changeType !== 'error' && c.changeType !== 'no-change').length === 0}
            >
              {processing ? 'Wird ausgeführt...' : 'Ausführen'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
