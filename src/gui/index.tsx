function App() {
  const [searchText, setSearchText] = useState('')
  const [titlesOnly, setTitlesOnly] = useState(false)
  const [sortType, setSortType] = useState(SortType.Relevance)
  const [sortDirection, setSortDirection] = useState(SortDirection.Descending)
  
  // NEU: Move Mode States
  const [moveMode, setMoveMode] = useState(false)
  const [noteMovements, setNoteMovements] = useState<Map<string, 'none' | 'aussortiert' | 'museum'>>(new Map())
  const [isMoving, setIsMoving] = useState(false)

  // ... bestehender Code für useEffect message handler ...

  // NEU: Handler für Move Mode Toggle
  const handleMoveModeChanged = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { checked } = e.target
    setMoveMode(checked)
    if (!checked) {
      setNoteMovements(new Map()) // Reset bei Deaktivierung
    }
  }

  // NEU: Handler für Note Movement Selection
  const handleNoteMovementChange = (noteId: string, target: 'none' | 'aussortiert' | 'museum') => {
    setNoteMovements(prev => {
      const newMap = new Map(prev)
      newMap.set(noteId, target)
      return newMap
    })
  }

  // NEU: Handler für Execute Moves Button
  const handleExecuteMoves = async () => {
    try {
      setIsMoving(true)
      
      // Sammle alle Notizen die verschoben werden sollen
      const movesToExecute: { noteId: string; target: 'aussortiert' | 'museum' }[] = []
      
      noteMovements.forEach((target, noteId) => {
        if (target !== 'none') {
          movesToExecute.push({ noteId, target })
        }
      })
      
      if (movesToExecute.length === 0) {
        alert('No notes selected for moving')
        return
      }
      
      // Ordner sicherstellen und Notizen verschieben
      await client.stub.ensureMoveFoldersExist()
      await client.stub.moveNotes(movesToExecute)
      
      alert(`Successfully moved ${movesToExecute.length} note(s)`)
      
      // Reset
      setNoteMovements(new Map())
      setMoveMode(false)
      
      // Suche neu ausführen um aktuelle Liste zu zeigen
      setSearchText(searchText + ' ') // Trigger re-search
      setTimeout(() => setSearchText(searchText.trim()), 100)
      
    } catch (error) {
      console.error('Error executing moves:', error)
      alert('Error moving notes: ' + error)
    } finally {
      setIsMoving(false)
    }
  }
