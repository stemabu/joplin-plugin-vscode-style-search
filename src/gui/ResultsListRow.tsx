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
  moveMode: boolean  // NEU
  noteMovements: Map<string, 'none' | 'aussortiert' | 'museum'>  // NEU
  onNoteMovementChange: (noteId: string, target: 'none' | 'aussortiert' | 'museum') => void  // NEU
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
  const { openNote, titlesOnly, folders, moveMode, noteMovements, onNoteMovementChange } = itemData
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
        moveMode={moveMode}  // NEU
        noteMovements={noteMovements}  // NEU
        onNoteMovementChange={onNoteMovementChange}  // NEU
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
  moveMode,  // NEU
  noteMovements,  // NEU
  onNoteMovementChange,  // NEU
  style,
  openNote,
}: {
  index: number
  isCollapsed: boolean
  listData: NoteSearchListData
  titlesOnly: boolean
  result: NoteItemData
  folders: Folder[]
  moveMode: boolean  // NEU
  noteMovements: Map<string, 'none' | 'aussortiert' | 'museum'>  // NEU
  onNoteMovementChange: (noteId: string, target: 'none' | 'aussortiert' | 'museum') => void  // NEU
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

  // NEU: Aktueller Move-Status
  const currentMovement = noteMovements.get(id) || 'none'

  const noteHeaderContent = (
    <>
      {/* NEU: Radio Buttons für Move Mode */}
      {moveMode && (
        <div className="flex gap-1 mr-2" onClick={(e) => e.stopPropagation()}>
          <label title="Keep in current folder" className="cursor-pointer">
            <input
              type="radio"
              name={`move-${id}`}
              checked={currentMovement === 'none'}
              onChange={() => onNoteMovementChange(id, 'none')}
              className="cursor-pointer"
            />
          </label>
          <label title="Move to Aussortiert" className="cursor-pointer">
            <input
              type="radio"
              name={`move-${id}`}
              checked={currentMovement === 'aussortiert'}
              onChange={() => onNoteMovementChange(id, 'aussortiert')}
              className="cursor-pointer"
            />
          </label>
          <label title="Move to Museum" className="cursor-pointer">
            <input
              type="radio"
              name={`move-${id}`}
              checked={currentMovement === 'museum'}
              onChange={() => onNoteMovementChange(id, 'museum')}
              className="cursor-pointer"
            />
          </label>
        </div>
      )}
      
      <Icon className={styles.LocationIcon} type="file" />
      <div className={styles.Location} title={title}>
        {parentFolderTitle ? `${parentFolderTitle} > ` : null}
        {title}
      </div>
      {titlesOnly ? null : (
        <div className={styles.Count}>({matchCount === 1 ? '1 match' : `${matchCount} matches`})</div>
      )}

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
