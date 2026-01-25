const handler = {
  search: searchNotes,
  openNote: async (noteId: string, line?: number) => {
    await joplin.commands.execute('openNote', noteId)
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

  // NEU: Holt alle Notizbücher
  getAllFolders: async (): Promise<Folder[]> => {
    try {
      const folders = await joplin.data.get(['folders'])
      return folders.items
    } catch (error) {
      console.error('Error getting folders:', error)
      return []
    }
  },

  // GEÄNDERT: Nimmt jetzt dynamische Folder-IDs
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
