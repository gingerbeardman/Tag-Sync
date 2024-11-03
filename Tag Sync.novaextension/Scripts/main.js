exports.activate = function() {
    let lastOpenTag = null;
    let isTypingTag = false;
    
    nova.workspace.onDidAddTextEditor((editor) => {
        if (!editor || !editor.document) return;
        
        let selectionDisposable = editor.onDidChangeSelection(() => {
            const range = editor.selectedRange;
            const line = editor.getTextInRange(editor.getLineRangeForRange(range));
            
            const openTagMatch = line.match(/<([^/][^>\s]*)/);
            if (openTagMatch) {
                lastOpenTag = openTagMatch[1];
                isTypingTag = true;
            }
        });
        
        let changeDisposable = editor.onDidChange(() => {
            if (!isTypingTag || !lastOpenTag) return;
            
            const range = editor.selectedRange;
            const line = editor.getTextInRange(editor.getLineRangeForRange(range));
            
            if (line.includes('>')) {
                isTypingTag = false;
                
                const docRange = new Range(range.start, editor.document.length);
                const remainingText = editor.getTextInRange(docRange);
                
                const closingTagRegex = new RegExp(`<\\/[^>]*>`);
                const match = remainingText.match(closingTagRegex);
                
                if (match) {
                    const closingTagStart = remainingText.indexOf(match[0]);
                    const closingTagRange = new Range(
                        range.start + closingTagStart,
                        range.start + closingTagStart + match[0].length
                    );
                    
                    editor.edit((edit) => {
                        edit.replace(closingTagRange, `</${lastOpenTag}>`);
                    });
                }
            }
        });
        
        editor.onDidDestroy(() => {
            selectionDisposable.dispose();
            changeDisposable.dispose();
        });
    });
};
