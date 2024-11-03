const Logger = require('./logger.js');

exports.activate = function() {
    Logger.info('Extension activated');

    // Track active tag state
    let activeTagRange = null;
    let lastKnownTagName = null;
    
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
        
        // Handle empty tag names specially
        const closeTagRegex = tagName ? 
            new RegExp(`</${tagName}>`, 'g') :
            /<\/>/g;
            
        let depth = 1;
        let lastIndex = 0;
        
        while (depth > 0) {
            const openMatch = tagName ? 
                docText.indexOf(`<${tagName}`, lastIndex) :
                docText.indexOf('<', lastIndex);
                
            const closeMatch = closeTagRegex.exec(docText);
            
            if (!closeMatch && openMatch === -1) break;
            
            if (openMatch !== -1 && (openMatch < closeMatch?.index || !closeMatch)) {
                depth++;
                lastIndex = openMatch + 1;
            } else if (closeMatch) {
                depth--;
                if (depth === 0) {
                    const closeStart = startPos + closeMatch.index + 2; // +2 for </
                    return new Range(
                        closeStart, 
                        closeStart + (tagName ? tagName.length : 0)
                    );
                }
                lastIndex = closeMatch.index + 1;
            }
        }
        
        return null;
    }
    
    function updateClosingTag(editor, closingRange, newName) {
        editor.edit((edit) => {
            Logger.info('Updating closing tag', {
                range: closingRange,
                newName: newName
            });
            edit.replace(closingRange, newName);
        }).catch(error => {
            Logger.error('Failed to update closing tag', error.message);
        });
    }
    
    nova.workspace.onDidAddTextEditor((editor) => {
        Logger.info('Editor registered', { path: editor.document.path });
        
        editor.onDidChangeSelection((editor) => {
            const cursorPos = editor.selectedRange.start;
            const currentTag = findTagAtPosition(editor, cursorPos);
            
            Logger.debug('Selection changed', {
                cursorPos: cursorPos,
                currentTag: currentTag,
                activeTagRange: activeTagRange
            });
            
            // Clear active tag if we've moved out
            if (!currentTag) {
                if (activeTagRange) {
                    Logger.debug('Left tag');
                    activeTagRange = null;
                    lastKnownTagName = null;
                }
                return;
            }
            
            // Record new active tag
            if (!activeTagRange || !currentTag.range.isEqual(activeTagRange)) {
                Logger.debug('Entered new tag', currentTag);
                activeTagRange = currentTag.range;
                lastKnownTagName = currentTag.name;
            }
        });
        
        editor.onDidChange((editor) => {
            // Only process if we're tracking a tag
            if (!activeTagRange) return;
            
            const currentTag = findTagAtPosition(editor, activeTagRange.start);
            if (!currentTag) {
                Logger.debug('Lost tracked tag');
                activeTagRange = null;
                lastKnownTagName = null;
                return;
            }
            
            // Check if tag name changed
            if (currentTag.name === lastKnownTagName) {
                Logger.debug('Tag unchanged', currentTag.name);
                return;
            }
            
            Logger.debug('Tag changed', {
                from: lastKnownTagName,
                to: currentTag.name
            });
            
            // Find and update closing tag - use lastKnownTagName even if empty
            const closingRange = findClosingTag(editor, activeTagRange.end, lastKnownTagName);
            if (closingRange) {
                updateClosingTag(editor, closingRange, currentTag.name);
            }
            
            lastKnownTagName = currentTag.name;
            activeTagRange = currentTag.range;
        });
    });
}