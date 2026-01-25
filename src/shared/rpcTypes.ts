export interface RpcMethods {
  search(options: { searchText: string; titlesOnly?: boolean }): Promise<{
    notes: any[]
    folders: any[]
  }>
  openNote(noteId: string, line?: number): Promise<void>
  getTitleBeforeBracket(): Promise<string | null>
  getTitleInBrackets(): Promise<string | null>
  getSelectedText(): Promise<string | null>
}
