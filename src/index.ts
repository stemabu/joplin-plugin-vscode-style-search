import joplin from 'api'
import { MenuItemLocation, ToolbarButtonLocation } from 'api/types'
import type * as FSType from 'fs-extra'
import { ChannelServer, PostMessageTarget } from './shared/channelRpc'
import { RpcMethods } from './shared/rpcTypes'

export interface SearchQueryOptions {
  searchText: string
  titlesOnly?: boolean
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

  const query = titlesOnly ? `title:${searchText}` : searchText

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

// Funktion zum Aktualisieren des Selection-Counter-Panels
async function updateSelectionCounter(panel: string) {
  const selectedNoteIds = await joplin.workspace.selectedNoteIds()
  const count = selectedNoteIds.length
  
  let text = ''
  if (count === 0) {
    text = 'Keine Notiz markiert'
  } else if (count === 1) {
    text = 'Eine Notiz markiert'
  } else {
    text = `${count} Notizen markiert`
  }
  
  const html = `
    <style>
      body {
        margin: 0;
        padding: 4px;
        overflow: hidden;
        max-height: 40px !important;
        height: 40px !important;
      }
    </style>
    <div style="
      padding: 6px 12px;
      font-size: 13px;
      color: #888;
      background: #f5f5f5;
      border: 1px solid #e0e0e0;
      border-radius: 3px;
      display: inline-block;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    ">
      ${text}
    </div>
  `
  
  await joplin.views.panels.setHtml(panel, html)
}

joplin.plugins.register({
  onStart: async function () {
    const panel = await joplin.views.panels.create('panel_1')
    await joplin.views.panels.hide(panel)
    setUpSearchPanel(panel)

    // NEU: Selection Counter Panel erstellen
    const selectionCounterPanel = await joplin.views.panels.create('selection_counter_panel')
    await joplin.views.panels.addScript(selectionCounterPanel, './selectionCounter.css')
    await joplin.views.panels.setHtml(selectionCounterPanel, '')
    
    // NEU: Toolbar-Button für Selection Counter
    await joplin.views.toolbarButtons.create(
      'selection_counter_button',
      'toggle_selection_counter',
      ToolbarButtonLocation.NoteToolbar
    )

    // NEU: Command für Selection Counter (macht nichts, nur für Button nötig)
    await joplin.commands.register({
      name: 'toggle_selection_counter',
      label: 'Show Selection Count',
      execute: async () => {
        const visible = await joplin.views.panels.visible(selectionCounterPanel)
        if (visible) {
          await joplin.views.panels.hide(selectionCounterPanel)
        } else {
          await joplin.views.panels.show(selectionCounterPanel)
          await updateSelectionCounter(selectionCounterPanel)
        }
      },
    })

    // NEU: Bei Änderung der Notiz-Auswahl Counter aktualisieren
    await joplin.workspace.onNoteSelectionChange(async () => {
      await updateSelectionCounter(selectionCounterPanel)
      
      // Panel automatisch zeigen wenn mehrere Notizen ausgewählt
      const selectedNoteIds = await joplin.workspace.selectedNoteIds()
      if (selectedNoteIds.length > 1) {
        await joplin.views.panels.show(selectionCounterPanel)
      } else {
        await joplin.views.panels.hide(selectionCounterPanel)
      }
    })

    // Bestehende Commands...
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
