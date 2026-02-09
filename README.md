# VS-Code Style Search Plugin for Joplin M-Edition

This Joplin plugin provides a note search panel that is patterned after the search panel in VS Code. Search for text, and matches will be shown grouped by file, one line per match, with the match text highlighted. Both plain text and regular expression syntax should work.

You can search for text just in note titles with the "Search in titles only" checkbox. (This only returns exact title prefix matches by default - you may need to use regular expression syntax like `note*` to search for partial title matches.)

Toggle the panel with `CTRL-SHIFT-F`.

**This M-Edition of the plugin, forked from https://github.com/markerikson/joplin-plugin-vscode-style-search to meet my personal requirements, includes a mode that moves found notes to selectable notebooks. Main use cases are sorting notes and removing duplicates.**

Pressing `F4` changes to similarity-mode. Several methods are selectable. 

Pressing `F7` uses the selected text in the current note as search string. Pressing `F5` uses text within the second square brackets in the title of the current note as search string.

Versionen ab 3.5 enthalten den Ähnlichkeitsmodus und sind in Deutsch.
