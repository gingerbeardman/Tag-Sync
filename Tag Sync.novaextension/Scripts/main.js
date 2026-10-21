const Logger = require('./logger.js');

exports.activate = function() {
    Logger.info('Extension activated');
    
    // Track state for tag synchronization
    class TagState {
        constructor() {
            this.activeRange = null;
            this.lastKnownName = null;
            this.skipNextChange = false;
        }
        
        clear() {
            this.activeRange = null;
            this.lastKnownName = null;
            this.skipNextChange = false;
        }
    }
    
    // Tag parsing helper functions
    function parseOpenTag(text) {
        // Modified to handle empty tag names
        const match = text.match(/^<([a-zA-Z0-9]*)/);
        return match ? match[1] : null;
    }
    
    function findTagAtPosition(editor, position) {
        const line = editor.getLineRangeForRange(new Range(position, position));
        const lineText = editor.document.getTextInRange(line);
        const charInLine = position - line.start;
        
        // Look for tag start
        let tagStart = lineText.lastIndexOf('<', charInLine);
        if (tagStart === -1) return null;
        
        // Make sure we're not in a closing tag
        if (lineText[tagStart + 1] === '/') return null;
        
        // Find tag end
        let tagEnd = lineText.indexOf('>', tagStart);
        if (tagEnd === -1) tagEnd = lineText.length;
        
        // Extract tag content
        const tagContent = lineText.substring(tagStart, tagEnd);
        const tagName = parseOpenTag(tagContent);
        
        // Allow empty tag names but still require the < character
        if (tagName === null) return null;
        
        // Make sure cursor is in tag name area (including empty space after <)
        const nameStart = tagStart + 1;
        const nameEnd = nameStart + tagName.length;
        if (charInLine < nameStart || charInLine > nameEnd) return null;
        
        return {
            name: tagName,
            range: new Range(line.start + nameStart, line.start + nameEnd)
        };
    }
    
    function findClosingTag(editor, startPos, tagName) {
        const docText = editor.document.getTextInRange(new Range(startPos, editor.document.length));
        
        // Match open and close tags of this name in document order. The name must be
        // followed by whitespace, ">" or "/>" so that "<div" does not match "<divx"
        const tagRegex = new RegExp(`<(\\/?)${tagName}(?=[\\s>]|\\/>)`, 'g');
        
        let depth = 1;
        let match;
        
        while ((match = tagRegex.exec(docText)) !== null) {
            if (match[1]) {
                depth--;
                if (depth === 0) {
                    const closeStart = startPos + match.index + 2; // +2 for </
                    return new Range(closeStart, closeStart + tagName.length);
                }
            } else {
                // Self-closing tags do not affect depth
                const tagEnd = docText.indexOf('>', tagRegex.lastIndex);
                if (tagEnd === -1 || docText[tagEnd - 1] !== '/') {
                    depth++;
                }
            }
        }
        
        return null;
    }
    
    // Create a new editor handler for each editor
    nova.subscriptions.add(nova.workspace.onDidAddTextEditor((editor) => {
        Logger.info('Editor registered', { path: editor.document.path });
        
        const state = new TagState();
        const subs = new CompositeDisposable();
        
        subs.add(editor.onDidChangeSelection((editor) => {
            if (state.skipNextChange) {
                state.skipNextChange = false;
                return;
            }

            const cursorPos = editor.selectedRange.start;
            const currentTag = findTagAtPosition(editor, cursorPos);
            
            Logger.debug('Selection changed', {
                cursorPos: cursorPos,
                currentTag: currentTag,
                activeRange: state.activeRange
            });
            
            // Clear active tag if we've moved out
            if (!currentTag) {
                if (state.activeRange) {
                    Logger.debug('Left tag');
                    state.clear();
                }
                return;
            }
            
            if (!state.activeRange || !currentTag.range.isEqual(state.activeRange)) {
                Logger.debug('Entered new tag', currentTag);
                state.activeRange = currentTag.range;
                state.lastKnownName = currentTag.name;
            }
        }));
        
        subs.add(editor.onWillSave(() => state.clear()));
        
        // Editing from inside a change callback throws, so sync on the next tick
        async function syncClosingTag() {
            state.syncTimer = null;
            if (!state.activeRange) return;
            
            const currentTag = findTagAtPosition(editor, state.activeRange.start);
            if (!currentTag) {
                Logger.debug('Lost tracked tag');
                state.clear();
                return;
            }
            
            // Only update if the tag name actually changed
            if (currentTag.name === state.lastKnownName) {
                return;
            }
            
            // Find closing tag using previous name
            const closingRange = findClosingTag(editor, currentTag.range.end, state.lastKnownName);
            if (!closingRange) {
                state.clear();
                return;
            }
            
            state.skipNextChange = true;
            
            // Update the closing tag
            await editor.edit(edit => {
                Logger.debug('Update closing tag');
                edit.replace(closingRange, currentTag.name);
            });
            
            state.lastKnownName = currentTag.name;
            state.activeRange = currentTag.range;
        }
        
        subs.add(editor.onDidChange(() => {
            if (state.skipNextChange) {
                state.skipNextChange = false;
                return;
            }

            if (!state.activeRange) return;
            
            if (state.syncTimer) clearTimeout(state.syncTimer);
            state.syncTimer = setTimeout(syncClosingTag, 0);
        }));
        
        subs.add(editor.onDidDestroy(() => {
            if (state.syncTimer) clearTimeout(state.syncTimer);
            subs.dispose();
        }));
    }));
}