export interface ProjectFile {
  id: string;
  name: string;
  path: string; // Full path like "src/components/Button.tsx"
  language: 'html' | 'css' | 'javascript' | 'typescript' | 'json' | 'other';
  content: string;
  type: 'file' | 'folder';
  parentId?: string; // Parent folder ID
  children?: string[]; // Child IDs for folders
  createdAt: number;
  modifiedAt: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string; // This will hold the raw text, potentially containing <file> tags during streaming
  timestamp: number;
  isStreaming?: boolean;
  images?: Array<{id: string, url: string, name: string}>; // Store uploaded images for user messages
}

export interface SavedProject {
  id: string;
  name: string;
  files: ProjectFile[];
  chatHistory: ChatMessage[];
  lastModified: number;
  codeHistory?: {[messageId: string]: {timestamp: number, files: ProjectFile[], messageText: string}};
}
