# VS-Code-Stil-Suchplugin für Joplin M-Edition

Dieses Joplin-Plugin bietet ein Notiz-Suchpanel, das dem Suchpanel in VS Code nachempfunden ist. Treffer werden nach Dateien gruppiert angezeigt, eine Zeile pro Treffer, mit hervorgehobenem Treffertext. Sie können mit der Checkbox "Nur in Titeln suchen" nach Text nur in Notiztiteln suchen.

Panel mit `STRG-UMSCHALT-F` umschalten.

**Diese M-Edition des Plugins, geforked von https://github.com/markerikson/joplin-plugin-vscode-style-search, um meine persönlichen Anforderungen zu erfüllen, enthält einen Modus, in dem gefundene Notizen in auswählbare Notizbücher verschoben werden können. Zudem gibt es einen Ähnlichkeitsmodus, der die Notizen anzeigt, die der gerade gewählten Notiz ähnlich sind. Hauptanwendungsfälle sind das Sortieren von Notizen und das Entfernen von Duplikaten.**

Drücken von `F4` wechselt in den Ähnlichkeitsmodus. Mehrere Algorithmen sind für die Ähnlichkeitssuche auswählbar und für jeden Algorithmus kann ein Schwellwert festgelegt werden.

Im Suchen-Modus verwendet `F7` den markierten Text in der aktuellen Notiz als Suchbegriff. Drücken von `F5` verwendet den Text innerhalb der zweiten eckigen Klammern im Titel der aktuellen Notiz als Suchbegriff.

Versionen ab 3.5 enthalten den Ähnlichkeitsmodus und sind in Deutsch. Features:

+ Normale Suche mit Treffern
+ Ähnlichkeitssuche mit 4 Algorithmen (Jaccard, Cosine, Dice, MinHash)
+ Ähnlichkeitsprozentsätze werden dann angezeigt
+ Ähnlichkeitssuche kann auf aktuelles + 1 zusätzliches Notizbuch begrenzt werden
+ Titel-only vs. Volltext-Vergleich/-Suche
+ Persistente Schwellwerte für jeden Algorithmus
+ Notizen verschieben mit 2 wählbaren Ziel-Notizbüchern
+ Alle Einstellungen bleiben nach Neustart erhalten
