import * as React from 'react'
import { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react'
import * as ReactDOM from 'react-dom/client'

import { useAsync } from 'react-use'
import classnames from 'classnames'
import orderBy from 'lodash/orderBy'

import { ChannelClient, ChannelErrors, PostMessageTarget } from '../shared/channelRpc'

import type { Folder, HandlerType, Note } from '../index'

import './tailwind.css'
import './variables.css'
import searchStyles from './SearchFiles.module.css'
import { keywords } from './searchProcessing'
import { ParsedNote, parseNote } from './noteParsings'
import { isFragmentItem, NoteItemData, NoteSearchItemData, NoteSearchListData } from './NoteSearchListData'
import ResultsList from './ResultsList'
import { FilterButton } from './FilterButton'

let commandMessageHandler: ((msg: any) => void) | null = null

const target: PostMessageTarget = {
  postMessage: async (message: any) => {
    webviewApi.postMessage(message)
  },
  onMessage(listener) {
    webviewApi.onMessage((originalMessage) => {
      const msg = originalMessage.message
      
      if (msg && msg.type && !msg.type.startsWith('@channel-rpc')) {
        if (commandMessageHandler) {
          commandMessageHandler(msg)
          return
        }
      }
      
      listener({ source: target, data: msg })
    })
  },
}

function parseColor(input: string) {
  const m = input.match(/^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+),?\s*(\d+)?\)$/i)
  if (m) return [m[1], m[2], m[3]]
  else throw new Error('Colour ' + input + ' could not be parsed.')
}

const client = new ChannelClient<HandlerType>({
  target,
  channelId: 'channel-1',
  timeout: 10000,
})

const NO_RESULTS: ParsedNote[] = []

enum SortType {
  Relevance = 'Relevanz',
  Updated = 'Aktualisiert',
  Matches = 'Treffer',
  NoteName = 'Notizname',
  FolderName = 'Ordnername',
  Similarity = 'Ähnlichkeit',
}

enum SortDirection {
  Ascending = 'Aufsteigend',
  Descending = 'Absteigend',
}

type Mode = 'search' | 'similarity'
type SimilarityAlgorithm = 'jaccard' | 'cosine' | 'dice' | 'minhash'

// NEU: Default-Schwellwerte definieren
const DEFAULT_THRESHOLDS = {
  jaccard: { title: 70, full: 30 },
  cosine: { title: 75, full: 40 },
  dice: { title: 75, full: 35 },
  minhash: { title: 80, full: 50 },
}

function App() {
  const [mode, setMode] = useState<Mode>('search')
  
  const [searchText, setSearchText] = useState('')
  const [titlesOnly, setTitlesOnly] = useState(false)
  const [sortType, setSortType] = useState(SortType.Relevance)
  const [sortDirection, setSortDirection] = useState(SortDirection.Descending)
  
  const [moveMode, setMoveMode] = useState(true)
  const [noteMovements, setNoteMovements] = useState<Map<string, 'none' | 'folder1' | 'folder2'>>(new Map())
  const [isMoving, setIsMoving] = useState(false)
  
  const [showConfig, setShowConfig] = useState(false)
  const [allFolders, setAllFolders] = useState<Folder[]>([])
  const [targetFolder1, setTargetFolder1] = useState<string>('')
  const [targetFolder2, setTargetFolder2] = useState<string>('')

  const [successMessage, setSuccessMessage] = useState<string>('')
  
  // Ähnlichkeits-States
  const [similarityAlgorithm, setSimilarityAlgorithm] = useState<SimilarityAlgorithm>('jaccard')
  const [similarityThreshold, setSimilarityThreshold] = useState(30)
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null)
  const [similarities, setSimilarities] = useState<Record<string, number>>({})
  
  // NEU: Schwellwerte für jeden Algorithmus
  const [thresholds, setThresholds] = useState({
    jaccard_title: DEFAULT_THRESHOLDS.jaccard.title,
    jaccard_full: DEFAULT_THRESHOLDS.jaccard.full,
    cosine_title: DEFAULT_THRESHOLDS.cosine.title,
    cosine_full: DEFAULT_THRESHOLDS.cosine.full,
    dice_title: DEFAULT_THRESHOLDS.dice.title,
    dice_full: DEFAULT_THRESHOLDS.dice.full,
    minhash_title: DEFAULT_THRESHOLDS.minhash.title,
    minhash_full: DEFAULT_THRESHOLDS.minhash.full,
  })

  // NEU: Settings beim Start laden
  useEffect(() => {
    const loadSettings = async () => {
      try {
        // Schwellwerte laden
        const loadedThresholds = {
          jaccard_title: await client.stub.getSetting('threshold_jaccard_title'),
          jaccard_full: await client.stub.getSetting('threshold_jaccard_full'),
          cosine_title: await client.stub.getSetting('threshold_cosine_title'),
          cosine_full: await client.stub.getSetting('threshold_cosine_full'),
          dice_title: await client.stub.getSetting('threshold_dice_title'),
          dice_full: await client.stub.getSetting('threshold_dice_full'),
          minhash_title: await client.stub.getSetting('threshold_minhash_title'),
          minhash_full: await client.stub.getSetting('threshold_minhash_full'),
        }
        setThresholds(loadedThresholds)
        
        // Zielordner laden
        const folder1 = await client.stub.getSetting('targetFolder1')
        const folder2 = await client.stub.getSetting('targetFolder2')
        if (folder1) setTargetFolder1(folder1)
        if (folder2) setTargetFolder2(folder2)
        
        // Aktuellen Schwellwert setzen
        const key = `${similarityAlgorithm}_${titlesOnly ? 'title' : 'full'}` as keyof typeof loadedThresholds
        setSimilarityThreshold(loadedThresholds[key])
        
        // Alle Ordner laden
        const folders = await client.stub.getAllFolders()
        setAllFolders(folders)
      } catch (error) {
        console.error('Error loading settings:', error)
      }
    }
    
    loadSettings()
  }, [])

  // NEU: Schwellwert aktualisieren bei Algorithmus-/Modus-Wechsel
  useEffect(() => {
    const key = `${similarityAlgorithm}_${titlesOnly ? 'title' : 'full'}` as keyof typeof thresholds
    setSimilarityThreshold(thresholds[key])
  }, [similarityAlgorithm, titlesOnly, thresholds])

  useEffect(() => {
    commandMessageHandler = async (msg: any) => {
      console.log('Received command message:', msg)

      try {
        switch (msg.type) {
          case 'TOGGLE_MODE': {
            console.log('Toggling mode')
            setMode(prev => prev === 'search' ? 'similarity' : 'search')
            break
          }
          case 'SEARCH_TITLE_IN_BRACKETS': {
            console.log('Handling SEARCH_TITLE_IN_BRACKETS')
            const text = await client.stub.getTitleInBrackets()
            console.log('Got text in brackets:', text)
            if (text) {
              setMode('search')
              setSearchText(text)
            }
            break
          }
          case 'SEARCH_SELECTED_TEXT': {
            console.log('Handling SEARCH_SELECTED_TEXT')
            const text = await client.stub.getSelectedText()
            console.log('Got selected text:', text)
            if (text) {
              setMode('search')
              setSearchText(text)
            }
            break
          }
        }
      } catch (error) {
        console.error('Error handling message:', error)
      }
    }

    return () => {
      commandMessageHandler = null
    }
  }, [])

  // Beim Wechsel in Similarity-Mode die aktuelle Notiz-ID laden
  useEffect(() => {
    if (mode === 'similarity') {
      client.stub.getCurrentNoteId().then(id => {
        setCurrentNoteId(id)
      })
    }
  }, [mode])

  // Bei Notizwechsel im Similarity-Mode aktualisieren
  useEffect(() => {
    if (mode === 'similarity') {
      const intervalId = setInterval(async () => {
        const id = await client.stub.getCurrentNoteId()
        if (id !== currentNoteId) {
          setCurrentNoteId(id)
        }
      }, 500) // Alle 500ms prüfen
      
      return () => clearInterval(intervalId)
    }
  }, [mode, currentNoteId])
  
  const handleMoveModeChanged = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { checked } = e.target
    setMoveMode(checked)
    if (!checked) {
      setNoteMovements(new Map())
    }
  }

  const handleNoteMovementChange = (noteId: string, target: 'none' | 'folder1' | 'folder2') => {
    setNoteMovements(prev => {
      const newMap = new Map(prev)
      newMap.set(noteId, target)
      return newMap
    })
  }

  // NEU: Schwellwert speichern wenn geändert
  const handleThresholdChange = async (newValue: number) => {
    setSimilarityThreshold(newValue)
    
    const key = `${similarityAlgorithm}_${titlesOnly ? 'title' : 'full'}`
    const settingKey = `threshold_${key}`
    
    setThresholds(prev => ({ ...prev, [key]: newValue }))
    await client.stub.setSetting(settingKey, newValue)
  }

  // NEU: Auf Default zurücksetzen
  const handleResetThreshold = async () => {
    const mode = titlesOnly ? 'title' : 'full'
    const defaultValue = DEFAULT_THRESHOLDS[similarityAlgorithm][mode]
    
    setSimilarityThreshold(defaultValue)
    
    const key = `${similarityAlgorithm}_${mode}`
    const settingKey = `threshold_${key}`
    
    setThresholds(prev => ({ ...prev, [key]: defaultValue }))
    await client.stub.setSetting(settingKey, defaultValue)
  }

  // NEU: Zielordner speichern
  const handleTargetFolder1Change = async (folderId: string) => {
    setTargetFolder1(folderId)
    await client.stub.setSetting('targetFolder1', folderId)
  }

  const handleTargetFolder2Change = async (folderId: string) => {
    setTargetFolder2(folderId)
    await client.stub.setSetting('targetFolder2', folderId)
  }

  const handleExecuteMoves = async () => {
    try {
      if (!targetFolder1 || !targetFolder2) {
        setSuccessMessage('Please configure target folders first')
        setTimeout(() => setSuccessMessage(''), 3000)
        setShowConfig(true)
        return
      }

      setIsMoving(true)
      
      const movesToExecute: { noteId: string; folderId: string }[] = []
      
      noteMovements.forEach((target, noteId) => {
        if (target === 'folder1') {
          movesToExecute.push({ noteId, folderId: targetFolder1 })
        } else if (target === 'folder2') {
          movesToExecute.push({ noteId, folderId: targetFolder2 })
        }
      })
      
      if (movesToExecute.length === 0) {
        setSuccessMessage('No notes selected for moving')
        setTimeout(() => setSuccessMessage(''), 3000)
        return
      }
      
      await client.stub.moveNotes(movesToExecute)
      
      // Success-Message anzeigen
      setSuccessMessage(`✓ Successfully moved ${movesToExecute.length} note(s)`)
      
      // Reset selections
      setNoteMovements(new Map())
      
      // NACH 3 Sekunden: Message ausblenden, Mode deaktivieren UND Suche aktualisieren
      const currentSearch = searchText
      setTimeout(() => {
        setSuccessMessage('')
        setMoveMode(false)
        
        // Suche aktualisieren um neue Ordner anzuzeigen
        setSearchText('')
        setTimeout(() => setSearchText(currentSearch), 100)
      }, 3000)
      
    } catch (error) {
      console.error('Error executing moves:', error)
      setSuccessMessage('Error moving notes: ' + error)
      setTimeout(() => setSuccessMessage(''), 3000)
    } finally {
      setIsMoving(false)
    }
  }

  const {
    value: searchResults,
    loading,
  } = useAsync(async () => {
    let notes: Note[] = []
    let folders: Folder[] = []
    let parsedNotes: ParsedNote[] = []
    let sims: Record<string, number> = {}
    
    if (mode === 'search') {
      if (searchText) {
        const parsedKeywords = keywords(searchText)
        const searchResult = await client.stub.search({ searchText: searchText, titlesOnly })
        notes = searchResult.notes
        folders = searchResult.folders

        parsedNotes = notes.map((note) => parseNote(note, parsedKeywords, folders, titlesOnly)).filter(Boolean)
      }
    } else {
      // Similarity Mode
      if (currentNoteId) {
        const similarityResult = await client.stub.findSimilar({
          referenceNoteId: currentNoteId,
          titlesOnly,
          algorithm: similarityAlgorithm,
          threshold: similarityThreshold
        })
        
        notes = similarityResult.notes
        folders = similarityResult.folders
        sims = similarityResult.similarities
        
        // Für Similarity keine Fragment-Items, nur Note-Items
        parsedNotes = notes.map((note) => {
          const folder = folders.find((f) => f.id === note.parent_id)
          const folderTitle = folder?.title ?? ''
          
          const noteItem: NoteItemData = {
            type: 'note',
            id: note.id,
            note,
            title: note.title,
            updated_time: note.updated_time,
            folderTitle,
            matchCount: 0,
          }
          
          return {
            noteItem,
            fragmentItems: []
          }
        })
      }
    }

    setSimilarities(sims)
    return { notes, noteListData: [], parsedNotes, folders }
  }, [mode, searchText, titlesOnly, currentNoteId, similarityAlgorithm, similarityThreshold])

  const parsedNoteResults = searchResults?.parsedNotes ?? NO_RESULTS

  const [listData, results, sortedResults] = useMemo(() => {
    let sortedResults = parsedNoteResults
    const direction = sortDirection === SortDirection.Ascending ? 'asc' : 'desc'
    const sortFields: Record<SortType, keyof NoteItemData> = {
      [SortType.FolderName]: 'folderTitle',
      [SortType.NoteName]: 'title',
      [SortType.Matches]: 'matchCount',
      [SortType.Updated]: 'updated_time',
      [SortType.Relevance]: 'id',
      [SortType.Similarity]: 'id',
    }

    if (sortType === SortType.Similarity && mode === 'similarity') {
      sortedResults = orderBy(parsedNoteResults, (r) => similarities[r.noteItem.id] || 0, [direction])
    } else if (sortType !== SortType.Relevance) {
      const sortField = sortFields[sortType]
      sortedResults = orderBy(parsedNoteResults, (r) => r.noteItem[sortField], [direction])
    }

    const finalSortedResults = sortedResults.map((parsedNote) => [parsedNote.noteItem, ...parsedNote.fragmentItems])

    const flattenedResults: NoteSearchItemData[] = finalSortedResults.flat()

    const noteListData = new NoteSearchListData(flattenedResults)
    
    if (!titlesOnly && mode === 'search') {
      noteListData.initializeAllCollapsed()
    }
    
    return [noteListData, flattenedResults, sortedResults] as const
  }, [parsedNoteResults, sortType, sortDirection, titlesOnly, mode, similarities])

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target
    setSearchText(value)
  }

  const handleTitlesOnlyChanged = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { checked } = e.target
    setTitlesOnly(checked)
  }

  const inputRef = useRef<HTMLInputElement>(null)
  const initializedRef = useRef(false)

  useLayoutEffect(() => {
    if (initializedRef.current) {
      return
    }
    initializedRef.current = true

    const computedStyle = window.getComputedStyle(document.documentElement)
    const backgroundColor = computedStyle.getPropertyValue('background-color')
    const parsedColor = parseColor(backgroundColor)

    let themeColor = 'theme-dark'
    if (parsedColor[0] === '0' && parsedColor[1] === '0' && parsedColor[2] === '0') {
      themeColor = 'theme-light'
    }

    document.documentElement.classList.add(themeColor)
  }, [])

  useLayoutEffect(() => {
    inputRef.current?.focus()
  }, [])

  const folder1Name = allFolders.find(f => f.id === targetFolder1)?.title || 'Folder 1'
  const folder2Name = allFolders.find(f => f.id === targetFolder2)?.title || 'Folder 2'

  let rendered: React.ReactNode = null

  const hasContent = mode === 'search' ? !!searchText : !!currentNoteId

  if (!hasContent) {
    rendered = mode === 'search' ? 'Suchbegriff eingeben' : 'Notiz auswählen um ähnliche zu finden'
  } else if (loading) {
    rendered = 'Loading...'
  } else if (searchResults?.parsedNotes.length === 0) {
    rendered = mode === 'search' ? 'Keine Ergebnisse gefunden' : 'Keine ähnlichen Notizen gefunden'
  } else {
    const totalMatches = results.filter((r) => isFragmentItem(r)).length
    const selectClassname =
      'bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-1 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500 min-w-28'

    rendered = (
      <>
        <div className="flex justify-between">
          <h3 className="mb-2 text-lg font-bold">
            {mode === 'search' ? 'Ergebnisse' : 'Ähnliche Notizen'}
          </h3>
          <div className="flex">
          <select
            value={sortType}
            onChange={(e) => setSortType(e.target.value as SortType)}
            className={selectClassname}
          >
          {mode === 'similarity' && <option value={SortType.Similarity}>Ähnlichkeit</option>}
          {mode === 'search' && <option value={SortType.Relevance}>Relevanz</option>}
          {mode === 'search' && <option value={SortType.Matches}>Treffer</option>}
          <option value={SortType.NoteName}>Notizname</option>
          <option value={SortType.FolderName}>Ordnername</option>
          <option value={SortType.Updated}>Aktualisiert</option>
          </select>
            <select
              value={sortDirection}
              onChange={(e) => setSortDirection(e.target.value as SortDirection)}
              disabled={sortType === SortType.Relevance}
              className={selectClassname}
            >
              <option value={SortDirection.Ascending}>Aufsteigend</option>
              <option value={SortDirection.Descending}>Absteigend</option>
            </select>
            {mode === 'search' && (
              <>
                <FilterButton
                  active={false}
                  toggle={() => listData.setAllCollapsed()}
                  icon="collapse"
                  tooltip="Collapse All"
                />
                <FilterButton active={false} toggle={() => listData.resultsUpdated()} icon="expand" tooltip="Expand All" />
              </>
            )}
          </div>
        </div>

        <div className="mb-1">
          {mode === 'search' 
            ? `${totalMatches} Treffer in ${searchResults?.notes.length ?? 0} Notizen`
            : `${searchResults?.notes.length ?? 0} ähnliche Notizen gefunden`
          }
        </div>

        <div className="grow">
          <ResultsList
            query={searchText}
            results={results}
            folders={searchResults?.folders ?? []}
            listData={listData}
            titlesOnly={titlesOnly}
            moveMode={moveMode}
            noteMovements={noteMovements}
            onNoteMovementChange={handleNoteMovementChange}
            folder1Name={folder1Name}
            folder2Name={folder2Name}
            mode={mode}
            similarities={similarities}
            status="resolved"
            openNote={async (id, line?: number) => {
              await client.stub.openNote(id, line)
            }}
          />
        </div>
      </>
    )
  }

  const anyCollapsed = listData.getAnyCollapsed()
  const isSuccess = !!searchText && !loading

    return (
    <div className={searchStyles.SearchFiles}>
      <div className="flex justify-between items-center mb-2 mx-1">
        <h1 className="text-lg font-bold">Joplin VS-Code-Stil- und Ähnlichkeitssuche</h1>
        <button
          onClick={() => setMode(prev => prev === 'search' ? 'similarity' : 'search')}
          className="px-3 py-1 bg-cyan-500 text-white rounded hover:bg-cyan-600 text-sm"
          title="Zwischen Suche und Ähnlichkeit wechseln (F4)"
        >
          {mode === 'search' ? 'Suche' : 'Ähnlichkeit'}
        </button>
      </div>
      
      <div className="border rounded-sm border-gray-200 m-1 p-1">
        {mode === 'search' && (
          <div className={classnames(searchStyles.InputWrapper, 'mb-2')}>
            <input
              type="text"
              className={classnames(searchStyles.Input, 'px-1')}
              onChange={handleChange}
              value={searchText}
              placeholder="Suchbegriff eingeben"
              ref={inputRef}
            />
          </div>
        )}
        
        {mode === 'similarity' && (
          <div className="mb-2 p-2 bg-orange-50 dark:bg-orange-900 dark:bg-opacity-20 rounded">
            <div className="flex gap-4 items-center mb-2">
              <label className="text-sm font-semibold">Algorithmus:</label>
              <select
                value={similarityAlgorithm}
                onChange={(e) => setSimilarityAlgorithm(e.target.value as SimilarityAlgorithm)}
                className="px-2 py-1 border rounded text-sm dark:bg-gray-700 dark:border-gray-600 w-64"
              >
                <option value="jaccard">Jaccard (Wort-Überlappung)</option>
                <option value="cosine">Cosine (TF-IDF)</option>
                <option value="dice">Dice Koeffizient</option>
                <option value="minhash">MinHash (Duplikate)</option>
              </select>
            </div>
            
            <div className="flex gap-2 items-center">
              <label className="text-sm font-semibold whitespace-nowrap">Schwellwert: {similarityThreshold}%</label>
              <input
                type="range"
                min="0"
                max="100"
                value={similarityThreshold}
                onChange={(e) => handleThresholdChange(Number(e.target.value))}
                className="flex-grow"
              />
              <button
                onClick={handleResetThreshold}
                className="px-2 py-1 bg-gray-400 text-white rounded hover:bg-gray-500 text-xs whitespace-nowrap"
                title="Auf Standard zurücksetzen"
              >
                ↻ Default
              </button>
            </div>
          </div>
        )}
        
        <div className="mb-1 p-2 flex items-center gap-4">
          <label className="flex items-center">
            <input type="checkbox" checked={titlesOnly} onChange={handleTitlesOnlyChanged} className="mr-1"></input>
            {mode === 'search' ? 'Nur in Titeln suchen' : 'Nur Titel vergleichen (erste 10 Zeichen + Text zwischen – und ])'}
          </label>
          
          <label className="flex items-center">
            <input type="checkbox" checked={moveMode} onChange={handleMoveModeChanged} className="mr-1"></input>
            Notiz(en) verschieben
          </label>
          
          {moveMode && (
            <>
              <button
                onClick={() => setShowConfig(!showConfig)}
                className="px-2 py-1 bg-gray-500 text-white rounded hover:bg-gray-600 text-sm"
                title="Zielordner konfigurieren"
              >
                ⚙️
              </button>
              <button
                onClick={handleExecuteMoves}
                disabled={isMoving}
                className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 text-sm"
              >
                {isMoving ? 'Verschiebe...' : 'Verschieben ausführen'}
              </button>
            </>
          )}
        </div>

        {moveMode && !showConfig && (
          <div className="px-2 pb-2 pt-0">
            {successMessage ? (
              <div className="text-green-600 dark:text-green-400 font-semibold text-sm bg-green-50 dark:bg-green-900 dark:bg-opacity-20 px-2 py-1 rounded">
                {successMessage}
              </div>
            ) : (
              <div className="flex gap-3 text-sm bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                <span className="text-gray-600 dark:text-gray-400 flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-gray-500"></span>
                  Behalten
                </span>
                <span className="text-red-600 dark:text-red-400 flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-red-500"></span>
                  {folder1Name}
                </span>
                <span className="text-blue-600 dark:text-blue-400 flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-blue-500"></span>
                  {folder2Name}
                </span>
              </div>
            )}
          </div>
        )}

        {showConfig && (
          <div className="mb-2 p-3 border border-blue-300 rounded bg-blue-50 dark:bg-gray-800 dark:border-blue-700">
            <h4 className="font-bold mb-2">Zielordner konfigurieren</h4>
            <div className="space-y-2">
              <div>
                <label className="block text-sm mb-1">Mittlerer Radio-Button (Rot) → Verschieben nach:</label>
                <select
                  value={targetFolder1}
                  onChange={(e) => handleTargetFolder1Change(e.target.value)}
                  className="w-full px-2 py-1 border rounded dark:bg-gray-700 dark:border-gray-600"
                >
                  {allFolders.map(folder => (
                    <option key={folder.id} value={folder.id}>{folder.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm mb-1">Rechter Radio-Button (Blau) → Verschieben nach:</label>
                <select
                  value={targetFolder2}
                  onChange={(e) => handleTargetFolder2Change(e.target.value)}
                  className="w-full px-2 py-1 border rounded dark:bg-gray-700 dark:border-gray-600"
                >
                  {allFolders.map(folder => (
                    <option key={folder.id} value={folder.id}>{folder.title}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => setShowConfig(false)}
                className="mt-2 px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 text-sm"
              >
                Fertig
              </button>
            </div>
          </div>
        )}
      </div>

      {rendered}
    </div>
  )
}

const root = ReactDOM.createRoot(document.getElementById('root'))
root.render(<App />)
