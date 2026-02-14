import joplin from 'api'
import { MenuItemLocation, ToolbarButtonLocation } from 'api/types'
import type * as FSType from 'fs-extra'
import { ChannelServer, PostMessageTarget } from './shared/channelRpc'
import { RpcMethods } from './shared/rpcTypes'
import { SettingItemType } from 'api/types'
import https from 'https'


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

export interface Tag {
  id: string
  title: string
}

// German states for location data processing
const GERMAN_STATES = [
  'Baden-Württemberg',
  'Bayern',
  'Berlin',
  'Brandenburg',
  'Bremen',
  'Hamburg',
  'Hessen',
  'Mecklenburg-Vorpommern',
  'Niedersachsen',
  'Nordrhein-Westfalen',
  'Rheinland-Pfalz',
  'Saarland',
  'Sachsen',
  'Sachsen-Anhalt',
  'Schleswig-Holstein',
  'Thüringen'
]

// Interface for openplzapi Response
interface PlzApiResponse {
  name: string  // City name
  state: string  // State/Bundesland
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

// Location data processing helper functions

// Helper function to decode HTML entities
function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&auml;': 'ä',
    '&ouml;': 'ö',
    '&uuml;': 'ü',
    '&Auml;': 'Ä',
    '&Ouml;': 'Ö',
    '&Uuml;': 'Ü',
    '&szlig;': 'ß',
    '&euro;': '€',
    '&nbsp;': ' ',
  }
  
  let decoded = text
  
  // Replace known named entities
  for (const [entity, char] of Object.entries(entities)) {
    decoded = decoded.split(entity).join(char)
  }
  
  // Replace numeric entities (&#123; or &#xAB;)
  decoded = decoded.replace(/&#(\d+);/g, (match, dec) => {
    return String.fromCharCode(parseInt(dec, 10))
  })
  
  decoded = decoded.replace(/&#x([0-9A-Fa-f]+);/g, (match, hex) => {
    return String.fromCharCode(parseInt(hex, 16))
  })
  
  return decoded
}

// Helper function for HTTPS GET requests
function httpsGet(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = ''
      
      res.on('data', (chunk) => {
        data += chunk
      })
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data)
          resolve(parsed)
        } catch (error) {
          reject(new Error(`Failed to parse JSON: ${error.message}`))
        }
      })
    }).on('error', (error) => {
      reject(error)
    })
  })
}

// Improved function to get location data by postal code
async function getLocationByPlz(plz: string): Promise<{ name: string; state: string } | null> {
  try {
    console.log(`[LocationAPI] Searching for PLZ: ${plz}`)
    
    const url = `https://openplzapi.org/de/Localities?postalCode=${plz}`
    const data = await httpsGet(url)
    
    console.log(`[LocationAPI] Response for PLZ ${plz}:`, JSON.stringify(data, null, 2))
    
    if (data && Array.isArray(data) && data.length > 0) {
      const locality = data[0]
      
      // Check if all required fields are present
      if (!locality.name) {
        console.error(`[LocationAPI] No name field in response for PLZ ${plz}`)
        return null
      }
      
      if (!locality.state || !locality.state.name) {
        console.error(`[LocationAPI] No state.name field in response for PLZ ${plz}`)
        return null
      }
      
      const result = {
        name: locality.name,
        state: locality.state.name
      }
      
      console.log(`[LocationAPI] Found location for PLZ ${plz}:`, result)
      return result
    }
    
    console.log(`[LocationAPI] No results found for PLZ ${plz}`)
    return null
  } catch (error) {
    console.error(`[LocationAPI] Error fetching location for PLZ ${plz}:`, error)
    return null
  }
}

// Improved function to get state by city name
async function getStateByCity(cityName: string): Promise<string | null> {
  try {
    console.log(`[LocationAPI] Searching for city: ${cityName}`)
    
    // URL-encode the city name for correct transmission
    const encodedCity = encodeURIComponent(cityName)
    const url = `https://openplzapi.org/de/Localities?name=${encodedCity}`
    const data = await httpsGet(url)
    
    console.log(`[LocationAPI] Response for city ${cityName}:`, JSON.stringify(data, null, 2))
    
    if (data && Array.isArray(data) && data.length > 0) {
      // Take the first result
      const locality = data[0]
      
      if (!locality.state || !locality.state.name) {
        console.error(`[LocationAPI] No state.name field in response for city ${cityName}`)
        return null
      }
      
      const stateName = locality.state.name
      
      console.log(`[LocationAPI] Found state for city ${cityName}: ${stateName}`)
      return stateName
    }
    
    console.log(`[LocationAPI] No results found for city ${cityName}`)
    return null
  } catch (error) {
    console.error(`[LocationAPI] Error fetching state for city ${cityName}:`, error)
    return null
  }
}

// Updated function to parse MusliStart line
function parseMusliLine(noteBody: string): { line: string; sections: string[]; decodedLine: string } | null {
  const musliRegex = /MusliStart-(.+?)-MusliEnde/
  const match = noteBody.match(musliRegex)
  
  if (!match) {
    return null
  }
  
  const line = match[0]  // Original HTML-encoded line
  const content = match[1]
  
  // IMPORTANT: Decode HTML entities BEFORE we split
  const decodedContent = decodeHtmlEntities(content)
  const decodedLine = `MusliStart-${decodedContent}-MusliEnde`
  
  const sections = decodedContent.split(';')
  
  return { 
    line,           // Original for later replace
    sections,       // Decoded sections
    decodedLine     // Decoded line for preview
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
    
    // NEU: Tags für ähnliche Notizen laden
    const similarNotesWithTags = await loadTagsForNotes(similarNotes)
    
    const allFoldersResult: SearchResponse<Folder> = await joplin.data.get(['folders'], {})
    
    return {
      notes: similarNotesWithTags,
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

  getAllTags: async (): Promise<any[]> => {
    try {
      let allTags: any[] = []
      let page = 1
      let hasMore = true
      
      while (hasMore) {
        const tagsResult = await joplin.data.get(['tags'], {
          page: page,
          limit: 100
        })
        
        allTags = allTags.concat(tagsResult.items)
        hasMore = tagsResult.has_more
        
        if (hasMore) {
          page++
        }
      }
      
      return allTags
    } catch (error) {
      console.error('Error getting tags:', error)
      return []
    }
  },

  getNoteTags: async (noteId: string): Promise<Tag[]> => {
    try {
      const tagsResult = await joplin.data.get(['notes', noteId, 'tags'])
      return tagsResult.items || []
    } catch (error) {
      console.error(`Error getting tags for note ${noteId}:`, error)
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

  getSelectedNoteIds: async (): Promise<string[]> => {
    try {
      const noteIds = await joplin.workspace.selectedNoteIds()
      return noteIds
    } catch (error) {
      console.error('Error getting selected note IDs:', error)
      return []
    }
  },

  analyzeLocationData: async (noteIds: string[]): Promise<any[]> => {
    const changes: any[] = []
    
    // Maximum 100 notes
    const limitedNoteIds = noteIds.slice(0, 100)
    
    console.log(`[LocationProcessing] Processing ${limitedNoteIds.length} notes`)
    
    for (const noteId of limitedNoteIds) {
      try {
        const note = await joplin.data.get(['notes', noteId], { fields: ['id', 'title', 'body'] })
        const parsed = parseMusliLine(note.body)
        
        if (!parsed) {
          console.log(`[LocationProcessing] Note ${noteId} (${note.title}): No MusliStart line found`)
          continue
        }
        
        const { line, sections, decodedLine } = parsed
        
        console.log(`[LocationProcessing] Note ${noteId} (${note.title}): Found MusliStart line with ${sections.length} sections`)
        console.log(`[LocationProcessing] Original: ${line}`)
        console.log(`[LocationProcessing] Decoded: ${decodedLine}`)
        console.log(`[LocationProcessing] Sections:`, sections)
        
        // Check if enough sections (minimum 11)
        if (sections.length < 11) {
          const errorMsg = `Nicht genügend Abschnitte in der MusliStart-Zeile (${sections.length} statt mindestens 11)`
          console.error(`[LocationProcessing] ${errorMsg}`)
          
          changes.push({
            noteId: note.id,
            noteTitle: note.title,
            originalLine: decodedLine,  // Show decoded line
            newLine: decodedLine,
            tagsToAdd: [],
            changeType: 'error',
            errorMessage: errorMsg
          })
          continue
        }
        
        const ninthSection = sections[8]?.trim()  // Index 8 = 9th section
        const tenthSection = sections[9]?.trim()  // Index 9 = 10th section
        const eleventhSection = sections[10]?.trim()  // Index 10 = 11th section
        
        console.log(`[LocationProcessing] 9th section (index 8): "${ninthSection}"`)
        console.log(`[LocationProcessing] 10th section (index 9): "${tenthSection}"`)
        console.log(`[LocationProcessing] 11th section (index 10): "${eleventhSection}"`)
        
        let newSections = [...sections]
        let tagsToAdd: string[] = []
        let changeType: any = 'no-change'
        let errorMessage: string | undefined
        
        if (ninthSection === 'plz') {
          console.log(`[LocationProcessing] Processing PLZ mode`)
          
          // Case 1: PLZ -> determine city name
          const plz = tenthSection
          const state = eleventhSection
          
          if (!plz) {
            errorMessage = '10. Abschnitt (PLZ) fehlt'
            changeType = 'error'
            console.error(`[LocationProcessing] ${errorMessage}`)
          } else if (!GERMAN_STATES.includes(state)) {
            errorMessage = `11. Abschnitt enthält kein gültiges Bundesland: "${state}"`
            changeType = 'error'
            console.error(`[LocationProcessing] ${errorMessage}`)
            console.log(`[LocationProcessing] Valid states are:`, GERMAN_STATES)
          } else {
            console.log(`[LocationProcessing] Fetching location for PLZ ${plz}`)
            const locationData = await getLocationByPlz(plz)
            
            if (locationData) {
              console.log(`[LocationProcessing] Found location:`, locationData)
              newSections[8] = locationData.name  // Replace PLZ with city name
              tagsToAdd.push(`Ort:${locationData.name}`)
              tagsToAdd.push(`BL:${state}`)
              changeType = 'plz-to-city'
            } else {
              errorMessage = `Konnte keinen Ort für PLZ ${plz} finden`
              changeType = 'error'
              console.error(`[LocationProcessing] ${errorMessage}`)
            }
          }
        } else if (ninthSection && ninthSection !== 'plz') {
          console.log(`[LocationProcessing] Processing city-to-state mode`)
          
          // Case 2: City name -> determine state
          const cityName = ninthSection
          console.log(`[LocationProcessing] Fetching state for city ${cityName}`)
          const state = await getStateByCity(cityName)
          
          if (state) {
            console.log(`[LocationProcessing] Found state: ${state}`)
            newSections[10] = state  // Insert state in 11th section
            tagsToAdd.push(`Ort:${cityName}`)
            tagsToAdd.push(`BL:${state}`)
            changeType = 'city-to-state'
          } else {
            errorMessage = `Konnte kein Bundesland für Ort "${cityName}" finden`
            changeType = 'error'
            console.error(`[LocationProcessing] ${errorMessage}`)
          }
        }
        
        // Create new line with decoded content
        const newDecodedLine = `MusliStart-${newSections.join(';')}-MusliEnde`
        
        // For the replace in body we need to use the original HTML line
        const newLine = newDecodedLine  // Will be used later
        
        console.log(`[LocationProcessing] Change type: ${changeType}`)
        console.log(`[LocationProcessing] New line: ${newDecodedLine}`)
        console.log(`[LocationProcessing] Tags to add:`, tagsToAdd)
        
        changes.push({
          noteId: note.id,
          noteTitle: note.title,
          originalLine: decodedLine,  // Show decoded version
          newLine: newDecodedLine,     // Show decoded version
          tagsToAdd: tagsToAdd,
          changeType: changeType,
          errorMessage: errorMessage,
          _originalHtmlLine: line,     // Save original for replace
          _newHtmlLine: newLine         // Will be encoded later if needed
        })
        
      } catch (error) {
        console.error(`[LocationProcessing] Error processing note ${noteId}:`, error)
        changes.push({
          noteId: noteId,
          noteTitle: 'Fehler beim Laden',
          originalLine: '',
          newLine: '',
          tagsToAdd: [],
          changeType: 'error',
          errorMessage: error.message || 'Unbekannter Fehler'
        })
      }
    }
    
    console.log(`[LocationProcessing] Finished processing. Total changes: ${changes.length}`)
    return changes
  },

  applyLocationChanges: async (changes: any[]): Promise<void> => {
    // Collect all unique tag names first
    const allTagNames = new Set<string>()
    for (const change of changes) {
      if (change.changeType !== 'error' && change.changeType !== 'no-change') {
        change.tagsToAdd.forEach((tag: string) => allTagNames.add(tag))
      }
    }
    
    // Fetch all existing tags once
    const existingTagsMap = new Map<string, string>()
    const allTags = await joplin.data.get(['tags'])
    for (const tag of allTags.items) {
      existingTagsMap.set(tag.title, tag.id)
    }
    
    // Create missing tags
    for (const tagName of allTagNames) {
      if (!existingTagsMap.has(tagName)) {
        console.log(`[LocationProcessing] Creating new tag "${tagName}"`)
        const newTag = await joplin.data.post(['tags'], null, { title: tagName })
        existingTagsMap.set(tagName, newTag.id)
      }
    }
    
    // Now process each change
    for (const change of changes) {
      if (change.changeType === 'error' || change.changeType === 'no-change') {
        continue
      }
      
      try {
        console.log(`[LocationProcessing] Applying changes to note ${change.noteId}`)
        
        // 1. Update note body
        const note = await joplin.data.get(['notes', change.noteId], { fields: ['body'] })
        
        // Use the original HTML line for the replace
        const originalHtmlLine = (change as any)._originalHtmlLine || change.originalLine
        const newLine = change.newLine
        
        // Replace the original line with the new (decoded) line
        const newBody = note.body.replace(originalHtmlLine, newLine)
        
        console.log(`[LocationProcessing] Updating note body`)
        await joplin.data.put(['notes', change.noteId], null, { body: newBody })
        
        // 2. Add tags
        console.log(`[LocationProcessing] Adding ${change.tagsToAdd.length} tags`)
        for (const tagName of change.tagsToAdd) {
          const tagId = existingTagsMap.get(tagName)
          if (tagId) {
            // Check if note already has this tag
            const noteTags = await joplin.data.get(['notes', change.noteId, 'tags'])
            const hasTag = noteTags.items.some((t: any) => t.id === tagId)
            
            if (!hasTag) {
              // Link tag with note
              console.log(`[LocationProcessing] Linking tag "${tagName}" to note`)
              await joplin.data.post(['tags', tagId, 'notes'], null, { id: change.noteId })
            } else {
              console.log(`[LocationProcessing] Note already has tag "${tagName}"`)
            }
          }
        }
        
        console.log(`[LocationProcessing] Successfully processed note ${change.noteId}`)
        
      } catch (error) {
        console.error(`[LocationProcessing] Error applying changes to note ${change.noteId}:`, error)
      }
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
  tags?: Tag[]
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

// Helper function to load tags for notes
async function loadTagsForNotes(notes: Note[]): Promise<Note[]> {
  return Promise.all(
    notes.map(async (note) => {
      try {
        const tagsResult = await joplin.data.get(['notes', note.id, 'tags'])
        return {
          ...note,
          tags: tagsResult.items || []
        }
      } catch (error) {
        console.error(`Error loading tags for note ${note.id}:`, error)
        return {
          ...note,
          tags: []
        }
      }
    })
  )
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

  // NEU: Tags für jede Notiz laden
  const notesWithTags = await loadTagsForNotes(allNotes)

  const allFoldersResult: SearchResponse<Folder> = await joplin.data.get(['folders'], {})

  return {
    notes: notesWithTags,
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

    joplin.commands.register({
      name: 'openLocationProcessingDialog',
      label: 'Ortsdaten verarbeiten (F12)',
      iconName: 'fas fa-map-marker-alt',
      execute: async () => {
        await joplin.views.panels.postMessage(panel, {
          type: 'OPEN_LOCATION_PROCESSING_DIALOG',
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

    joplin.views.menuItems.create(
      'processLocationDataMenuItem',
      'openLocationProcessingDialog',
      MenuItemLocation.Tools,
      { accelerator: 'F12' },
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
