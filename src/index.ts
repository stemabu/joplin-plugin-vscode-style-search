import joplin from 'api'
import { MenuItemLocation, ToolbarButtonLocation } from 'api/types'
import type * as FSType from 'fs-extra'
import { ChannelServer, PostMessageTarget } from './shared/channelRpc'
import { RpcMethods } from './shared/rpcTypes'
import { SettingItemType } from 'api/types'


export interface SearchQueryOptions {
  searchText: string
  titlesOnly?: boolean
}

// NEU: Interface für Similarity-Suche
export interface SimilarityQueryOptions {
  referenceNoteId: string
  titlesOnly?: boolean
  algorithm: 'jaccard' | 'cosine' | 'dice' | 'minhash'
  threshold: number
}

// Funktion für Extraktion von rechts
function extractFromTitleRight(title: string, startDelim: string, endDelim: string): string | null {
  const endIndex = title.lastIndexOf(endDelim)
  if (endIndex === -1) return null
  
  const searchEnd = endIndex
  const startIndex = title.lastIndexOf(startDelim, searchEnd)
  
  if (startIndex === -1) return null
  
  const searchStart = startIndex + startDelim.length
  const extracted = title.substring(searchStart, endIndex).trim()
  return extracted || null
}

// Original-Funktion für Extraktion von links
function extractFromTitle(title: string, startDelim: string, endDelim: string): string | null {
  const startIndex = title.indexOf(startDelim)
  if (startIndex === -1) return null
  
  const searchStart = startIndex + startDelim.length
  const endIndex = endDelim ? title.indexOf(endDelim, searchStart) : title.length
  
  if (endIndex === -1) return null
  
  const extracted = title.substring(searchStart, endIndex).trim()
  return extracted || null
}

// NEU: Titel für Ähnlichkeitsvergleich extrahieren
function extractTitleForComparison(title: string): string {
  const first10 = title.substring(0, 10)
  const betweenDashAndBracket = extractFromTitle(title, '–', ']') || ''
  return `${first10} ${betweenDashAndBracket}`.trim()
}

// NEU: Text in Wörter aufteilen
function tokenize(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2)
}

// NEU: Jaccard Similarity
function jaccardSimilarity(text1: string, text2: string): number {
  const set1 = new Set(tokenize(text1))
  const set2 = new Set(tokenize(text2))
  const intersection = new Set([...set1].filter(x => set2.has(x)))
  const union = new Set([...set1, ...set2])
  return union.size === 0 ? 0 : intersection.size / union.size
}

// NEU: Dice Coefficient
function diceSimilarity(text1: string, text2: string): number {
  const set1 = new Set(tokenize(text1))
  const set2 = new Set(tokenize(text2))
  const intersection = new Set([...set1].filter(x => set2.has(x)))
  return (set1.size + set2.size) === 0 ? 0 : (2 * intersection.size) / (set1.size + set2.size)
}

// NEU: Cosine Similarity
function cosineSimilarity(text1: string, text2: string): number {
  const words1 = tokenize(text1)
  const words2 = tokenize(text2)
  
  const tf1 = new Map<string, number>()
  const tf2 = new Map<string, number>()
  
  words1.forEach(w => tf1.set(w, (tf1.get(w) || 0) + 1))
  words2.forEach(w => tf2.set(w, (tf2.get(w) || 0) + 1))
  
  const allWords = new Set([...words1, ...words2])
  const vec1: number[] = []
  const vec2: number[] = []
  
  allWords.forEach(word => {
    vec1.push(tf1.get(word) || 0)
    vec2.push(tf2.get(word) || 0)
  })
  
  let dotProduct = 0
  let norm1 = 0
  let norm2 = 0
  
  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i]
    norm1 += vec1[i] * vec1[i]
    norm2 += vec2[i] * vec2[i]
  }
  
  const denominator = Math.sqrt(norm1) * Math.sqrt(norm2)
  return denominator === 0 ? 0 : dotProduct / denominator
}

// NEU: MinHash-Implementierung
const MINHASH_SHINGLE_SIZE = 3
const MINHASH_NUM_HASHES = 100

function generateShingles(text: string, k: number = MINHASH_SHINGLE_SIZE): Set<string> {
  const words = tokenize(text)
  const shingles = new Set<string>()
  
  for (let i = 0; i <= words.length - k; i++) {
    const shingle = words.slice(i, i + k).join(' ')
    shingles.add(shingle)
  }
  
  return shingles
}

function simpleHash(str: string, seed: number): number {
  let hash = seed
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash = hash | 0 // Convert to 32-bit integer
  }
  return Math.abs(hash)
}

function createMinHashSignature(shingles: Set<string>, numHashes: number = MINHASH_NUM_HASHES): number[] {
  const signature: number[] = new Array(numHashes).fill(Infinity)
  
  for (const shingle of shingles) {
    for (let i = 0; i < numHashes; i++) {
      const hashValue = simpleHash(shingle, i)
      signature[i] = Math.min(signature[i], hashValue)
    }
  }
  
  return signature
}

function minHashSimilarity(text1: string, text2: string): number {
  const shingles1 = generateShingles(text1, MINHASH_SHINGLE_SIZE)
  const shingles2 = generateShingles(text2, MINHASH_SHINGLE_SIZE)
  
  if (shingles1.size === 0 || shingles2.size === 0) return 0
  
  const signature1 = createMinHashSignature(shingles1, MINHASH_NUM_HASHES)
  const signature2 = createMinHashSignature(shingles2, MINHASH_NUM_HASHES)
  
  let matches = 0
  for (let i = 0; i < signature1.length; i++) {
    if (signature1[i] === signature2[i]) {
      matches++
    }
  }
  
  return matches / signature1.length
}

// NEU: Ähnlichkeit berechnen
function calculateSimilarity(text1: string, text2: string, algorithm: 'jaccard' | 'cosine' | 'dice' | 'minhash'): number {
  switch (algorithm) {
    case 'jaccard': return jaccardSimilarity(text1, text2)
    case 'cosine': return cosineSimilarity(text1, text2)
    case 'dice': return diceSimilarity(text1, text2)
    case 'minhash': return minHashSimilarity(text1, text2)
    default: return 0
  }
}

const handler = {
  search: searchNotes,
  openNote: async (noteId: string, line?: number) => {
    await joplin.commands.execute('openNote', noteId)
  },
    // NEU: Settings laden
  getSetting: async (key: string): Promise<any> => {
    return await joplin.settings.value(key)
  },
  
  // NEU: Settings speichern
  setSetting: async (key: string, value: any): Promise<void> => {
    await joplin.settings.setValue(key, value)
  },
	
  getTitleBeforeBracket: async (): Promise<string | null> => {
    try {
      const note = await joplin.workspace.selectedNote()
      if (!note || !note.title) return null
      
      return extractFromTitle(note.title, '– ', '[')
    } catch (error) {
      console.error('Error getting title before bracket:', error)
      return null
    }
  },
  
  getTitleInBrackets: async (): Promise<string | null> => {
    try {
      const note = await joplin.workspace.selectedNote()
      if (!note || !note.title) return null
      
      return extractFromTitleRight(note.title, '[', ']')
    } catch (error) {
      console.error('Error getting title in brackets:', error)
      return null
    }
  },
  
  getSelectedText: async (): Promise<string | null> => {
    try {
      const selectedText = await joplin.commands.execute('selectedText')
      return selectedText && selectedText.trim() ? selectedText.trim() : null
    } catch (error) {
      console.error('Error getting selected text:', error)
      return null
    }
  },
getCurrentNoteId: async (): Promise<string | null> => {
  try {
    const note = await joplin.workspace.selectedNote()
    return note?.id || null
  } catch (error) {
    console.error('Error getting current note:', error)
    return null
  }
},

// NEU: Folder-ID der aktuellen Notiz holen
getCurrentNoteFolderId: async (): Promise<string | null> => {
  try {
    const note = await joplin.workspace.selectedNote()
    if (!note) return null
    
    const noteData = await joplin.data.get(['notes', note.id], { fields: ['parent_id'] })
    return noteData.parent_id || null
  } catch (error) {
    console.error('Error getting current note folder:', error)
    return null
  }
},

  findSimilar: async (options: SimilarityQueryOptions): Promise<NotesSearchResults & { similarities: Record<string, number> }> => {
    const { referenceNoteId, titlesOnly, algorithm, threshold } = options
    
    const referenceNote = await joplin.data.get(['notes', referenceNoteId], { 
      fields: ['id', 'title', 'body', 'parent_id', 'created_time', 'updated_time']
    })
    
    if (!referenceNote) {
      return { notes: [], folders: [], similarities: {} }
    }
    
    let allNotes: Note[] = []
    let page = 1
    let hasMore = true
    
    while (hasMore && allNotes.length < 10000) {
      const allNotesResponse: SearchResponse<Note> = await joplin.data.get(['notes'], {
        fields: ['id', 'title', 'body', 'parent_id', 'created_time', 'updated_time'],
        page: page,
        limit: 100
      })
      
      allNotes = allNotes.concat(allNotesResponse.items)
      hasMore = allNotesResponse.has_more
      page++
    }
    
    const notesToCompare = allNotes.filter(n => n.id !== referenceNoteId)
    
    let referenceText = titlesOnly 
      ? extractTitleForComparison(referenceNote.title)
      : `${referenceNote.title} ${referenceNote.body}`
    
    const similarities: Record<string, number> = {}
    const similarNotes: Note[] = []
    
    for (const note of notesToCompare) {
      let noteText = titlesOnly 
        ? extractTitleForComparison(note.title)
        : `${note.title} ${note.body}`
      
      const similarity = calculateSimilarity(referenceText, noteText, algorithm)
      const similarityPercent = similarity * 100
      
      if (similarityPercent >= threshold) {
        similarities[note.id] = similarityPercent
        similarNotes.push(note)
      }
    }
    
    similarNotes.sort((a, b) => (similarities[b.id] || 0) - (similarities[a.id] || 0))
    
    const allFoldersResult: SearchResponse<Folder> = await joplin.data.get(['folders'], {})
    
    return {
      notes: similarNotes,
      folders: allFoldersResult.items,
      similarities
    }
  },

  getAllFolders: async (): Promise<Folder[]> => {
    try {
      const folders = await joplin.data.get(['folders'])
      return folders.items
    } catch (error) {
      console.error('Error getting folders:', error)
      return []
    }
  },

  moveNotes: async (moves: { noteId: string; folderId: string }[]): Promise<void> => {
    try {
      for (const move of moves) {
        console.log(`Moving note ${move.noteId} to folder ${move.folderId}`)
        
        await joplin.data.put(['notes', move.noteId], null, {
          parent_id: move.folderId,
        })
      }
      
      console.log(`Successfully moved ${moves.length} note(s)`)
    } catch (error) {
      console.error('Error moving notes:', error)
      throw error
    }
  },
}

export type HandlerType = typeof handler

export const createRpcServer = (target: PostMessageTarget) => {
  const server = new ChannelServer({
    target,
    channelId: 'channel-1',
    handler: handler,
  })

  return server
}

export interface Note {
  id: string
  parent_id: string
  title: string
  body: string
  body_html: string
  created_time: number
  updated_time: number
  source: string
}

export interface Folder {
  id: string
  parent_id: string
  title: string
}

interface SearchResponse<T> {
  has_more: boolean
  items: T[]
}

interface NotesSearchResults {
  notes: Note[]
  folders: Folder[]
}

async function searchNotes(queryOptions: SearchQueryOptions): Promise<NotesSearchResults> {
  let hasMore = false
  let allNotes: Note[] = []
  let page = 1

  const { searchText, titlesOnly } = queryOptions

  let query = searchText
  
  // NUR bei titlesOnly: Wörter ohne Filter zu title: umwandeln
  if (titlesOnly) {
    const words = searchText.split(/\s+/)
    const processedWords = words.map(word => {
      // Hat das Wort einen Filter? (enthält ':')
      if (word.includes(':')) {
        return word  // Behalte Filter wie tag:, notebook: etc
      } else {
        return `title:"${word}"`  // Text-Begriff → title:"Begriff"
      }
    })
    query = processedWords.join(' ')
  }
  // Bei titlesOnly=false bleibt query = searchText (unverändert!)

  const fields = ['id', 'title', 'body', 'parent_id', 'is_todo', 'todo_completed', 'todo_due', 'order', 'created_time']

  while (true) {
    const res: SearchResponse<Note> = await joplin.data.get(['search'], {
      query,
      page,
      fields,
      limit: 100,
    })

    const { items: notes, has_more } = res
    allNotes = allNotes.concat(notes)

    hasMore = has_more
    if (!hasMore) {
      break
    } else {
      page++
    }
  }

  const allFoldersResult: SearchResponse<Folder> = await joplin.data.get(['folders'], {})

  return {
    notes: allNotes,
    folders: allFoldersResult.items,
  }
}

async function setUpSearchPanel(panel: string) {
  const pluginDir = await joplin.plugins.installationDir()

  const fs: typeof FSType = joplin.require('fs-extra')

  const files = await fs.promises.readdir(pluginDir + '/gui/')

  const cssFiles = files.filter((file) => file.endsWith('.css')).map((file) => 'gui/' + file)

  await joplin.views.panels.setHtml(
    panel,
    `
			<div id="root"></div>
		`,
  )

  for (const file of cssFiles) {
    await joplin.views.panels.addScript(panel, file)
  }
  await joplin.views.panels.addScript(panel, 'gui/index.js')
}

joplin.plugins.register({
  onStart: async function() {
    // Settings registrieren
    await joplin.settings.registerSection('vscodeSearchSettings', {
      label: 'VS Code Search & Similarity',
      iconName: 'fas fa-search',
    })

    await joplin.settings.registerSettings({
      // Schwellwerte für Jaccard
      'threshold_jaccard_title': {
        value: 70,
        type: SettingItemType.Int,
        section: 'vscodeSearchSettings',
        public: true,
        label: 'Jaccard Threshold (Title only)',
      },
      'threshold_jaccard_full': {
        value: 30,
        type: SettingItemType.Int,
        section: 'vscodeSearchSettings',
        public: true,
        label: 'Jaccard Threshold (Full text)',
      },
      // Schwellwerte für Cosine
      'threshold_cosine_title': {
        value: 75,
        type: SettingItemType.Int,
        section: 'vscodeSearchSettings',
        public: true,
        label: 'Cosine Threshold (Title only)',
      },
      'threshold_cosine_full': {
        value: 40,
        type: SettingItemType.Int,
        section: 'vscodeSearchSettings',
        public: true,
        label: 'Cosine Threshold (Full text)',
      },
      // Schwellwerte für Dice
      'threshold_dice_title': {
        value: 75,
        type: SettingItemType.Int,
        section: 'vscodeSearchSettings',
        public: true,
        label: 'Dice Threshold (Title only)',
      },
      'threshold_dice_full': {
        value: 35,
        type: SettingItemType.Int,
        section: 'vscodeSearchSettings',
        public: true,
        label: 'Dice Threshold (Full text)',
      },
      // Schwellwerte für MinHash
      'threshold_minhash_title': {
        value: 80,
        type: SettingItemType.Int,
        section: 'vscodeSearchSettings',
        public: true,
        label: 'MinHash Threshold (Title only)',
      },
      'threshold_minhash_full': {
        value: 50,
        type: SettingItemType.Int,
        section: 'vscodeSearchSettings',
        public: true,
        label: 'MinHash Threshold (Full text)',
      },
      // Zielordner
      'targetFolder1': {
        value: '',
        type: SettingItemType.String,
        section: 'vscodeSearchSettings',
        public: false,
        label: 'Target Folder 1 for moving notes',
      },
      'targetFolder2': {
        value: '',
        type: SettingItemType.String,
        section: 'vscodeSearchSettings',
        public: false,
        label: 'Target Folder 2 for moving notes',
      },
      // Ähnlichkeitssuche
      'limitToFolders': {
        value: false,
        type: SettingItemType.Bool,
        section: 'vscodeSearchSettings',
        public: false,
        label: 'Limit similarity search to folders',
      },
      'additionalFolder': {
        value: '',
        type: SettingItemType.String,
        section: 'vscodeSearchSettings',
        public: false,
        label: 'Additional folder for similarity search',
      },
    })

    const panel = await joplin.views.panels.create('panel_1')
    await joplin.views.panels.hide(panel)
    setUpSearchPanel(panel)

    // Search Panel Commands
    joplin.commands.register({
      name: 'isquaredsoftware.vscode-search.toggle_panel',
      label: 'Toggle VS Code-style search panel',
      execute: async () => {
        if (await joplin.views.panels.visible(panel)) {
          await joplin.views.panels.hide(panel)
        } else {
          await joplin.views.panels.show(panel)
        }
      },
    })

    joplin.commands.register({
      name: 'isquaredsoftware.vscode-search.search_title_before_bracket',
      label: 'Search: Title text before bracket',
      execute: async () => {
        await joplin.views.panels.postMessage(panel, {
          type: 'SEARCH_TITLE_BEFORE_BRACKET',
        })
        if (!(await joplin.views.panels.visible(panel))) {
          await joplin.views.panels.show(panel)
        }
      },
    })

    joplin.commands.register({
      name: 'isquaredsoftware.vscode-search.search_title_in_brackets',
      label: 'Search: Title text in brackets',
      execute: async () => {
        await joplin.views.panels.postMessage(panel, {
          type: 'SEARCH_TITLE_IN_BRACKETS',
        })
        if (!(await joplin.views.panels.visible(panel))) {
          await joplin.views.panels.show(panel)
        }
      },
    })

    joplin.commands.register({
      name: 'isquaredsoftware.vscode-search.search_selected_text',
      label: 'Search: Selected text',
      execute: async () => {
        await joplin.views.panels.postMessage(panel, {
          type: 'SEARCH_SELECTED_TEXT',
        })
        if (!(await joplin.views.panels.visible(panel))) {
          await joplin.views.panels.show(panel)
        }
      },
    })

    joplin.views.menuItems.create(
      'isquaredsoftware.vscode-search.toggle_panel.menuitem',
      'isquaredsoftware.vscode-search.toggle_panel',
      MenuItemLocation.View,
      { accelerator: 'CmdOrCtrl+Shift+F' },
    )

    joplin.views.menuItems.create(
      'isquaredsoftware.vscode-search.search_title_before_bracket.menuitem',
      'isquaredsoftware.vscode-search.search_title_before_bracket',
      MenuItemLocation.View,
      { accelerator: 'F4' },
    )

    joplin.views.menuItems.create(
      'isquaredsoftware.vscode-search.search_title_in_brackets.menuitem',
      'isquaredsoftware.vscode-search.search_title_in_brackets',
      MenuItemLocation.View,
      { accelerator: 'F5' },
    )

    joplin.views.menuItems.create(
      'isquaredsoftware.vscode-search.search_selected_text.menuitem',
      'isquaredsoftware.vscode-search.search_selected_text',
      MenuItemLocation.View,
      { accelerator: 'F7' },
    )

    const target: PostMessageTarget = {
      postMessage: async (message: any) => {
        joplin.views.panels.postMessage(panel, message)
      },
      onMessage(listener) {
        joplin.views.panels.onMessage(panel, (originalMessage) => {
          listener({ source: target, data: originalMessage })
        })
      },
    }

    const server = createRpcServer(target)
    server.start()
  },
})
