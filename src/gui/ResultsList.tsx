import { useContext, useEffect, useMemo } from 'react'
import AutoSizer from 'react-virtualized-auto-sizer'

import { NoteSearchResult, NoteSearchListData, Item, NoteSearchItemData } from './NoteSearchListData'
import { STATUS_RESOLVED, STATUS_PENDING } from './GenericListData'
import { GenericList } from './GenericList'
import type { ItemData } from './ResultsListRow'
import ResultsListRow, { ITEM_SIZE } from './ResultsListRow'
import styles from './ResultsList.module.css'
import { Folder } from 'src'

interface ResultsListProps {
  query: string
  results: NoteSearchItemData[]
  folders: Folder[]
  listData: NoteSearchListData
  titlesOnly: boolean
  moveMode: boolean
  noteMovements: Map<string, 'none' | 'folder1' | 'folder2'>
  onNoteMovementChange: (noteId: string, target: 'none' | 'folder1' | 'folder2') => void
  folder1Name: string
  folder2Name: string
  mode: 'search' | 'similarity'
  similarities: Record<string, number>
  status: 'initial' | 'loading' | 'resolved'
  openNote: (id: string, line?: number) => void
}

export default function ResultsList({
  query,
  status,
  results,
  listData,
  folders,
  titlesOnly,
  moveMode,
  noteMovements,
  onNoteMovementChange,
  folder1Name,
  folder2Name,
  mode,
  similarities,
  openNote,
}: ResultsListProps) {
  const isPending = status === STATUS_PENDING

 const itemData = useMemo<ItemData>(() => {
  return {
    listData,
    query,
    results,
    folders,
    titlesOnly,
    moveMode,
    noteMovements,
    onNoteMovementChange,
    folder1Name,
    folder2Name,
    mode,
    similarities,
    openNote,
  }
}, [listData, query, results, folders, titlesOnly, moveMode, noteMovements, onNoteMovementChange, folder1Name, folder2Name, mode, similarities, additionalFolderName, openNote])

  if (status === STATUS_RESOLVED && results.length === 0) {
    return <div>No results found somehow!</div>
  }

  return (
    <div className={isPending ? styles.ResultsPending : styles.Results}>
      <div className={styles.List}>
        <AutoSizer
          children={({ height, width }) => (
            <GenericList<Item, ItemData>
              className={styles.List}
              height={height}
              itemData={itemData}
              itemRendererComponent={ResultsListRow}
              itemSize={ITEM_SIZE}
              listData={listData}
              width={width}
            />
          )}
        />
      </div>
    </div>
  )
}
