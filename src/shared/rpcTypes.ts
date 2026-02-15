export interface LocationChange {
  noteId: string
  noteTitle: string
  originalLine: string
  newLine: string
  tagsToAdd: string[]
  changeType: 'plz-to-city' | 'city-to-state' | 'plz-to-state' | 'multiple-matches' | 'no-change' | 'error'
  errorMessage?: string
  _originalHtmlLine?: string  // Internes Feld
  _newHtmlLine?: string        // Internes Feld
  
  // Optional: Für kompakte Anzeige
  section9Before?: string  // 9. Abschnitt vorher (Ort)
  section10Before?: string // 10. Abschnitt vorher (PLZ)
  section11Before?: string // 11. Abschnitt vorher (Bundesland)
  section9After?: string   // 9. Abschnitt nachher (Ort)
  section10After?: string  // 10. Abschnitt nachher (PLZ)
  section11After?: string  // 11. Abschnitt nachher (Bundesland)
  
  // NEU: Für Mehrdeutigkeit
  candidateStates?: Array<{
    city: string
    state: string
    plz?: string
  }>
  selectedStateIndex?: number  // User-Auswahl (Index in candidateStates)
}

export interface RpcMethods {
  search(options: { searchText: string; titlesOnly?: boolean }): Promise<{
    notes: any[]
    folders: any[]
  }>
  openNote(noteId: string, line?: number): Promise<void>
  getTitleBeforeBracket(): Promise<string | null>
  getTitleInBrackets(): Promise<string | null>
  getSelectedText(): Promise<string | null>
  getAllFolders(): Promise<any[]>  // GEÄNDERT
  getAllTags(): Promise<any[]>  // NEU
  getNoteTags(noteId: string): Promise<{ id: string; title: string }[]>  // NEU
  moveNotes(moves: { noteId: string; folderId: string }[]): Promise<void>  // GEÄNDERT
  analyzeLocationData(noteIds: string[]): Promise<LocationChange[]>
  applyLocationChanges(changes: LocationChange[]): Promise<void>
  getSelectedNoteIds(): Promise<string[]>
  closeDialog(): Promise<void>  // NEU
  refreshTagsCache(): Promise<void>  // NEU
}
