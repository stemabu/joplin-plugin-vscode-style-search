import React, { CSSProperties, useContext, useMemo } from 'react'

import Expandable from './Expandable'
import Icon from './Icon'
import {
  NoteSearchListData,
  Item,
  isNoteItem,
  isFragmentItem,
  NoteItemData,
  FragmentItemData,
} from './NoteSearchListData'
import HighlightMatch from './HighlightMatch'
import { GenericListItemData } from './GenericList'

import styles from './ResultsListRow.module.css'
import { Folder } from 'src'

export const ITEM_SIZE = 20

export type ItemData = {
  listData: NoteSearchListData
  folders: Folder[]
  query: string
  titlesOnly: boolean
  moveMode: boolean
  noteMovements: Map<string, 'none' | 'folder1' | 'folder2'>
  onNoteMovementChange: (noteId: string, target: 'none' | 'folder1' | 'folder2') => void
  folder1Name: string
  folder2Name: string
  mode: 'search' | 'similarity'  // NEU falls noch nicht da
  similarities: Record<string, number>  // NEU falls noch nicht da
  openNote: (noteId: string, line?: number) => void
}

export default function ResultsListItem({
  data,
  index,
  style,
}: {
  data: GenericListItemData<Item, ItemData>
  index: number
  style: CSSProperties
}) {
  const { itemData, listData: genericListData } = data
  
  const listData = genericListData as NoteSearchListData
  const { openNote, titlesOnly, folders, moveMode, noteMovements, onNoteMovementChange, folder1Name, folder2Name, mode, similarities } = itemData
  const { isCollapsed, result } = listData.getItemAtIndex(index)

  if (isNoteItem(result)) {
    return (
<LocationRow
  index={index}
  isCollapsed={isCollapsed}
  listData={listData}
  titlesOnly={titlesOnly}
  result={result}
  folders={folders}
  moveMode={moveMode}
  noteMovements={noteMovements}
  onNoteMovementChange={onNoteMovementChange}
  folder1Name={folder1Name}
  folder2Name={folder2Name}
  mode={mode}  // NEU falls noch nicht da
  similarities={similarities}  // NEU falls noch nicht da
  style={style}
  openNote={openNote}
/>
    )
  } else if (isFragmentItem(result)) {
    return <MatchRow query={itemData.query} result={result} style={style} openNote={openNote} />
  } else {
    throw Error('Unexpected result type')
  }
}

function LocationRow({
  index,
  isCollapsed,
  listData,
  titlesOnly,
  result,
  folders,
  moveMode,
  noteMovements,
  onNoteMovementChange,
  folder1Name,
  folder2Name,
  mode,  // NEU falls noch nicht da
  similarities,  // NEU falls noch nicht da
  style,
  openNote,
}: {
  index: number
  isCollapsed: boolean
  listData: NoteSearchListData
  titlesOnly: boolean
  result: NoteItemData
  folders: Folder[]
  moveMode: boolean
  noteMovements: Map<string, 'none' | 'folder1' | 'folder2'>
  onNoteMovementChange: (noteId: string, target: 'none' | 'folder1' | 'folder2') => void
  folder1Name: string
  folder2Name: string
  mode: 'search' | 'similarity'  // NEU falls noch nicht da
  similarities: Record<string, number>  // NEU falls noch nicht da
  style: CSSProperties
  openNote: (noteId: string, line?: number) => void
}) {
  const { id, title, matchCount, note } = result

  const handleOpenNoteClicked = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    openNote(result.id)
  }

  const parentFolder = folders.find((folder) => folder.id === note.parent_id)
  const parentFolderTitle = parentFolder?.title ?? ''

  const currentMovement = noteMovements.get(id) || 'none'

  // NEU: Custom styled radio buttons mit Farben
  const radioButtonStyle = (isSelected: boolean, color: 'gray' | 'red' | 'blue') => {
    const colors = {
      gray: isSelected ? 'bg-gray-500' : 'bg-gray-300',
      red: isSelected ? 'bg-red-600' : 'bg-red-300',
      blue: isSelected ? 'bg-blue-600' : 'bg-blue-300',
    }
    
    return `w-4 h-4 rounded-full border-2 ${isSelected ? 'border-gray-700' : 'border-gray-400'} ${colors[color]} cursor-pointer hover:opacity-80 transition-opacity`
  }

const noteHeaderContent = (
  <>
    {moveMode && (
      <div className="flex gap-1 mr-2" onClick={(e) => e.stopPropagation()}>
        <div
          className={radioButtonStyle(currentMovement === 'none', 'gray')}
          onClick={() => onNoteMovementChange(id, 'none')}
          title="Notizbuch beibehalten"
        />
        <div
          className={radioButtonStyle(currentMovement === 'folder1', 'red')}
          onClick={() => onNoteMovementChange(id, 'folder1')}
          title={`Verschieben zu: ${folder1Name}`}
        />
        <div
          className={radioButtonStyle(currentMovement === 'folder2', 'blue')}
          onClick={() => onNoteMovementChange(id, 'folder2')}
          title={`Verchieben zu: ${folder2Name}`}
        />
      </div>
    )}
    
    <Icon className={styles.LocationIcon} type="file" />
    <span className={styles.Location} onClick={handleOpenNoteClicked} title={title}>
      {title}
    </span>
    
    {/* NEU: Ähnlichkeitsprozentsatz im Similarity-Mode */}
    {mode === 'similarity' && similarities[id] !== undefined && (
      <span className="text-xm text-orange-600 dark:text-orange-400 font-semibold ml-2">
        {similarities[id].toFixed(0)}%
      </span>
    )}
    
{mode === 'search' && (
  <div className={styles.Count}>
    {!titlesOnly && `(${matchCount === 1 ? '1 match' : `${matchCount} matches`})`}
  </div>
)}
    
    {/* Ordner-Anzeige */}
    <span className="text-xm text-gray-500 dark:text-gray-400 ml-2">
      {parentFolderTitle}
    </span>
    
    <Icon className={styles.LocationIcon} type="open" title="Open Note" onClick={handleOpenNoteClicked} />
  </>
)
  let rowContent = (
    <span className="inline-block">
      <span className={styles.LocationRow} onClick={handleOpenNoteClicked}>
        {noteHeaderContent}
      </span>
    </span>
  )

  if (!titlesOnly) {
    rowContent = (
      <Expandable
        children={null}
        defaultOpen={false}
        header={noteHeaderContent}
        headerClassName={styles.LocationRow}
        key={id + isCollapsed.toString()}
        onChange={(collapsed) => listData.setCollapsed(index, !collapsed)}
      />
    )
  }

  return <div style={style}>{rowContent}</div>
}

interface MatchRowProps {
  query: string
  result: FragmentItemData
  style: CSSProperties
  openNote: (noteId: string, line?: number) => void
}

function MatchRow({ query, result, style, openNote }: MatchRowProps) {
  return (
    <div
      className={styles.MatchRow}
      onClick={() => {
        openNote(result.noteId, result.line)
      }}
      style={style}
    >
      <span className={styles.GroupLine}>&nbsp;&nbsp;</span>
      <HighlightMatch caseSensitive={false} needle={query} text={result.fragment} />
    </div>
  )
}
