import React, { useMemo, useRef } from 'react';
import { ProjectFile } from '../types';

// Access the global Prism object loaded via CDN in index.html
declare const Prism: any;

interface CodeEditorProps {
  file: ProjectFile;
  onChange: (newContent: string) => void;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({ file, onChange }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  // Sync scroll between textarea and pre
  const handleScroll = () => {
    if (textareaRef.current && preRef.current) {
      preRef.current.scrollTop = textareaRef.current.scrollTop;
      preRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  // Generate highlighted HTML safely
  const highlightedCode = useMemo(() => {
    if (typeof Prism === 'undefined') return file.content;
    
    // Determine grammar
    const lang = file.language === 'html' ? 'markup' : file.language;
    const grammar = Prism.languages[lang] || Prism.languages.javascript;
    
    return Prism.highlight(file.content, grammar, lang);
  }, [file.content, file.language]);

  return (
    <div className="editor-container bg-[#1e1e2e] relative w-full h-full overflow-hidden">
      <style>{`
        .editor-container {
          font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
          font-size: 14px;
          line-height: 1.5;
        }

        .editor-layer {
          margin: 0;
          padding: 16px;
          white-space: pre;
          word-wrap: normal;
          overflow: auto;
          border: none;
          tab-size: 4;
        }

        .editor-highlight {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          overflow: hidden;
          pointer-events: none;
          z-index: 1;
        }

        .editor-highlight code {
          background: none;
          font-family: inherit;
          font-size: inherit;
        }

        .editor-textarea {
          position: relative;
          z-index: 2;
          color: transparent;
          background: transparent;
          caret-color: white;
          resize: none;
          border: none;
          outline: none;
        }

        /* Ensure both layers use exact same font metrics */
        .editor-highlight, .editor-textarea {
          font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
          font-size: 14px;
          line-height: 1.5;
          letter-spacing: normal;
          tab-size: 4;
        }
      `}</style>

      {/* Background Layer: Syntax Highlighting */}
      <pre
        ref={preRef}
        className={`editor-layer editor-highlight language-${file.language}`}
        aria-hidden="true"
      >
        <code
          className={`language-${file.language}`}
          dangerouslySetInnerHTML={{ __html: highlightedCode }}
        />
      </pre>

      {/* Foreground Layer: Text Input */}
      <textarea
        ref={textareaRef}
        value={file.content}
        onChange={(e) => onChange(e.target.value)}
        onScroll={handleScroll}
        spellCheck={false}
        className="editor-layer editor-textarea"
        placeholder={`Editing ${file.name}...`}
      />
    </div>
  );
};