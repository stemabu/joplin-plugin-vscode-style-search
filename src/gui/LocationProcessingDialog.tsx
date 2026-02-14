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
  section9Before?: string
  section10Before?: string
  section11Before?: string
  section9After?: string
  section10After?: string
  section11After?: string
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
  const [selectedChanges, setSelectedChanges] = useState<Set<number>>(new Set())

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
      
      // Detaillierte Ausgabe
      analyzedChanges.forEach((change, index) => {
        console.log(`[LocationDialog] Change ${index + 1}:`)
        console.log(`  - Note ID: ${change.noteId}`)
        console.log(`  - Note Title: ${change.noteTitle}`)
        console.log(`  - Change Type: ${change.changeType}`)
        console.log(`  - Tags to Add: ${JSON.stringify(change.tagsToAdd)}`)
        if (change.errorMessage) {
          console.error(`  - ERROR: ${change.errorMessage}`)
        }
      })
      
      setChanges(analyzedChanges)
      console.log('[LocationDialog] Changes state updated')
      
      // Automatisch alle erfolgreichen Änderungen auswählen
      const autoSelected = new Set<number>()
      analyzedChanges.forEach((change, index) => {
        if (change.changeType !== 'error' && change.changeType !== 'no-change') {
          autoSelected.add(index)
        }
      })
      setSelectedChanges(autoSelected)
      
    } catch (error) {
      console.error('[LocationDialog] ERROR in loadChanges:', error)
      console.error('[LocationDialog] Error stack:', error.stack)
      alert('Fehler beim Analysieren der Notizen: ' + error)
    } finally {
      setLoading(false)
      console.log('[LocationDialog] ============================================')
    }
  }

  const toggleChange = (index: number) => {
    const newSelected = new Set(selectedChanges)
    if (newSelected.has(index)) {
      newSelected.delete(index)
    } else {
      newSelected.add(index)
    }
    setSelectedChanges(newSelected)
  }

  const applyChanges = async () => {
    if (selectedChanges.size === 0) {
      alert('Keine Änderungen ausgewählt.')
      return
    }
    
    const changesToApply = changes.filter((_, index) => selectedChanges.has(index))
    
    console.log(`[LocationDialog] Applying ${changesToApply.length} changes...`)
    
    setProcessing(true)
    try {
      await client.stub.applyLocationChanges(changesToApply)
      
      console.log(`[LocationDialog] ✓ Successfully applied ${changesToApply.length} changes`)
      
      // Kein Alert bei Erfolg - Dialog einfach zurücksetzen
      setChanges([])
      setSelectedChanges(new Set())
      
    } catch (error) {
      console.error('[LocationDialog] ============================================')
      console.error('[LocationDialog] ERROR applying changes:', error)
      console.error('[LocationDialog] Error details:', JSON.stringify(error, null, 2))
      console.error('[LocationDialog] ============================================')
      
      // Nur bei Fehler einen Dialog anzeigen
      alert(`Fehler beim Anwenden der Änderungen:\n${error.message || error.code || 'Unbekannter Fehler'}`)
    } finally {
      setProcessing(false)
    }
  }

  const truncateTitle = (title: string, maxLength: number = 80) => {
    if (title.length <= maxLength) return title
    return title.substring(0, maxLength) + '...'
  }

  const getChangeColor = (type: LocationChange['changeType']) => {
    switch (type) {
      case 'plz-to-city': return 'text-blue-700 dark:text-blue-300'
      case 'city-to-state': return 'text-green-700 dark:text-green-300'
      case 'error': return 'text-red-700 dark:text-red-300'
      default: return 'text-gray-700 dark:text-gray-300'
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
          <strong className="ml-2">{selectedChanges.size}</strong> Änderung(en) ausgewählt.
        </p>
      </div>

      {changes.length === 0 ? (
        <div className="p-8 text-center text-gray-500">
          Keine Notizen mit MusliStart-Zeile gefunden.
        </div>
      ) : (
        <>
          <div className="space-y-2 mb-4 max-h-96 overflow-y-auto border dark:border-gray-700 rounded p-2">
            {changes.map((change, index) => (
              <div 
                key={index} 
                className={`flex items-start gap-3 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 ${
                  change.changeType === 'error' ? 'bg-red-50 dark:bg-red-900 dark:bg-opacity-10' : ''
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedChanges.has(index)}
                  onChange={() => toggleChange(index)}
                  disabled={change.changeType === 'error' || change.changeType === 'no-change'}
                  className="mt-1 w-4 h-4"
                />
                
                <div className="flex-1 text-sm">
                  <div className="font-semibold mb-1">
                    Notiz: "{truncateTitle(change.noteTitle)}"
                  </div>
                  
                  {change.errorMessage ? (
                    <div className="text-red-700 dark:text-red-300">
                      Fehler: {change.errorMessage}
                    </div>
                  ) : (
                    <>
                      <div className={`font-mono ${getChangeColor(change.changeType)}`}>
                        Änderung: {change.section9Before}; {change.section10Before}; {change.section11Before} 
                        <span className="mx-2">→</span>
                        {change.section9After}; {change.section10After}; {change.section11After}
                      </div>
                      
                      {change.tagsToAdd.length > 0 && (
                        <div className="mt-1 flex gap-1 flex-wrap">
                          <span className="text-gray-600 dark:text-gray-400">Tags:</span>
                          {change.tagsToAdd.map((tag, i) => (
                            <span 
                              key={i} 
                              className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900 dark:bg-opacity-30 text-purple-700 dark:text-purple-300 text-xs rounded"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
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
              disabled={processing || selectedChanges.size === 0}
            >
              {processing ? 'Wird ausgeführt...' : `${selectedChanges.size} Änderung(en) ausführen`}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
