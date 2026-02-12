import React, { useEffect, useRef } from 'react';
import { ProjectFile } from '../types';

interface PreviewProps {
  files: ProjectFile[];
}

export const Preview: React.FC<PreviewProps> = ({ files }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    // Debounce the update to prevent flashing during high-speed streaming
    const timeoutId = setTimeout(() => {
      const iframe = iframeRef.current;
      if (!iframe) return;

      const doc = iframe.contentDocument;
      if (!doc) return;

      // 1. Find entry point (prioritize index.html)
      const htmlFile = files.find(f => f.path === 'index.html') || files.find(f => f.path.endsWith('.html')) || files.find(f => f.type === 'file');
      
      // 2. Gather resources (only files, not folders)
      const cssFiles = files.filter(f => f.language === 'css' && f.type === 'file');
      const jsFiles = files.filter(f => f.language === 'javascript' && f.type === 'file');

      if (!htmlFile) {
          doc.open();
          doc.write('<h1 style="font-family:sans-serif; color:#666; text-align:center; margin-top:20%;">No HTML file found</h1>');
          doc.close();
          return;
      }

      // 3. Construct the final HTML blob
      let content = htmlFile.content;

      // Add meta tag to disable Vite HMR injection
      const disableHmrMeta = '<meta name="vite-plugin-react:exclude" content="true">';
      if (content.includes('<head>')) {
        content = content.replace('<head>', `<head>${disableHmrMeta}`);
      } else {
        content = `${disableHmrMeta}${content}`;
      }

      // Inject CSS (All CSS files concatenated in head)
      const styleTags = cssFiles.map(f => `<style>/* ${f.path} */\n${f.content}</style>`).join('\n');
      if (content.includes('</head>')) {
          content = content.replace('</head>', `${styleTags}</head>`);
      } else {
          content = `${styleTags}${content}`;
      }

      // Inject JS (All JS files concatenated in a single script tag to share global scope)
      // Sort files to ensure utils and dependencies load first
      const sortedJsFiles = [...jsFiles].sort((a, b) => {
        // Prioritize utility and helper files
        const aIsUtil = a.path.toLowerCase().includes('util') || a.path.toLowerCase().includes('helper') || a.path.toLowerCase().includes('config');
        const bIsUtil = b.path.toLowerCase().includes('util') || b.path.toLowerCase().includes('helper') || b.path.toLowerCase().includes('config');
        if (aIsUtil && !bIsUtil) return -1;
        if (!aIsUtil && bIsUtil) return 1;

        // Prioritize main.js to load last
        const aIsMain = a.path.toLowerCase().includes('main') || a.path.toLowerCase().includes('app');
        const bIsMain = b.path.toLowerCase().includes('main') || b.path.toLowerCase().includes('app');
        if (aIsMain && !bIsMain) return 1;
        if (!aIsMain && bIsMain) return -1;

        return a.path.localeCompare(b.path);
      });

      if (sortedJsFiles.length > 0) {
        // Combine all JS content into a single script tag to share global scope
        const allJsContent = sortedJsFiles.map(f => {
          const jsContent = f.content.trim();
          if (!jsContent) return '';

          // Add file comment for debugging
          return `\n/* === ${f.path} === */\n${jsContent}`;
        }).filter(content => content).join('\n\n');

        if (allJsContent) {
          const combinedScript = `<script>\ntry{\n${allJsContent}\n}catch(e){console.error("JavaScript execution error:", e);\nconsole.trace();}\n</script>`;

          if (content.includes('</body>')) {
            content = content.replace('</body>', `${combinedScript}</body>`);
          } else {
            content = `${content}${combinedScript}`;
          }
        }
      }

      // Create a blob URL to prevent Vite HMR injection
      const blob = new Blob([content], { type: 'text/html' });
      const url = URL.createObjectURL(blob);

      // Clear previous blob URL to prevent memory leaks
      const currentSrc = iframe.src;
      if (currentSrc && currentSrc.startsWith('blob:')) {
        URL.revokeObjectURL(currentSrc);
      }

      iframe.src = url;
    }, 800); // 800ms delay to allow typing to settle

    return () => clearTimeout(timeoutId);
  }, [files]);

  return (
    <div className="w-full h-full bg-white rounded-lg overflow-hidden shadow-inner relative">
      <iframe
        ref={iframeRef}
        title="Live Preview"
        className="w-full h-full border-0 bg-white"
        sandbox="allow-scripts allow-modals allow-same-origin"
      />
    </div>
  );
};