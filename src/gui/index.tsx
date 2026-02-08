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
type SimilarityAlgorithm = 'jaccard' | 'cosine' | 'dice'

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
  
  // NEU: Ähnlichkeits-States
  const [similarityAlgorithm, setSimilarityAlgorithm] = useState<SimilarityAlgorithm>('jaccard')
  const [similarityThreshold, setSimilarityThreshold] = useState(30)
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null)
  const [similarities, setSimilarities] = useState<Record<string, number>>({})
  
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

  // NEU: Beim Wechsel in Similarity-Mode die aktuelle Notiz-ID laden
  useEffect(() => {
    if (mode === 'similarity') {
      client.stub.getCurrentNoteId().then(id => {
        setCurrentNoteId(id)
      })
    }
  }, [mode])
  
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
    }

    if (sortType !== SortType.Relevance) {
      const sortField = sortFields[sortType]
      sortedResults = orderBy(parsedNoteResults, (r) => r.noteItem[sortField], [direction])
    }

    const finalSortedResults = sortedResults.map((parsedNote) => [parsedNote.noteItem, ...parsedNote.fragmentItems])

    const flattenedResults: NoteSearchItemData[] = finalSortedResults.flat()

    const noteListData = new NoteSearchListData(flattenedResults)
    
    if (!titlesOnly) {
      noteListData.initializeAllCollapsed()
    }
    
    return [noteListData, flattenedResults, sortedResults] as const
  }, [parsedNoteResults, sortType, sortDirection, titlesOnly])

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

  if (!searchText) {
    rendered = 'Enter a search term'
  } else if (loading) {
    rendered = 'Loading...'
  } else if (searchResults.parsedNotes.length === 0) {
    rendered = 'No results found'
  } else {
    const totalMatches = results.filter((r) => isFragmentItem(r)).length
    const selectClassname =
      'bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-1 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500 min-w-28'

    rendered = (
      <>
        <div className="flex justify-between">
          <h3 className="mb-2 text-lg font-bold">Results</h3>
          <div className="flex">
            <select
              value={sortType}
              onChange={(e) => setSortType(e.target.value as SortType)}
              className={selectClassname}
            >
              <option value={SortType.Relevance}>Relevance</option>
              <option value={SortType.Matches}>Matches</option>
              <option value={SortType.NoteName}>Note Name</option>
              <option value={SortType.FolderName}>Folder Name</option>
              <option value={SortType.Updated}>Updated</option>
            </select>
            <select
              value={sortDirection}
              onChange={(e) => setSortDirection(e.target.value as SortDirection)}
              disabled={sortType === SortType.Relevance}
              className={selectClassname}
            >
              <option value={SortDirection.Ascending}>Ascending</option>
              <option value={SortDirection.Descending}>Descending</option>
            </select>
            <FilterButton
              active={false}
              toggle={() => listData.setAllCollapsed()}
              icon="collapse"
              tooltip="Collapse All"
            />
            <FilterButton active={false} toggle={() => listData.resultsUpdated()} icon="expand" tooltip="Expand All" />
          </div>
        </div>

        <div className="mb-1">
          {totalMatches} matches in {searchResults.notes.length} notes
        </div>

        <div className="grow">
          <ResultsList
            query={searchText}
            results={results}
            folders={searchResults.folders}
            listData={listData}
            titlesOnly={titlesOnly}
            moveMode={moveMode}
            noteMovements={noteMovements}
            onNoteMovementChange={handleNoteMovementChange}
            folder1Name={folder1Name}
            folder2Name={folder2Name}
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
      <h1 className="mb-2 text-lg font-bold">Joplin VS Code-style Search Plugin</h1>
      <div className="border rounded-sm border-gray-200 m-1 p-1">
        <div className={classnames(searchStyles.InputWrapper, 'mb-2')}>
          <input
            type="text"
            className={classnames(searchStyles.Input, 'px-1')}
            onChange={handleChange}
            value={searchText}
            placeholder="Enter text to search for"
            ref={inputRef}
          />
        </div>
        <div className="mb-1 p-2 flex items-center gap-4">
          <label className="flex items-center">
            <input type="checkbox" checked={titlesOnly} onChange={handleTitlesOnlyChanged} className="mr-1"></input>
            Search in titles only
          </label>
          
          <label className="flex items-center">
            <input type="checkbox" checked={moveMode} onChange={handleMoveModeChanged} className="mr-1"></input>
            Move Note(s)
          </label>
          
          {moveMode && (
            <>
              <button
                onClick={() => setShowConfig(!showConfig)}
                className="px-2 py-1 bg-gray-500 text-white rounded hover:bg-gray-600 text-sm"
                title="Configure target folders"
              >
                ⚙️
              </button>
              <button
                onClick={handleExecuteMoves}
                disabled={isMoving}
                className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 text-sm"
              >
                {isMoving ? 'Moving...' : 'Execute Moves'}
              </button>
            </>
          )}
        </div>

        {/* GEÄNDERT: Kompaktere Anzeige mit Hintergrund */}
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
                  Remain
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
            <h4 className="font-bold mb-2">Configure Target Folders</h4>
            <div className="space-y-2">
              <div>
                <label className="block text-sm mb-1">Middle Radio Button (Red) → Move to:</label>
                <select
                  value={targetFolder1}
                  onChange={(e) => setTargetFolder1(e.target.value)}
                  className="w-full px-2 py-1 border rounded dark:bg-gray-700 dark:border-gray-600"
                >
                  {allFolders.map(folder => (
                    <option key={folder.id} value={folder.id}>{folder.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm mb-1">Right Radio Button (Blue) → Move to:</label>
                <select
                  value={targetFolder2}
                  onChange={(e) => setTargetFolder2(e.target.value)}
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
                Done
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
