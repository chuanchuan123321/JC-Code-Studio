import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeEditor } from './components/CodeEditor';
import { Preview } from './components/Preview';
import { INITIAL_FILES } from './constants';
import { ProjectFile, ChatMessage, SavedProject } from './types';
import { streamCodeChat } from './services/geminiService';
import {
  LayoutIcon, SendIcon, LoaderIcon,
  RotateCwIcon, FolderIcon, PlusIcon, SaveIcon, TrashIcon, ChatIcon, CodeIcon, ImageIcon, XIcon, FullscreenIcon, ExitFullscreenIcon
} from './components/Icons';
// import { GenerateContentResponse } from '@google/genai'; // Removed Google GenAI dependency

// --- Helpers ---
const generateId = () => Math.random().toString(36).substr(2, 9);

const getLanguageFromFilename = (filename: string): 'html' | 'css' | 'javascript' | 'typescript' | 'json' | 'other' => {
  if (filename.endsWith('.css')) return 'css';
  if (filename.endsWith('.js')) return 'javascript';
  if (filename.endsWith('.ts')) return 'typescript';
  if (filename.endsWith('.tsx')) return 'typescript';
  if (filename.endsWith('.jsx')) return 'javascript';
  if (filename.endsWith('.json')) return 'json';
  if (filename.endsWith('.html')) return 'html';
  return 'other';
};


// Helper function to build file tree structure
const buildFileTree = (files: ProjectFile[]): { [key: string]: ProjectFile[] } => {
  const tree: { [key: string]: ProjectFile[] } = { root: [] };

  // Sort files by path to ensure proper tree structure
  const sortedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path));

  sortedFiles.forEach(file => {
    if (!file.parentId) {
      tree.root.push(file);
    } else {
      if (!tree[file.parentId]) {
        tree[file.parentId] = [];
      }
      tree[file.parentId].push(file);
    }
  });

  return tree;
};

// Helper function to parse file structure from AI response
const parseFileStructure = (fileContent: string): { files: ProjectFile[], projectName: string } => {
  const files: ProjectFile[] = [];
  const now = Date.now();
  let projectName = 'MyProject'; // Default project name

  // Parse files with <file name="path">content</file> format
  const fileRegex = /<file\s+name=["']([^"']+)["']>([\s\S]*?)<\/file>/g;
  let match;

  while ((match = fileRegex.exec(fileContent)) !== null) {
    const [_, filePath, content] = match;
    const parts = filePath.split('/');
    const fileName = parts[parts.length - 1];

    // Extract project name from the first folder level
    if (parts.length > 1 && !projectName || projectName === 'MyProject') {
      projectName = parts[0];
    }

    // Create folder structure (skipping the project root folder)
    let currentPath = '';
    let parentId: string | undefined;

    for (let i = 1; i < parts.length - 1; i++) {
      const folderName = parts[i];
      const folderPath = currentPath ? `${currentPath}/${folderName}` : folderName;
      const folderId = `folder_${folderPath.replace(/[^a-zA-Z0-9]/g, '_')}`;

      // Check if folder already exists
      if (!files.find(f => f.id === folderId)) {
        files.push({
          id: folderId,
          name: folderName,
          path: folderPath,
          language: 'other',
          content: '',
          type: 'folder',
          parentId,
          children: [],
          createdAt: now,
          modifiedAt: now
        });
      }

      if (parentId) {
        const parentFolder = files.find(f => f.id === parentId);
        if (parentFolder && parentFolder.children) {
          parentFolder.children.push(folderId);
        }
      }

      parentId = folderId;
      currentPath = folderPath;
    }

    // Create file path without project root folder
    const fileRelativePath = parts.length > 1 ? parts.slice(1).join('/') : fileName;
    const fileId = `file_${fileRelativePath.replace(/[^a-zA-Z0-9]/g, '_')}`;

    files.push({
      id: fileId,
      name: fileName,
      path: fileRelativePath,
      language: getLanguageFromFilename(fileName),
      content: content.trim(),
      type: 'file',
      parentId,
      createdAt: now,
      modifiedAt: now
    });

    // Add file to parent folder
    if (parentId) {
      const parentFolder = files.find(f => f.id === parentId);
      if (parentFolder && parentFolder.children) {
        parentFolder.children.push(fileId);
      }
    }
  }

  return { files, projectName };
};

// Helper function to create a single file with its folder structure
const createFileWithStructure = (aiFilePath: string, fileContent: string, existingFiles: ProjectFile[]): ProjectFile[] => {
  const now = Date.now();
  const parts = aiFilePath.split('/');
  const fileName = parts[parts.length - 1];

  // Create a copy of existing files to work with
  const files = [...existingFiles];

  // Create folder structure (skipping the project root folder)
  let currentPath = '';
  let parentId: string | undefined;

  for (let i = 1; i < parts.length - 1; i++) {
    const folderName = parts[i];
    const folderPath = currentPath ? `${currentPath}/${folderName}` : folderName;
    const folderId = `folder_${folderPath.replace(/[^a-zA-Z0-9]/g, '_')}`;

    // Check if folder already exists
    if (!files.find(f => f.id === folderId)) {
      files.push({
        id: folderId,
        name: folderName,
        path: folderPath,
        language: 'other',
        content: '',
        type: 'folder',
        parentId,
        children: [],
        createdAt: now,
        modifiedAt: now
      });

      // Add folder to parent folder if parent exists
      if (parentId) {
        const parentFolder = files.find(f => f.id === parentId);
        if (parentFolder && parentFolder.children) {
          parentFolder.children.push(folderId);
        }
      }
    }

    parentId = folderId;
    currentPath = folderPath;
  }

  // Create file path without project root folder
  const fileRelativePath = parts.length > 1 ? parts.slice(1).join('/') : fileName;
  const fileId = `file_${fileRelativePath.replace(/[^a-zA-Z0-9]/g, '_')}`;

  // Check if file already exists and update or create new
  const existingFileIndex = files.findIndex(f => f.path === fileRelativePath);
  if (existingFileIndex >= 0) {
    // Update existing file
    files[existingFileIndex] = {
      ...files[existingFileIndex],
      content: fileContent.trim(),
      modifiedAt: now
    };
  } else {
    // Create new file
    files.push({
      id: fileId,
      name: fileName,
      path: fileRelativePath,
      language: getLanguageFromFilename(fileName),
      content: fileContent.trim(),
      type: 'file',
      parentId,
      createdAt: now,
      modifiedAt: now
    });

    // Add file to parent folder
    if (parentId) {
      const parentFolder = files.find(f => f.id === parentId);
      if (parentFolder && parentFolder.children) {
        parentFolder.children.push(fileId);
      }
    }
  }

  return files;
};

const getFileColorClass = (filename: string) => {
  if (filename.endsWith('.html')) return 'text-orange-500';
  if (filename.endsWith('.css')) return 'text-blue-400';
  if (filename.endsWith('.js')) return 'text-yellow-400';
  return 'text-zinc-400';
};

const App: React.FC = () => {
  // -- Core State --
  const [showWelcome, setShowWelcome] = useState<boolean>(() => {
    // Check localStorage to persist welcome screen state
    const saved = localStorage.getItem('ai-code-studio-welcome');
    return saved === null ? true : saved === 'true';
  });
  const [files, setFiles] = useState<ProjectFile[]>(INITIAL_FILES);
  const [activeFileName, setActiveFileName] = useState<string>('index.html');
  const [codeHistory, setCodeHistory] = useState<{[projectId: string]: {[messageId: string]: {timestamp: number, files: ProjectFile[], messageText: string}}}>({});
  const [showCodeHistory, setShowCodeHistory] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
const [visibleTabs, setVisibleTabs] = useState<Set<string>>(new Set());
const [projectName, setProjectName] = useState<string>('');
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [apiKey, setApiKey] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([
  {
    id: 'welcome',
    role: 'model',
    text: 'Hello! I\'m ready to help you build something amazing. What would you like to create?',
    timestamp: Date.now()
  }
]);
  
  // -- Chat & AI State --
  const [chatInput, setChatInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [shouldStopGeneration, setShouldStopGeneration] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [uploadedImages, setUploadedImages] = useState<Array<{id: string, url: string, name: string}>>([]);

  // -- Workspace State --
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [sidebarView, setSidebarView] = useState<'chat' | 'files' | 'projects'>('chat');
  const [showPreview, setShowPreview] = useState(true);
  const [previewKey, setPreviewKey] = useState(0);
  const [notification, setNotification] = useState<{text: string, type: 'success' | 'error'} | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [modal, setModal] = useState<{
    type: 'confirm' | 'rename' | 'delete';
    title: string;
    message: string;
    onConfirm?: ((value?: string) => void) | (() => void);
    defaultValue?: string;
  } | null>(null);

  // Add ref to track input value
  const [renameInputValue, setRenameInputValue] = useState('');

  // Initialize rename input value when modal changes
  useEffect(() => {
    if (modal?.type === 'rename') {
      setRenameInputValue(modal.defaultValue || '');
    }
  }, [modal]);

  // Sync project name with current project
  useEffect(() => {
    if (currentProjectId) {
      const currentProject = savedProjects.find(p => p.id === currentProjectId);
      if (currentProject && currentProject.name !== projectName) {
        setProjectName(currentProject.name);
      }
    } else if (!projectName) {
      // Set default name when no project is loaded
      setProjectName('No Project');
    }
  }, [currentProjectId, savedProjects, projectName]);

  // Clean up localStorage when projects change (but with a delay to avoid conflicts)
  useEffect(() => {
    const cleanupTimeout = setTimeout(() => {
      const performCleanup = () => {
        try {
          // Only clean if we have a reasonable number of projects
          if (savedProjects.length === 0) return;

          // Get current projects from state and localStorage
          const stateProjectIds = new Set(savedProjects.map(p => p.id));

          // Check localStorage projects for any orphaned data
          const localStorageProjects = localStorage.getItem('ai-studio-projects');
          if (localStorageProjects) {
            const storedProjects = JSON.parse(localStorageProjects);
            const localStorageProjectIds = new Set(storedProjects.map((p: any) => p.id));

            // Find projects that exist in localStorage but not in state
            const orphanedProjectIds = [...localStorageProjectIds].filter(id => !stateProjectIds.has(id));

            // Only clean if we have significantly more projects in localStorage than in state
            // This prevents cleaning during normal save operations
            if (orphanedProjectIds.length > 0 && localStorageProjectIds.length > stateProjectIds.size + 1) {
              console.log('🧹 Found orphaned projects in localStorage, cleaning up...', orphanedProjectIds);

              // Update localStorage with only current projects
              localStorage.setItem('ai-studio-projects', JSON.stringify(savedProjects));

              // Clean up workspace codeHistory
              const workspaceData = localStorage.getItem('ai-studio-workspace');
              if (workspaceData) {
                const workspace = JSON.parse(workspaceData);
                if (workspace.codeHistory) {
                  const cleanedCodeHistory = {};
                  Object.keys(workspace.codeHistory).forEach(projectId => {
                    if (stateProjectIds.has(projectId)) {
                      cleanedCodeHistory[projectId] = workspace.codeHistory[projectId];
                    }
                  });

                  const cleanedWorkspace = { ...workspace, codeHistory: cleanedCodeHistory };
                  localStorage.setItem('ai-studio-workspace', JSON.stringify(cleanedWorkspace));
                }
              }

              console.log('✅ Cleaned up orphaned localStorage data');
            }
          }
        } catch (error) {
          console.error('Error during localStorage cleanup:', error);
        }
      };

      performCleanup();
    }, 1000); // 1 second delay to allow saves to complete

    return () => clearTimeout(cleanupTimeout);
  }, [savedProjects]);

  // -- Layout State (Resizable) --
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [editorWidthPercent, setEditorWidthPercent] = useState(50);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isResizingSplit, setIsResizingSplit] = useState(false);

  // -- Refs --
  const chatEndRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<ChatMessage[]>(messages);
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // -- Persistence Effects --

  // 1. Single Initialization Effect (Fixes all timing issues)
  useEffect(() => {
    console.log('=== INITIALIZING APP ===');

    let allProjects = [];

    // Load projects first
    try {
      const savedProjectsData = localStorage.getItem('ai-studio-projects');
      if (savedProjectsData) {
        allProjects = JSON.parse(savedProjectsData);
        console.log('Loaded', allProjects.length, 'projects from localStorage');
      } else {
        console.log('No saved projects found');
      }
    } catch (e) {
      console.error('Failed to load projects:', e);
    }

    // Load workspace
    let hasWorkspace = false;
    try {
      const workspaceData = localStorage.getItem('ai-studio-workspace');
      if (workspaceData) {
        const workspace = JSON.parse(workspaceData);

        if (workspace.files && workspace.files.length > 0) {
          console.log('Found workspace, restoring...');
          setFiles(workspace.files);
          setMessages(workspace.messages || []);
          // Set all files as visible tabs when restoring workspace
          setVisibleTabs(new Set(workspace.files.filter(f => f.type === 'file').map(f => f.path)));
          if (workspace.currentProjectId) {
            setCurrentProjectId(workspace.currentProjectId);
            // Load version history from workspace (since that's where we save it now)
            if (workspace.codeHistory) {
              setCodeHistory(workspace.codeHistory);
            }
          }
          if (workspace.activeFileName) setActiveFileName(workspace.activeFileName);
          if (workspace.sidebarWidth) setSidebarWidth(workspace.sidebarWidth);
          hasWorkspace = true;
        }
      }
    } catch (e) {
      console.error('Failed to load workspace:', e);
    }

    // Set projects state (after reading)
    setSavedProjects(allProjects);

    // If no projects exist, create default project1
    if (allProjects.length === 0) {
      console.log('No projects, creating default project1');

      const defaultProject = {
        id: generateId(),
        name: 'project1',
        files: [...INITIAL_FILES],
        chatHistory: [{
          id: 'welcome',
          role: 'model',
          text: 'Hello! I\'m ready to help you build something amazing. What would you like to create?',
          timestamp: Date.now()
        }],
        lastModified: Date.now(),
        codeHistory: {},
      };

      // Update all projects
      const updatedProjects = [defaultProject];

      // Set states
      setSavedProjects(updatedProjects);
      setFiles([...INITIAL_FILES]);
      setCodeHistory({});
      // Set all initial files as visible tabs
      setVisibleTabs(new Set(INITIAL_FILES.filter(f => f.type === 'file').map(f => f.path)));
      setMessages([{
        id: '1',
        role: 'model',
        text: 'Welcome to project1! I\'m ready to help you build something amazing. What would you like to create?',
        timestamp: Date.now()
      }]);
      setActiveFileName('index.html');
      setCurrentProjectId(defaultProject.id);

      // Save immediately to localStorage (bypass React for initial save)
      try {
        localStorage.setItem('ai-studio-projects', JSON.stringify(updatedProjects));
        localStorage.setItem('ai-studio-workspace', JSON.stringify({
          files: [...INITIAL_FILES],
          messages: [{ id: 'welcome', role: 'model', text: 'Hello! I\'m ready to help you build something amazing. What would you like to create?', timestamp: Date.now() }],
          currentProjectId: defaultProject.id,
          activeFileName: 'index.html',
          sidebarWidth: 320,
          codeHistory: {}, // Initialize with empty codeHistory
          lastActive: Date.now()
        }));
        console.log('Initial project saved to localStorage');
      } catch (e) {
        console.error('Failed to save initial data:', e);
      }

      setSidebarView('projects');
    }

    console.log('=== INITIALIZATION COMPLETE ===');
  }, []);

  // 2. Simple Save Effect (Only for ongoing changes)
  useEffect(() => {
    // Only save if we have data (not during initial load)
    if (savedProjects.length > 0) {
      try {
        localStorage.setItem('ai-studio-projects', JSON.stringify(savedProjects));
        console.log('Auto-saved', savedProjects.length, 'projects');
      } catch (e) {
        console.error('Failed to save projects:', e);
      }
    }
  }, [savedProjects]);

  // 4. Save Current Workspace (Session Auto-save)
  useEffect(() => {
    const saveWorkspace = () => {
      try {
        // Check if localStorage is available
        if (typeof Storage === 'undefined') {
          console.error('localStorage is not available');
          return;
        }

        const workspaceData = {
          files,
          messages,
          currentProjectId,
          activeFileName,
          sidebarWidth,
          codeHistory, // Add codeHistory to workspace save
          lastActive: Date.now()
        };

        const dataString = JSON.stringify(workspaceData);

        // Check if data is too large for localStorage
        if (dataString.length > 5 * 1024 * 1024) { // 5MB limit
          console.warn('Workspace data is large, may exceed localStorage limits:', dataString.length, 'bytes');
        }

        localStorage.setItem('ai-studio-workspace', dataString);
        console.log('Saved workspace with', files.length, 'files and', messages.length, 'messages');

        // Verify it was saved
        const saved = localStorage.getItem('ai-studio-workspace');
        if (!saved) {
          console.error('Failed to verify saved workspace data');
        }
      } catch (e) {
        console.error("Failed to save workspace:", e);
        if (e instanceof DOMException && e.name === 'QuotaExceededError') {
          console.error('localStorage quota exceeded');
          // Try to clear old data
          try {
            const oldData = localStorage.getItem('ai-studio-workspace');
            if (oldData) {
              const parsed = JSON.parse(oldData);
              if (parsed.lastActive && (Date.now() - parsed.lastActive) > 7 * 24 * 60 * 60 * 1000) {
                localStorage.removeItem('ai-studio-workspace');
                console.log('Cleared old workspace data due to quota limit');
              }
            }
          } catch (clearError) {
            console.error('Failed to clear old data:', clearError);
          }
        }
      }
    };

    // Debounce save to avoid excessive writes
    const timeoutId = setTimeout(saveWorkspace, 500);
    return () => clearTimeout(timeoutId);
  }, [files, messages, currentProjectId, activeFileName, sidebarWidth]);

  // 5. Auto-save current project (Real-time saving)
  useEffect(() => {
    if (currentProjectId && (files.length > 0 || messages.length > 0)) {
      const saveTimeout = setTimeout(() => {
        setSavedProjects(prev => prev.map(p =>
          p.id === currentProjectId
            ? { ...p, files: [...files], chatHistory: [...messages], lastModified: Date.now(), codeHistory }
            : p
        ));
      }, 1000); // Debounce for 1 second to avoid excessive saves

      return () => clearTimeout(saveTimeout);
    }
  }, [files, messages, currentProjectId, codeHistory]);

  // 6. ESC key handler for fullscreen exit
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  // 7. Scroll to bottom of chat
  useEffect(() => {
    messagesRef.current = messages;
    if (sidebarView === 'chat') chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sidebarView]);


  // -- Resizing Logic --
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingSidebar) {
        const newWidth = Math.max(240, Math.min(e.clientX, 600));
        setSidebarWidth(newWidth);
      }
      if (isResizingSplit && workspaceRef.current) {
        const rect = workspaceRef.current.getBoundingClientRect();
        const relativeX = e.clientX - rect.left;
        const newPercent = (relativeX / rect.width) * 100;
        // Strict clamping between 20% and 80%
        setEditorWidthPercent(Math.max(20, Math.min(newPercent, 80)));
      }
    };

    const handleMouseUp = () => {
      setIsResizingSidebar(false);
      setIsResizingSplit(false);
    };

    if (isResizingSidebar || isResizingSplit) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingSidebar, isResizingSplit]);

  // -- Actions --
  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setNotification({ text, type });
    setTimeout(() => setNotification(null), 3000);
  };

  // -- Image Upload Functions --
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const url = event.target?.result as string;
          const newImage = {
            id: generateId(),
            url: url,
            name: file.name
          };
          setUploadedImages(prev => [...prev, newImage]);
          showToast(`Added image: ${file.name}`, 'success');
        };
        reader.readAsDataURL(file);
      } else {
        showToast(`${file.name} is not an image file`, 'error');
      }
    });

    // Reset the input
    e.target.value = '';
  };

  const handlePasteImage = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items);
    let imageFound = false;

    items.forEach((item) => {
      if (item.type.startsWith('image/')) {
        imageFound = true;
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const url = event.target?.result as string;
            const newImage = {
              id: generateId(),
              url: url,
              name: `Pasted Image ${new Date().toLocaleTimeString()}`
            };
            setUploadedImages(prev => [...prev, newImage]);
            showToast('Image pasted successfully', 'success');
          };
          reader.readAsDataURL(file);
        }
      }
    });

    // If no image, allow normal text paste
    if (!imageFound) {
      // Can handle other paste content here or do nothing
    }
  };

  const removeUploadedImage = (imageId: string) => {
    setUploadedImages(prev => prev.filter(img => img.id !== imageId));
  };

  const clearAllImages = () => {
    setUploadedImages([]);
  };

  const handleFullscreenPreview = () => {
    setIsFullscreen(!isFullscreen);
  };

  // Handle paste events for images
  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      if (item.type.indexOf('image') !== -1) {
        e.preventDefault();

        const file = item.getAsFile();
        if (file) {
          // Convert File to base64
          const reader = new FileReader();
          reader.onload = (event) => {
            const url = event.target?.result as string;
            const newImage = {
              id: generateId(),
              url: url,
              name: `Pasted Image ${Date.now()}`
            };
            setUploadedImages(prev => [...prev, newImage]);
            showToast('Image pasted successfully!', 'success');
          };
          reader.readAsDataURL(file);
        }
        break; // Only handle the first image
      }
    }
  };

  // Add debugging function to window (for development)
  useEffect(() => {
    (window as any).debugWorkspace = {
      export: () => {
        const data = localStorage.getItem('ai-studio-workspace');
        console.log('Workspace data:', data ? JSON.parse(data) : null);
        return data;
      },
      import: (data: string) => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.files) setFiles(parsed.files);
          if (parsed.messages) setMessages(parsed.messages);
          if (parsed.currentProjectId) setCurrentProjectId(parsed.currentProjectId);
          if (parsed.activeFileName) setActiveFileName(parsed.activeFileName);
          if (parsed.sidebarWidth) setSidebarWidth(parsed.sidebarWidth);
          localStorage.setItem('ai-studio-workspace', data);
          console.log('Imported workspace successfully');
        } catch (e) {
          console.error('Failed to import workspace:', e);
        }
      },
      clear: () => {
        localStorage.removeItem('ai-studio-workspace');
        console.log('Cleared workspace data');
      },
      forceSave: () => {
        const workspaceData = {
          files,
          messages,
          currentProjectId,
          activeFileName,
          sidebarWidth,
          codeHistory, // Add codeHistory to workspace save
          lastActive: Date.now()
        };
        localStorage.setItem('ai-studio-workspace', JSON.stringify(workspaceData));
        console.log('Force saved workspace manually');
        return workspaceData;
      },
      showProjects: () => {
        const projects = localStorage.getItem('ai-studio-projects');
        console.log('Saved projects:', projects ? JSON.parse(projects) : null);
        return projects;
      },
      fixStorage: () => {
        // Manual fix for storage issues
        try {
          // Clear potentially bad data
          localStorage.removeItem('ai-studio-workspace');

          // Create fresh initial project
          const newProject = {
            id: generateId(),
            name: 'Recovery Project',
            files: [...INITIAL_FILES],
            chatHistory: [{ id: '1', role: 'model', text: 'Hello! Storage has been fixed. Start a new project by describing it.', timestamp: Date.now() }],
            lastModified: Date.now(),
          };

          const projects = [newProject];

          // Save fresh data
          localStorage.setItem('ai-studio-projects', JSON.stringify(projects));
          localStorage.setItem('ai-studio-workspace', JSON.stringify({
            files: [...INITIAL_FILES],
            messages: [{ id: '1', role: 'model', text: 'Hello! Storage has been fixed. Start a new project by describing it.', timestamp: Date.now() }],
            currentProjectId: newProject.id,
            activeFileName: 'index.html',
            sidebarWidth: 320,
            lastActive: Date.now()
          }));

          // Update React state
          setSavedProjects(projects);
          setFiles([...INITIAL_FILES]);
          setMessages([{ id: '1', role: 'model', text: 'Hello! Storage has been fixed. Start a new project by describing it.', timestamp: Date.now() }]);
          setActiveFileName('index.html');
          setCurrentProjectId(newProject.id);
          setSidebarView('projects');

          console.log('Storage has been completely reset and fixed');
          alert('Storage has been fixed! Refresh the page to see changes.');

        } catch (e) {
          console.error('Storage fix failed:', e);
          alert('Storage fix failed. Check browser console for details.');
        }
      },
      resetEverything: () => {
        // Complete reset
        if (confirm('This will delete ALL saved data. Are you sure?')) {
          localStorage.clear();
          console.log('All localStorage data cleared');
          alert('All data cleared. Refresh the page to start fresh.');
        }
      }
    };
    console.log('Workspace debugging functions available at window.debugWorkspace');
  }, []);

  const handleFileChange = useCallback((newContent: string) => {
    setFiles(prev => prev.map(f => f.path === activeFileName ? { ...f, content: newContent, modifiedAt: Date.now() } : f));
  }, [activeFileName]);

  const handleDeleteFile = useCallback((e: React.MouseEvent, filePath: string) => {
    e.stopPropagation();
    const fileToDelete = files.find(f => f.path === filePath);
    if (!fileToDelete) return;

    // Cannot delete if it's the last file
    const remainingFiles = files.filter(f => f.type === 'file' && f.path !== filePath);
    if (remainingFiles.length === 0) {
      showToast("Cannot delete the last file.", 'error');
      return;
    }

    if (window.confirm(`Delete ${filePath}?`)) {
      setFiles(prev => {
        let newFiles = [...prev];

        // Remove the file
        newFiles = newFiles.filter(f => f.path !== filePath);

        // If it was a folder, remove all children
        if (fileToDelete.type === 'folder') {
          const toRemove = new Set([fileToDelete.id]);
          const collectChildren = (parentId: string) => {
            const children = newFiles.filter(f => f.parentId === parentId);
            children.forEach(child => {
              toRemove.add(child.id);
              if (child.type === 'folder') {
                collectChildren(child.id);
              }
            });
          };
          collectChildren(fileToDelete.id);
          newFiles = newFiles.filter(f => !toRemove.has(f.id));
        }

        // Remove from parent's children array
        if (fileToDelete.parentId) {
          const parent = newFiles.find(f => f.id === fileToDelete.parentId);
          if (parent && parent.children) {
            parent.children = parent.children.filter(id => id !== fileToDelete.id);
          }
        }

        return newFiles;
      });

      // Update active file if we deleted it
      if (activeFileName === filePath) {
        const nextFile = files.find(f => f.type === 'file' && f.path !== filePath);
        if (nextFile) setActiveFileName(nextFile.path);
      }
    }
  }, [files, activeFileName]);

  // Function to handle clearing chat history
  const handleClearChatHistory = () => {
    setModal({
      title: 'Clear Chat History',
      message: 'Are you sure you want to clear all chat history? This action cannot be undone.',
      type: 'confirm',
      onConfirm: () => {
        const welcomeMessage: ChatMessage = {
          id: generateId(),
          role: 'model',
          text: `Hello! I'm ready to help you work with "${projectName}". What would you like to do?`,
          timestamp: Date.now()
        };

        setMessages([welcomeMessage]);

        // Update current project if it exists
        if (currentProjectId) {
          setSavedProjects(prev => prev.map(p =>
            p.id === currentProjectId
              ? { ...p, chatHistory: [welcomeMessage], lastModified: Date.now() }
              : p
          ));
        }

        // Update workspace
        const workspaceData = {
          files,
          messages: [welcomeMessage],
          currentProjectId,
          activeFileName,
          sidebarWidth,
          projectName,
          lastActive: Date.now()
        };
        localStorage.setItem('ai-studio-workspace', JSON.stringify(workspaceData));

        showToast('Chat history cleared successfully', 'success');
        setModal(null);
      },
      onCancel: () => setModal(null)
    });
  };

  const handleNewProject = () => {
    console.log('handleNewProject called');

    const createNewProject = (projectName: string) => {
      if (!projectName || projectName.trim() === '') {
        return;
      }

      const finalProjectName = projectName.trim();

      setFiles(INITIAL_FILES);
      setMessages([{ id: 'welcome', role: 'model', text: 'Hello! I\'m ready to help you build something amazing. What would you like to create?', timestamp: Date.now() }]);
      setActiveFileName('index.html');
      setSidebarView('chat');

      // Update the project name state
      setProjectName(finalProjectName);

      const newProject: SavedProject = {
        id: generateId(),
        name: finalProjectName,
        files: [...INITIAL_FILES],
        chatHistory: [{ id: 'welcome', role: 'model', text: 'Hello! I\'m ready to help you build something amazing. What would you like to create?', timestamp: Date.now() }],
        lastModified: Date.now(),
      };
      setSavedProjects(prev => [newProject, ...prev]);
      setCurrentProjectId(newProject.id);
      showToast(`Created and auto-saving "${finalProjectName}"`);
    };

    // Directly show project naming dialog (no confirmation needed since auto-save is enabled)
    setModal({
      type: 'rename',
      title: 'New Project',
      message: 'Enter project name:',
      defaultValue: `Project ${savedProjects.length + 1}`,
      onConfirm: createNewProject
    });
  };

  const handleSaveProject = () => {
    const now = Date.now();
    if (currentProjectId) {
      // Update existing
      setSavedProjects(prev => prev.map(p =>
        p.id === currentProjectId
          ? { ...p, files: [...files], chatHistory: [...messages], lastModified: now, codeHistory }
          : p
      ));
      const name = savedProjects.find(p => p.id === currentProjectId)?.name || 'Project';
      showToast(`Saved "${name}"`);
    } else {
      // Create new
      const name = prompt('Project Name:', `Project ${savedProjects.length + 1}`);
      if (!name) return;
      const newProject: SavedProject = {
        id: generateId(),
        name,
        files: [...files],
        chatHistory: [...messages],
        lastModified: now,
        codeHistory: {},
      };
      setSavedProjects(prev => [newProject, ...prev]);
      setCurrentProjectId(newProject.id);
      setSidebarView('projects'); // Switch to projects view so user sees the new project
      showToast(`Project "${name}" created`);
    }
  };

  const handleLoadProject = (p: SavedProject) => {
    setFiles(p.files);
    setMessages(p.chatHistory);
    setActiveFileName(p.files[0]?.path || 'index.html');
    setCurrentProjectId(p.id);
    setCodeHistory(p.codeHistory || {});
    // Set all files as visible tabs when loading project
    setVisibleTabs(new Set(p.files.filter(f => f.type === 'file').map(f => f.path)));
    setSidebarView('chat');
    setPreviewKey(k => k + 1);
    showToast(`Loaded "${p.name}"`);
  };

  const handleDeleteProject = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const project = savedProjects.find(p => p.id === id);
    if (!project) return;

    setModal({
      type: 'delete',
      title: 'Delete Project',
      message: `Permanently delete "${project.name}"? This action cannot be undone.`,
      onConfirm: () => {
        const remainingProjects = savedProjects.filter(p => p.id !== id);
        const isDeletingCurrentProject = currentProjectId === id;

        setSavedProjects(prev => {
          const filtered = prev.filter(p => p.id !== id);

          // If no projects remain, create default "project1"
          if (filtered.length === 0) {
            const defaultProject: SavedProject = {
              id: generateId(),
              name: 'project1',
              files: [...INITIAL_FILES],
              chatHistory: [{
                id: 'welcome',
                role: 'model',
                text: 'Hello! I\'m ready to help you build something amazing. What would you like to create?',
                timestamp: Date.now()
              }],
              createdAt: Date.now(),
              lastModified: Date.now()
            };

            // Set as current project and update files/messages
            setCurrentProjectId(defaultProject.id);
            setFiles([...defaultProject.files]);
            setMessages(defaultProject.chatHistory);

            return [defaultProject];
          }

          return filtered;
        });

        // If we deleted the current project, switch to the next available project
        if (isDeletingCurrentProject && remainingProjects.length > 0) {
          // Find the next project in the list (most recent one)
          const nextProject = remainingProjects[0];
          setCurrentProjectId(nextProject.id);
          setFiles([...nextProject.files]);
          setMessages(nextProject.chatHistory);
          setProjectName(nextProject.name);
          showToast(`Switched to "${nextProject.name}"`);
        } else if (isDeletingCurrentProject) {
          // If we deleted the current project but no projects remain, this is handled above
          setCurrentProjectId(null);
        }

        // Clean up localStorage to remove any orphaned project data
        setTimeout(() => cleanupLocalStorage(id), 500); // Longer delay to ensure state updates complete

        showToast(`Project "${project.name}" deleted`);
      }
    });
  };

  // Clean up localStorage to remove any orphaned project data
  const cleanupLocalStorage = (deletedProjectId?: string) => {
    try {
      // Get fresh data from localStorage to avoid race conditions
      const localStorageProjects = localStorage.getItem('ai-studio-projects');
      if (!localStorageProjects) return;

      const storedProjects = JSON.parse(localStorageProjects);
      const currentProjectIds = new Set(savedProjects.map(p => p.id));

      // Only clean up projects that are definitely not in current state
      const definitelyOrphanedProjects = storedProjects.filter((p: any) => !currentProjectIds.has(p.id));

      if (definitelyOrphanedProjects.length === 0 && !deletedProjectId) {
        return; // No cleanup needed
      }

      // Clean up codeHistory for deleted projects
      const workspaceData = localStorage.getItem('ai-studio-workspace');
      if (workspaceData) {
        const workspace = JSON.parse(workspaceData);
        if (workspace.codeHistory) {
          const cleanedCodeHistory = {};
          Object.keys(workspace.codeHistory).forEach(projectId => {
            if (currentProjectIds.has(projectId)) {
              cleanedCodeHistory[projectId] = workspace.codeHistory[projectId];
            }
          });

          // Save cleaned workspace back to localStorage
          const cleanedWorkspace = { ...workspace, codeHistory: cleanedCodeHistory };
          localStorage.setItem('ai-studio-workspace', JSON.stringify(cleanedWorkspace));

          const removedProjectIds = Object.keys(workspace.codeHistory).filter(id => !currentProjectIds.has(id));
          if (removedProjectIds.length > 0) {
            console.log('🧹 Cleaned up localStorage codeHistory for deleted projects:', removedProjectIds);
          }
        }
      }

      // Clean up projects localStorage if we have orphaned projects
      if (definitelyOrphanedProjects.length > 0) {
        const filteredProjects = storedProjects.filter((p: any) => currentProjectIds.has(p.id));
        localStorage.setItem('ai-studio-projects', JSON.stringify(filteredProjects));
        console.log('🗑️ Removed orphaned projects from localStorage:', definitelyOrphanedProjects.map(p => p.id));
      }

      // Also handle the explicitly deleted project ID
      if (deletedProjectId) {
        const currentProjects = JSON.parse(localStorage.getItem('ai-studio-projects') || '[]');
        const filteredProjects = currentProjects.filter((p: any) => p.id !== deletedProjectId);
        localStorage.setItem('ai-studio-projects', JSON.stringify(filteredProjects));
        console.log('🗑️ Removed explicitly deleted project from localStorage:', deletedProjectId);
      }
    } catch (error) {
      console.error('Error cleaning up localStorage:', error);
    }
  };

  const handleRenameProject = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const project = savedProjects.find(p => p.id === id);
    if (!project) return;

    console.log('Starting rename for project:', project.name, 'ID:', id);

    setRenameInputValue(project.name);
    setModal({
      type: 'rename',
      title: 'Rename Project',
      message: 'Enter new project name:',
      defaultValue: project.name,
      onConfirm: (newName?: string) => {
        const finalName = newName || renameInputValue;
        console.log('Rename confirmed:', finalName, 'Old name:', project.name);

        if (finalName && finalName.trim() && finalName !== project.name) {
          const trimmedName = finalName.trim();

          setSavedProjects(prev => {
            console.log('Before rename, projects:', prev.map(p => ({ id: p.id, name: p.name })));

            const updated = prev.map(p =>
              p.id === id ? { ...p, name: trimmedName } : p
            );

            console.log('After rename, projects:', updated.map(p => ({ id: p.id, name: p.name })));

            // Immediately save to localStorage
            try {
              localStorage.setItem('ai-studio-projects', JSON.stringify(updated));
              console.log('✅ Renamed project saved to localStorage:', trimmedName);
            } catch (error) {
              console.error('❌ Failed to save renamed project:', error);
            }

            return updated;
          });

          // Update projectName if this is the current project
          if (currentProjectId === id) {
            setProjectName(trimmedName);
          }

          showToast(`Project renamed to "${trimmedName}"`);
        } else {
          console.log('Rename cancelled or invalid name');
        }
      }
    });
  };

  const handleWelcomeSubmit = async () => {
    if ((!chatInput.trim() && uploadedImages.length === 0) || isGenerating) return;

    // Create new project
    const newProjectId = generateId();
    setCurrentProjectId(newProjectId);

    // Create new project with initial files
    const newProject: SavedProject = {
      id: newProjectId,
      name: `Project ${savedProjects.length + 1}`,
      files: [...INITIAL_FILES],
      chatHistory: [],
      createdAt: Date.now(),
      lastModified: Date.now()
    };

    // Add to saved projects
    setSavedProjects(prev => [newProject, ...prev]);

    // Reset to clean state
    setFiles([...INITIAL_FILES]);
    setMessages([{
      id: 'welcome',
      role: 'model',
      text: 'Hello! I\'m ready to help you build something amazing. What would you like to create?',
      timestamp: Date.now()
    }]);

    // Transition to work interface
    setShowWelcome(false);

    // Small delay to let the transition start, then send the message
    setTimeout(() => {
      // Now send the user's message to start the new conversation
      handleSendMessage();
    }, 100);
  };

  const handleDirectEnter = () => {
    // Just transition to work interface without clearing existing state
    // This allows users to continue their current work
    setShowWelcome(false);
  };

  // Function to handle folder import
  const handleFolderImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    console.log('handleFolderImport called');
    const uploadedFiles = event.target.files;
    console.log('uploadedFiles:', uploadedFiles);

    if (!uploadedFiles || uploadedFiles.length === 0) {
      console.log('No files selected');
      return;
    }

    const now = Date.now();
    const newFiles: ProjectFile[] = [];
    const folderMap = new Map<string, string>(); // path to folderId mapping

    // Get project name from first file's path
    const firstPath = uploadedFiles[0].webkitRelativePath;
    const projectNameFromFolder = firstPath.split('/')[0];
    const finalProjectName = projectNameFromFolder || 'ImportedProject';

    // First, save current workspace as a project only if it has unsaved changes AND is not already saved
    if (files.length > 0 && !currentProjectId) {
      // Only save if this is a new unsaved workspace (no currentProjectId)
      const currentProject: SavedProject = {
        id: generateId(),
        name: projectName || 'Untitled Project',
        files: files,
        chatHistory: messages,
        lastModified: Date.now(),
        codeHistory: codeHistory
      };

      const savedProjects = JSON.parse(localStorage.getItem('ai-studio-projects') || '[]');
      savedProjects.push(currentProject);
      localStorage.setItem('ai-studio-projects', JSON.stringify(savedProjects));
      setSavedProjects(savedProjects); // Update React state
      console.log('Saved current project:', currentProject.name);
    } else if (files.length > 0 && currentProjectId) {
      // Update current project instead of creating a new one
      const savedProjects = JSON.parse(localStorage.getItem('ai-studio-projects') || '[]');
      const projectIndex = savedProjects.findIndex((p: SavedProject) => p.id === currentProjectId);
      if (projectIndex !== -1) {
        savedProjects[projectIndex] = {
          ...savedProjects[projectIndex],
          files: files,
          chatHistory: messages,
          lastModified: Date.now(),
          codeHistory: codeHistory
        };
        localStorage.setItem('ai-studio-projects', JSON.stringify(savedProjects));
        setSavedProjects(savedProjects); // Update React state
        console.log('Updated current project:', projectName);
      }
    }

    // Now create and load the new imported project
    const importedProject: SavedProject = {
      id: generateId(),
      name: finalProjectName,
      files: [], // Will be populated with imported files
      chatHistory: [{
        id: 'welcome',
        role: 'model',
        text: `Hello! I've imported "${finalProjectName}". I'm ready to help you work with this project. What would you like to do?`,
        timestamp: Date.now()
      }],
      lastModified: Date.now(),
      codeHistory: {}
    };

    // Save the imported project to localStorage
    const allProjects = JSON.parse(localStorage.getItem('ai-studio-projects') || '[]');
    allProjects.push(importedProject);
    localStorage.setItem('ai-studio-projects', JSON.stringify(allProjects));

    // Update React state to refresh the projects list
    setSavedProjects(allProjects);

    // Switch to the imported project
    setCurrentProjectId(importedProject.id);
    setProjectName(finalProjectName);
    setCodeHistory({});
    setActiveFileName('');
    setExpandedFolders(new Set());
    setSidebarView('chat');

    // First pass: create folder structure
    console.log('Starting folder structure creation for', uploadedFiles.length, 'files');
    for (let i = 0; i < uploadedFiles.length; i++) {
      const file = uploadedFiles[i];
      const relativePath = file.webkitRelativePath; // e.g., "project-name/src/components/Button.js"
      console.log(`File ${i + 1}/${uploadedFiles.length}:`, relativePath);

      if (!relativePath) {
        console.log('Skipping file without relativePath');
        continue;
      }

      const pathParts = relativePath.split('/');
      const projectName = pathParts[0]; // First part is project name

      // Create folder structure
      let currentPath = '';
      let parentId: string | undefined;

      for (let j = 1; j < pathParts.length - 1; j++) {
        const folderName = pathParts[j];
        currentPath = currentPath ? `${currentPath}/${folderName}` : folderName;

        // Remove project name prefix from folder path
        const folderPath = currentPath;
        const folderId = `folder_${folderPath.replace(/[^a-zA-Z0-9]/g, '_')}`;

        if (!folderMap.has(folderPath)) {
          folderMap.set(folderPath, folderId);

          newFiles.push({
            id: folderId,
            name: folderName,
            path: folderPath,
            language: 'other',
            content: '',
            type: 'folder',
            parentId,
            children: [],
            createdAt: now,
            modifiedAt: now
          });

          // Update parent folder's children
          if (parentId) {
            const parentFolder = newFiles.find(f => f.id === parentId);
            if (parentFolder && parentFolder.children) {
              parentFolder.children.push(folderId);
            }
          }
        }
        parentId = folderMap.get(folderPath);
      }
    }

    // Second pass: add files
    for (let i = 0; i < uploadedFiles.length; i++) {
      const file = uploadedFiles[i];
      const relativePath = file.webkitRelativePath;

      if (!relativePath) continue;

      const pathParts = relativePath.split('/');
      const fileName = pathParts[pathParts.length - 1];

      // Skip if it's a directory (webkitRelativePath ends with /)
      if (!fileName) continue;

      // Remove project name prefix from file path
      const filePath = pathParts.slice(1).join('/');
      const language = getLanguageFromFilename(fileName);

      // Get parent folder ID
      const folderPath = pathParts.slice(1, -1).join('/');
      const parentId = folderPath ? folderMap.get(folderPath) : undefined;

      const content = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsText(file);
      });

      newFiles.push({
        id: generateId(),
        name: fileName,
        path: filePath,
        language,
        content,
        type: 'file',
        parentId,
        createdAt: now,
        modifiedAt: now
      });

      // Update parent folder's children
      if (parentId) {
        const parentFolder = newFiles.find(f => f.id === parentId);
        if (parentFolder && parentFolder.children) {
          parentFolder.children.push(newFiles[newFiles.length - 1].id);
        }
      }
    }

    console.log('Import complete. Files:', newFiles.length, 'Project Name:', finalProjectName);

    // Update the imported project with the actual files
    const updatedProjects = JSON.parse(localStorage.getItem('ai-studio-projects') || '[]');
    const projectIndex = updatedProjects.findIndex((p: SavedProject) => p.id === importedProject.id);
    if (projectIndex !== -1) {
      updatedProjects[projectIndex].files = newFiles;
      localStorage.setItem('ai-studio-projects', JSON.stringify(updatedProjects));

      // Update React state again to refresh the projects list with files
      setSavedProjects(updatedProjects);
    }

    // Set the files and active file
    setFiles(newFiles);
    const htmlFile = newFiles.find(f => f.type === 'file' && f.language === 'html');
    console.log('HTML file found:', htmlFile);
    setActiveFileName(htmlFile?.path || ''); // Use path instead of name
    setExpandedFolders(new Set(folderMap.keys())); // Expand all imported folders (as Set)
    setMessages(importedProject.chatHistory); // Set the welcome message

    // Reset input
    if (event.target) {
      event.target.value = '';
    }

    console.log('Import process completed successfully');
    showToast(`Imported "${finalProjectName}" with ${newFiles.length} files`, 'success');

    // Ensure UI updates to show the new project
    setTimeout(() => {
      // Force a re-render by updating projects again
      const currentProjects = JSON.parse(localStorage.getItem('ai-studio-projects') || '[]');
      setSavedProjects([...currentProjects]);
      console.log('Projects list refreshed:', currentProjects.length);
    }, 100);
  };

  // Function to download entire project as ZIP
  const downloadProject = () => {
    // Import JSZip dynamically
    import('jszip').then((JSZip) => {
      const zip = new JSZip.default();

      // Create project folder
      const projectFolder = zip.folder(projectName);

      // Add all files to the ZIP with proper folder structure
      files.filter(f => f.type === 'file').forEach(file => {
        const pathSegments = file.path.split('/');
        let currentFolder = projectFolder;

        // Create nested folders
        for (let i = 0; i < pathSegments.length - 1; i++) {
          currentFolder = currentFolder.folder(pathSegments[i]);
        }

        // Add file to the correct folder
        currentFolder.file(pathSegments[pathSegments.length - 1], file.content);
      });

      // Add project info
      const projectInfo = {
        name: projectName,
        createdAt: new Date().toISOString(),
        fileCount: files.filter(f => f.type === 'file').length,
        description: 'Generated by AI Code Studio'
      };

      projectFolder.file('project-info.json', JSON.stringify(projectInfo, null, 2));

      // Add README
      const readmeContent = `# ${projectName}

This project was generated by AI Code Studio.

## Project Structure
${files.filter(f => f.type === 'file').map(f =>
  `- \`${f.path}\` - ${f.language} file`
).join('\n')}

## How to Use
1. Open \`index.html\` in your web browser to view the project
2. Edit the files to customize the project
3. All styles and scripts are already linked properly

## Technologies Used
- HTML
- CSS
- JavaScript

Generated on: ${new Date().toLocaleDateString()}
`;

      projectFolder.file('README.md', readmeContent);

      // Generate and download the ZIP file
      zip.generateAsync({ type: 'blob' }).then((content) => {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = `${projectName}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);

        showToast(`Project "${projectName}" downloaded successfully!`);
      }).catch((error) => {
        console.error('Error creating ZIP file:', error);
        showToast('Failed to create project ZIP', 'error');
      });
    }).catch((error) => {
      console.error('JSZip not available:', error);
      // Fallback: download individual files
      downloadIndividualFiles();
    });
  };

  // Fallback function to download files individually
  const downloadIndividualFiles = () => {
    showToast('ZIP download not available, downloading files individually...');

    files.filter(f => f.type === 'file').forEach(file => {
      const link = document.createElement('a');
      link.href = `data:text/${file.language};charset=utf-8,${encodeURIComponent(file.content)}`;
      link.download = file.name;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  };

  const handleStopGeneration = () => {
    setShouldStopGeneration(true);
    if (abortController) {
      abortController.abort();
    }
    setIsGenerating(false);
  };

  const handleBackToWelcome = () => {
    setShowWelcome(true);
  };

  // Save conversation version before AI generates response
  const saveConversationVersion = (userMessageId: string, filesBeforeUpdate: ProjectFile[], messageText: string) => {
    if (!currentProjectId) {
      console.log('⚠️ No current project ID, skipping version save');
      return;
    }

    console.log('🔄 Saving conversation version for project:', currentProjectId);
    console.log('💬 Message ID:', userMessageId, messageText.substring(0, 50));
    console.log('📁 Files count:', filesBeforeUpdate.length);

    setCodeHistory(prev => {
      const projectHistory = prev[currentProjectId] || {};
      const newProjectHistory = {
        ...projectHistory,
        [userMessageId]: {
          timestamp: Date.now(),
          files: [...filesBeforeUpdate],
          messageText
        }
      };

      const newHistory = {
        ...prev,
        [currentProjectId]: newProjectHistory
      };

      console.log('💾 Total versions for project', currentProjectId, ':', Object.keys(newProjectHistory).length);
      return newHistory;
    });
  };

  // Restore conversation version (keep version in history)
  const restoreConversationVersion = (messageId: string) => {
    if (!currentProjectId) return;

    const projectHistory = codeHistory[currentProjectId];
    if (!projectHistory) return;

    const version = projectHistory[messageId];
    if (!version) return;

    // Restore all files to this version
    setFiles([...version.files]);
    console.log('🔄 Restored version', messageId, 'for project', currentProjectId);
  };

  // Delete specific conversation version
  const deleteConversationVersion = (messageId: string) => {
    if (!currentProjectId) return;

    setCodeHistory(prev => {
      const projectHistory = prev[currentProjectId] || {};
      const newProjectHistory = { ...projectHistory };
      delete newProjectHistory[messageId];

      return {
        ...prev,
        [currentProjectId]: newProjectHistory
      };
    });
  };

  // Clear all conversation history for current project
  const clearConversationHistory = () => {
    if (!currentProjectId) return;

    setCodeHistory(prev => ({
      ...prev,
      [currentProjectId]: {}
    }));
  };

  // Settings related functions
  const handleSaveApiKey = (newApiKey: string) => {
    setApiKey(newApiKey);
    localStorage.setItem('ai-studio-api-key', newApiKey);
    showToast('API key saved successfully', 'success');
  };

  const handleClearApiKey = () => {
    setApiKey('');
    localStorage.removeItem('ai-studio-api-key');
    showToast('API key cleared', 'success');
  };

  // Calculate localStorage size
  const getLocalStorageSize = () => {
    let totalSize = 0;
    let projectCount = 0;

    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        const value = localStorage[key];
        const size = (key.length + value.length) * 2; // UTF-16 characters are 2 bytes
        totalSize += size;

        // Count project-related items
        if (key.includes('ai-studio-')) {
          projectCount++;
        }
      }
    }

    return {
      totalSize,
      projectCount,
      formattedSize: formatBytes(totalSize)
    };
  };

  // Format bytes to human readable format
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Clear all localStorage data
  const handleClearLocalStorage = () => {
    setModal({
      type: 'confirm',
      title: 'Clear All Data',
      message: 'Are you sure you want to clear all stored data? This action cannot be undone and will delete all your projects, API keys, and settings.',
      onConfirm: () => {
        try {
          const keys = Object.keys(localStorage);
          keys.forEach(key => localStorage.removeItem(key));

          // Reset all states
          setSavedProjects([]);
          setCurrentProjectId(null);
          setFiles(INITIAL_FILES);
          setMessages([{ id: 'welcome', role: 'model', text: 'Hello! I\'m ready to help you build something amazing. What would you like to create?', timestamp: Date.now() }]);
          setApiKey('');
          setCodeHistory({});
          setProjectName('');

          showToast('All data cleared successfully');
          setShowSettings(false);
          console.log('🗑️ All localStorage data cleared');
        } catch (e) {
          console.error(e);
          showToast("Error clearing data", 'error');
        }
      }
    });
  };

  // Clear only project data
  const handleClearProjectData = () => {
    setModal({
      type: 'confirm',
      title: 'Clear Project Data',
      message: 'Are you sure you want to clear all project data? This will delete all your projects and conversation history but keep API key settings.',
      onConfirm: () => {
        try {
          // Remove project-related localStorage items
          const keysToRemove = ['ai-studio-projects', 'ai-studio-workspace'];
          keysToRemove.forEach(key => localStorage.removeItem(key));

          // Reset project-related states
          setSavedProjects([]);
          setCurrentProjectId(null);
          setFiles(INITIAL_FILES);
          setMessages([{ id: 'welcome', role: 'model', text: 'Hello! I\'m ready to help you build something amazing. What would you like to create?', timestamp: Date.now() }]);
          setCodeHistory({});
          setProjectName('');

          showToast('Project data cleared successfully');
          console.log('🗑️ Project data cleared from localStorage');
        } catch (e) {
          console.error(e);
          showToast("Error clearing project data", 'error');
        }
      }
    });
  };

  // Get current conversation versions for current project (sorted by timestamp)
  const getConversationVersions = () => {
    if (!currentProjectId) return [];

    const projectHistory = codeHistory[currentProjectId] || {};
    return Object.entries(projectHistory)
      .sort(([,a], [,b]) => b.timestamp - a.timestamp)
      .map(([messageId, version]) => ({
        messageId,
        ...version
      }));
  };

  // Load API key from localStorage on component mount
  useEffect(() => {
    const savedApiKey = localStorage.getItem('ai-studio-api-key');
    if (savedApiKey) {
      setApiKey(savedApiKey);
    }
  }, []);

  // Persist welcome screen state
  useEffect(() => {
    localStorage.setItem('ai-code-studio-welcome', showWelcome.toString());
  }, [showWelcome]);

  const handleSendMessage = async () => {
    if ((!chatInput.trim() && uploadedImages.length === 0) || isGenerating) return;
    const userText = chatInput.trim();
    const imagesToSend = [...uploadedImages];

    // Clear input and images immediately
    setChatInput('');
    setUploadedImages([]);

    // Create user message with text and image info
    let messageText = userText;
    if (imagesToSend.length > 0) {
      const imageInfo = imagesToSend.map(img => `[Image: ${img.name}]`).join(' ');
      messageText = userText ? `${userText} ${imageInfo}` : imageInfo;
    }

    const userMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      text: messageText,
      timestamp: Date.now(),
      images: imagesToSend // Store image data for display
    };
    const aiMsg: ChatMessage = { id: generateId(), role: 'model', text: '', timestamp: Date.now(), isStreaming: true };

          // Count only real user messages (not welcome message) to determine if this is the first real conversation
    const realUserMessages = messages.filter(m => m.role === 'user');
    const realAiMessages = messages.filter(m => m.role === 'model' && !m.isStreaming);

    // Don't save version for first real message (after welcome message)
    // If there are already real user messages, this is not the first one
    const isNotFirstRealMessage = realUserMessages.length > 0;

    setMessages(prev => [...prev, userMsg, aiMsg]);

    // Save current state BEFORE AI makes changes (for non-first messages)
    const filesBeforeAI = [...files];

    setIsGenerating(true);
    setShouldStopGeneration(false);

    // Create AbortController for this request
    const controller = new AbortController();
    setAbortController(controller);

    try {
      // Filter out the initial welcome message and system messages from AI history
      const relevantHistory = messagesRef.current
        .filter(m => m.role !== 'system' && m.id !== 'welcome')
        .map(m => ({ role: m.role, text: m.text }));
      const currentProjectName = savedProjects.find(p => p.id === currentProjectId)?.name || 'Project';
      const stream = await streamCodeChat(files, userText, relevantHistory, imagesToSend, controller.signal, apiKey, currentProjectName);
      let accumulated = '';

      // Store files that have been created to avoid duplicates
      const createdFiles = new Set<string>();

      for await (const chunk of stream) {
        // Check if generation should be stopped
        if (shouldStopGeneration || controller.signal.aborted) {
          break;
        }

        const text = chunk; // chunk is now a string from our custom API
        accumulated += text;

        setMessages(prev => prev.map(m => m.id === aiMsg.id ? { ...m, text: accumulated } : m));

        // --- Complete File Detection & Creation ---
        // Only detect complete files (with closing </file> tag)
        const completeFileRegex = /<file\s+name=["']([^"']+)["']>([\s\S]*?)<\/file>/g;
        const completeFileMatches = Array.from(accumulated.matchAll(completeFileRegex));

        if (completeFileMatches.length > 0) {
          // Process only new complete files
          const newFiles = completeFileMatches.filter(match => {
            const aiFilePath = match[1];
            return !createdFiles.has(aiFilePath);
          });

          if (newFiles.length > 0) {
            // Process each new complete file
            newFiles.forEach(match => {
              const aiFilePath = match[1];
              const fileContent = match[2];

              // Mark this file as created
              createdFiles.add(aiFilePath);

              // Convert AI file path to internal relative path
              const pathParts = aiFilePath.split('/');
              const relativePath = pathParts.length > 1 ? pathParts.slice(1).join('/') : aiFilePath;

              // Switch to the most recent file
              if (match === newFiles[newFiles.length - 1]) {
                requestAnimationFrame(() => {
                  setActiveFileName(prev => {
                     if (prev !== relativePath) {
                       // Make the file visible in tabs
                       setVisibleTabs(currentVisibleTabs => {
                         const newSet = new Set(currentVisibleTabs);
                         newSet.add(relativePath);
                         return newSet;
                       });
                       return relativePath;
                     }
                     return prev;
                  });
                });
              }

              // Create the file with complete content
              setFiles(currentFiles => {
                // Use the function to create file with folder structure
                const updatedFiles = createFileWithStructure(aiFilePath, fileContent, currentFiles);

                // Show file in tabs
                setVisibleTabs(prev => {
                  const newSet = new Set(prev);
                  newSet.add(relativePath);
                  return newSet;
                });

                return updatedFiles;
              });
            });
          }
        }
      }

      // --- Final file structure setup after generation completes ---
      // No need to rebuild structure since it's already created properly during streaming
      // Files and folders have been created in real-time with correct hierarchy
    } catch (e) {
      console.error(e);
      showToast("AI Error", 'error');
    } finally {
      setIsGenerating(false);
      setShouldStopGeneration(false);
      setAbortController(null);
      setMessages(prev => prev.map(m => m.id === aiMsg.id ? { ...m, isStreaming: false } : m));
      setPreviewKey(k => k + 1);

      // Save conversation version after AI completes (but not for first message)
      if (isNotFirstRealMessage) {
        console.log('💾 Saving version for conversation');
        saveConversationVersion(userMsg.id, filesBeforeAI, userText);
      } else {
        console.log('🚫 First real message - not saving version');
      }

      // Auto-save after AI generation completes
      if (currentProjectId) {
        setSavedProjects(prev => prev.map(p =>
          p.id === currentProjectId
            ? { ...p, files: [...files], chatHistory: [...messages.map(m => m.id === aiMsg.id ? { ...m, isStreaming: false } : m)], lastModified: Date.now(), codeHistory }
            : p
        ));
      }
    }
  };

  const activeFile = files.find(f => f.path === activeFileName) || files.find(f => f.type === 'file') || files[0];

  // --- Rendering Logic ---
  
  const renderMessageContent = (msg: ChatMessage) => {
    if (msg.role === 'user') {
      return (
        <div className="space-y-3">
          {/* Display uploaded images */}
          {msg.images && msg.images.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {msg.images.map((image) => (
                <img
                  key={image.id}
                  src={image.url}
                  alt={image.name}
                  className="w-24 h-24 object-cover rounded-lg border border-zinc-600"
                  title={image.name}
                />
              ))}
            </div>
          )}
          {/* Display text message */}
          {msg.text && <div className="whitespace-pre-wrap">{msg.text}</div>}
        </div>
      );
    }

    const parts = [];
    let lastIndex = 0;
    const regex = /<file\s+name=["']([^"']+)["']>(?:[\s\S]*?)(?:<\/file>|$)/g;
    let match;

    while ((match = regex.exec(msg.text)) !== null) {
      if (match.index > lastIndex) {
        const text = msg.text.substring(lastIndex, match.index).trim();
        if (text) parts.push(
          <div key={`t-${lastIndex}`} className="mb-3 text-zinc-300 prose prose-invert prose-sm max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code: ({node, inline, className, children, ...props}) => {
                  const match = /language-(\w+)/.exec(className || '')
                  return !inline && match ? (
                    <pre className="bg-[#0d1117] border border-zinc-700 rounded-lg p-3 overflow-x-auto select-text">
                      <code className={className} {...props}>
                        {children}
                      </code>
                    </pre>
                  ) : (
                    <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-sm font-mono select-text" {...props}>
                      {children}
                    </code>
                  )
                },
                p: ({children}) => <div className="mb-2">{children}</div>,
                ul: ({children}) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
                ol: ({children}) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
                li: ({children}) => <li className="text-zinc-300">{children}</li>,
                h1: ({children}) => <h1 className="text-lg font-bold text-white mb-2">{children}</h1>,
                h2: ({children}) => <h2 className="text-md font-semibold text-white mb-2">{children}</h2>,
                h3: ({children}) => <h3 className="text-sm font-medium text-white mb-1">{children}</h3>,
                a: ({children, href}) => <a href={href} className="text-blue-400 hover:text-blue-300 underline" target="_blank" rel="noopener noreferrer">{children}</a>,
                blockquote: ({children}) => <blockquote className="border-l-4 border-zinc-600 pl-4 italic text-zinc-400 my-2">{children}</blockquote>,
                table: ({children}) => <div className="overflow-x-auto mb-2"><table className="min-w-full border border-zinc-700">{children}</table></div>,
                th: ({children}) => <th className="border border-zinc-700 px-3 py-2 bg-zinc-800 text-left font-medium">{children}</th>,
                td: ({children}) => <td className="border border-zinc-700 px-3 py-2">{children}</td>,
              }}
            >
              {text}
            </ReactMarkdown>
          </div>
        );
      }
      
      const fileName = match[1];
      const isFinished = match[0].endsWith('</file>') || !msg.isStreaming;

      // Map AI file path to internal relative path for clicking
      const pathParts = fileName.split('/');
      const relativePath = pathParts.length > 1 ? pathParts.slice(1).join('/') : fileName;
      
      parts.push(
        <button 
          key={`f-${match.index}`}
          onClick={(e) => {
                    e.stopPropagation();

                    // Map the full path from AI response to our internal file path
                    const pathParts = fileName.split('/');
                    const relativePath = pathParts.length > 1 ? pathParts.slice(1).join('/') : fileName;

                    // Try to find the file and switch to it
                    let targetPath = relativePath;
                    let targetFile = files.find(f => f.path === relativePath);

                    // Fallback: try exact match
                    if (!targetFile) {
                      targetFile = files.find(f => f.path === fileName);
                      if (targetFile) targetPath = targetFile.path;
                    }

                    // Fallback: try matching by file name only
                    if (!targetFile) {
                      targetFile = files.find(f => f.name === pathParts[pathParts.length - 1]);
                      if (targetFile) targetPath = targetFile.path;
                    }

                    // If file exists or we're still generating, switch to it
                    if (targetFile || !isFinished) {
                      requestAnimationFrame(() => {
                        setActiveFileName(targetPath);
                        // Make the file visible in tabs
                        setVisibleTabs(prev => {
                          const newSet = new Set(prev);
                          newSet.add(targetPath);
                          return newSet;
                        });
                      });
                    } else {
                      console.log('File not found:', fileName, 'relativePath:', relativePath);
                    }
                  }}
          className={`w-full flex items-center gap-3 p-3 mb-3 bg-[#131316] border rounded-xl transition-all group text-left cursor-pointer ${isFinished ? 'border-zinc-800 hover:border-blue-500/30' : 'border-blue-500/50 bg-blue-500/5 hover:bg-blue-500/10'}`}
        >
          <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center border ${isFinished ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-blue-500/10 border-blue-500/20 text-blue-500'}`}>
            {isFinished ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><polyline points="20 6 9 17 4 12"/></svg>
            ) : (
              <LoaderIcon />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className={`text-sm font-medium truncate ${getFileColorClass(relativePath)}`}>{relativePath}</div>
            <div className="text-[11px] text-zinc-500">
              {isFinished ? '✓ Completed' : '⚡ Generating...'}
            </div>
          </div>
        </button>
      );
      
      lastIndex = match.index + match[0].length;
    }
    
    if (lastIndex < msg.text.length) {
      const text = msg.text.substring(lastIndex).trim();
      if (text) parts.push(
        <div key="t-end" className="mt-2 text-zinc-300 prose prose-invert prose-sm max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code: ({node, inline, className, children, ...props}) => {
                const match = /language-(\w+)/.exec(className || '')
                return !inline && match ? (
                  <pre className="bg-[#0d1117] border border-zinc-700 rounded-lg p-3 overflow-x-auto">
                    <code className={className} {...props}>
                      {children}
                    </code>
                  </pre>
                ) : (
                  <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
                    {children}
                  </code>
                )
              },
              p: ({children}) => <div className="mb-2">{children}</div>,
              ul: ({children}) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
              ol: ({children}) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
              li: ({children}) => <li className="text-zinc-300">{children}</li>,
              h1: ({children}) => <h1 className="text-lg font-bold text-white mb-2">{children}</h1>,
              h2: ({children}) => <h2 className="text-md font-semibold text-white mb-2">{children}</h2>,
              h3: ({children}) => <h3 className="text-sm font-medium text-white mb-1">{children}</h3>,
              a: ({children, href}) => <a href={href} className="text-blue-400 hover:text-blue-300 underline" target="_blank" rel="noopener noreferrer">{children}</a>,
              blockquote: ({children}) => <blockquote className="border-l-4 border-zinc-600 pl-4 italic text-zinc-400 my-2">{children}</blockquote>,
              table: ({children}) => <div className="overflow-x-auto mb-2"><table className="min-w-full border border-zinc-700">{children}</table></div>,
              th: ({children}) => <th className="border border-zinc-700 px-3 py-2 bg-zinc-800 text-left font-medium">{children}</th>,
              td: ({children}) => <td className="border border-zinc-700 px-3 py-2">{children}</td>,
            }}
          >
            {text}
          </ReactMarkdown>
        </div>
      );
    }

    if (parts.length === 0) {
      return (
        <div className="text-zinc-300 prose prose-invert prose-sm max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code: ({node, inline, className, children, ...props}) => {
                const match = /language-(\w+)/.exec(className || '')
                return !inline && match ? (
                  <pre className="bg-[#0d1117] border border-zinc-700 rounded-lg p-3 overflow-x-auto">
                    <code className={className} {...props}>
                      {children}
                    </code>
                  </pre>
                ) : (
                  <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
                    {children}
                  </code>
                )
              },
              p: ({children}) => <div className="mb-2">{children}</div>,
              ul: ({children}) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
              ol: ({children}) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
              li: ({children}) => <li className="text-zinc-300">{children}</li>,
              h1: ({children}) => <h1 className="text-lg font-bold text-white mb-2">{children}</h1>,
              h2: ({children}) => <h2 className="text-md font-semibold text-white mb-2">{children}</h2>,
              h3: ({children}) => <h3 className="text-sm font-medium text-white mb-1">{children}</h3>,
              a: ({children, href}) => <a href={href} className="text-blue-400 hover:text-blue-300 underline" target="_blank" rel="noopener noreferrer">{children}</a>,
              blockquote: ({children}) => <blockquote className="border-l-4 border-zinc-600 pl-4 italic text-zinc-400 my-2">{children}</blockquote>,
              table: ({children}) => <div className="overflow-x-auto mb-2"><table className="min-w-full border border-zinc-700">{children}</table></div>,
              th: ({children}) => <th className="border border-zinc-700 px-3 py-2 bg-zinc-800 text-left font-medium">{children}</th>,
              td: ({children}) => <td className="border border-zinc-700 px-3 py-2">{children}</td>,
            }}
          >
            {msg.text}
          </ReactMarkdown>
        </div>
      );
    }

    return <div className="w-full">{parts}</div>;
  };

  const SidebarItem = ({ icon: Icon, label, sub, active, onClick, onDelete, onRename, showActions = true, colorClass, style }: any) => (
    <div onClick={onClick} style={style} className={`group flex items-center justify-between px-3 py-2 rounded-md cursor-pointer text-xs mb-1 transition-all ${active ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 border border-transparent'}`}>
      <div className="flex items-center gap-2 overflow-hidden">
        <Icon className={`w-4 h-4 flex-shrink-0 opacity-80 ${colorClass || ''}`} />
        <div className="min-w-0">
          <div className={`font-medium truncate ${!active ? 'text-zinc-400' : ''}`}>{label}</div>
          {sub && <div className="text-[10px] opacity-60 truncate">{sub}</div>}
        </div>
      </div>
      {showActions && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
          {onRename && (
            <button onClick={onRename} className="p-1 hover:bg-blue-500/20 hover:text-blue-400 rounded transition-all" title="Rename">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
          )}
          {onDelete && (
            <button onClick={onDelete} className="p-1 hover:bg-red-500/20 hover:text-red-400 rounded transition-all" title="Delete">
              <TrashIcon />
            </button>
          )}
        </div>
      )}
    </div>
  );

  // Welcome screen
  if (showWelcome) {
    return (
      <div className="h-screen w-screen bg-[#050505] text-[#e0e0e0] font-mono flex flex-col items-center justify-center relative overflow-hidden">
        {/* Background Grid Animation - Similar to preview */}
        <div className="absolute inset-0 w-[200%] h-[200%] opacity-30 z-[-2]"
             style={{
               backgroundImage: 'linear-gradient(rgba(0, 243, 255, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 243, 255, 0.1) 1px, transparent 1px)',
               backgroundSize: '50px 50px',
               transform: 'rotateX(60deg) translateY(-100px) translateZ(-200px)',
               animation: 'grid-move 20s linear infinite'
             }}>
        </div>

        {/* Canvas for particles (from preview) */}
        <canvas id="particles" className="absolute inset-0 z-[-1]" />

        {/* Cyberpunk Decorative Elements */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Top left corner decoration */}
          <div className="absolute top-20 left-20 text-[#00f3ff]/30">
            <div className="text-8xl font-black transform -rotate-12">◈</div>
            <div className="text-6xl font-black mt-2 ml-8">◊</div>
          </div>

          {/* Top right corner decoration */}
          <div className="absolute top-20 right-20 text-[#bc13fe]/30">
            <div className="text-8xl font-black transform rotate-12">◈</div>
            <div className="text-6xl font-black mt-2 mr-8">◊</div>
          </div>

          {/* Bottom left corner decoration */}
          <div className="absolute bottom-20 left-20 text-[#bc13fe]/30">
            <div className="text-6xl font-black transform rotate-45">◈</div>
            <div className="text-8xl font-black mt-2 -rotate-12">◊</div>
          </div>

          {/* Bottom right corner decoration */}
          <div className="absolute bottom-20 right-20 text-[#00f3ff]/30">
            <div className="text-6xl font-black transform -rotate-45">◈</div>
            <div className="text-8xl font-black mt-2 rotate-12">◊</div>
          </div>

          {/* Corner tech labels */}
          <div className="absolute top-5 left-5 text-sm font-mono text-[#00f3ff]/60 font-bold tracking-widest">
            NEURAL_LINK
          </div>
          <div className="absolute top-5 right-5 text-sm font-mono text-[#bc13fe]/60 font-bold tracking-widest">
            CYBER_NEXUS
          </div>
          <div className="absolute bottom-5 left-5 text-sm font-mono text-[#bc13fe]/60 font-bold tracking-widest">
            QUANTUM_CORE
          </div>
          <div className="absolute bottom-5 right-5 text-sm font-mono text-[#00f3ff]/60 font-bold tracking-widest">
            DATA_STREAM
          </div>

          {/* Left side vertical tech text */}
          <div className="absolute top-1/2 left-2 transform -translate-y-1/2 -translate-x-1/2">
            <div className="text-xs font-mono text-[#00f3ff]/50 tracking-widest transform -rotate-90 origin-center whitespace-nowrap">
              // SYSTEM_ONLINE // FIREWALL_ACTIVE
            </div>
          </div>

          {/* Right side vertical tech text */}
          <div className="absolute top-1/2 right-2 transform -translate-y-1/2 translate-x-1/2">
            <div className="text-xs font-mono text-[#bc13fe]/50 tracking-widest transform rotate-90 origin-center whitespace-nowrap">
              // MATRIX_ACTIVE // ENCRYPTION_ON
            </div>
          </div>

          {/* Top center tech code */}
          <div className="absolute top-2 left-1/2 transform -translate-x-1/2">
            <div className="text-sm font-mono text-[#00f3ff]/50 font-bold tracking-wider">
              &lt;/&gt; CODE_STUDIO v2.0 // INITIALIZING...
            </div>
          </div>

          {/* Bottom center tech code */}
          <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2">
            <div className="text-sm font-mono text-[#bc13fe]/50 font-bold tracking-wider">
              &gt;_ AI_READY // AWAITING_COMMANDS...
            </div>
          </div>

          {/* Binary code sections */}
          <div className="absolute top-16 left-1/4 text-xs font-mono text-[#00f3ff]/40 opacity-80 animate-pulse" style={{ animationDelay: '0.5s' }}>
            01101000 01100101 01101100 01101100 01101111
          </div>
          <div className="absolute top-16 right-1/4 text-xs font-mono text-[#bc13fe]/40 opacity-80 animate-pulse" style={{ animationDelay: '1.5s' }}>
            01010111 01001111 01010010 01001100 01000100
          </div>

          {/* System status indicators - repositioned */}
          <div className="absolute top-28 left-16 text-xs font-mono text-[#00f3ff]/50">
            ▸ PROTOCOL: HTTPS
          </div>
          <div className="absolute top-28 right-16 text-xs font-mono text-[#bc13fe]/50">
            ▸ ENCRYPTION: AES256
          </div>
          <div className="absolute bottom-28 left-16 text-xs font-mono text-[#bc13fe]/50">
            ▸ CACHE: OPTIMIZED
          </div>
          <div className="absolute bottom-28 right-16 text-xs font-mono text-[#00f3ff]/50">
            ▸ RESPONSE: REALTIME
          </div>

          {/* Additional scattered tech elements */}
          <div className="absolute top-40 left-32 text-xs font-mono text-[#00f3ff]/35 opacity-70">
            [AI_CORE: ONLINE]
          </div>
          <div className="absolute top-40 right-32 text-xs font-mono text-[#bc13fe]/35 opacity-70">
            [MEMORY: 32GB]
          </div>
          <div className="absolute bottom-40 left-32 text-xs font-mono text-[#bc13fe]/35 opacity-70">
            [GPU: ACCELERATED]
          </div>
          <div className="absolute bottom-40 right-32 text-xs font-mono text-[#00f3ff]/35 opacity-70">
            [NETWORK: 5G_READY]
          </div>

          {/* Floating geometric shapes */}
          <div className="absolute top-1/4 left-1/4 text-[#00f3ff]/10 animate-pulse">
            <div className="text-9xl font-black transform rotate-45">◢</div>
          </div>
          <div className="absolute top-1/4 right-1/4 text-[#bc13fe]/10 animate-pulse" style={{ animationDelay: '1s' }}>
            <div className="text-9xl font-black transform -rotate-45">◣</div>
          </div>
          <div className="absolute bottom-1/4 left-1/4 text-[#bc13fe]/10 animate-pulse" style={{ animationDelay: '2s' }}>
            <div className="text-9xl font-black transform rotate-45">◤</div>
          </div>
          <div className="absolute bottom-1/4 right-1/4 text-[#00f3ff]/10 animate-pulse" style={{ animationDelay: '3s' }}>
            <div className="text-9xl font-black transform -rotate-45">◥</div>
          </div>
        </div>

        {/* Main content container with 3D effect */}
        <div className="relative z-10 flex flex-col items-center">
          {/* Glowing container with borders */}
          <div className="relative group mb-8">
            {/* Animated corner decorations */}
            <div className="absolute -inset-1 bg-gradient-to-r from-[#00f3ff] to-[#bc13fe] rounded-lg opacity-20 blur-sm group-hover:opacity-30 transition-opacity" />

            {/* Main content box */}
            <div className="relative bg-[#0a0a0a] border border-[#00f3ff]/30 rounded-lg p-8 backdrop-blur-sm shadow-2xl">
              {/* Logo/Title */}
              <div className="glitch-wrapper text-center mb-6">
                <h1
                  className="relative text-4xl font-black uppercase tracking-[5px] text-[#00f3ff]"
                  style={{
                    textShadow: '2px 2px #bc13fe',
                    fontSize: '5.5rem',
                    fontWeight: 900
                  }}
                  data-text="JC CODE STUDIO"
                >
                  JC CODE STUDIO
                </h1>
                <p className="text-[#e0e0e0]/70 text-xl tracking-wider mt-3" style={{ fontSize: '1.5rem' }}>
                  INNOVATION // DESIGN // FUTURE_TECH
                </p>
              </div>

              {/* Main interaction area */}
              <div className="relative max-w-xl mx-auto">
                {/* Chat-style input area with image preview */}
                <div className="relative bg-[#0a0a0a]/80 border border-[#00f3ff]/20 rounded-lg mb-4">
                  {/* Image preview area */}
                  {uploadedImages.length > 0 && (
                    <div className="border-b border-[#00f3ff]/20 p-3">
                      <div className="flex flex-wrap gap-2">
                        {uploadedImages.map((img) => (
                          <div key={img.id} className="relative group">
                            <img
                              src={img.url}
                              alt={img.name}
                              className="w-16 h-16 object-cover rounded border border-[#00f3ff]/40"
                              title={img.name}
                            />
                            <button
                              onClick={() => removeUploadedImage(img.id)}
                              className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 hover:bg-red-600 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                              title="Delete Image"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        {/* Add more images hint */}
                        <div className="w-16 h-16 border-2 border-dashed border-[#00f3ff]/30 rounded flex items-center justify-center">
                          <span className="text-[#00f3ff]/40 text-xs">+</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Input area */}
                  <div className="flex items-end gap-2 p-3">
                    <textarea
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleWelcomeSubmit())}
                      onPaste={handlePasteImage}
                      placeholder={uploadedImages.length > 0 ? "Continue describing your ideas..." : "Describe your web application idea... (Image paste supported)"}
                      className="flex-1 px-3 py-2 bg-transparent text-[#e0e0e0] placeholder-[#00f3ff]/30 resize-none outline-none text-lg font-mono min-h-[60px] max-h-[150px]"
                      rows={1}
                      style={{ fieldSizing: 'content' }}
                    />

                    {/* Upload button */}
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="p-2 text-[#00f3ff]/60 hover:text-[#00f3ff] border border-[#00f3ff]/30 hover:border-[#00f3ff] rounded transition-all"
                      title="Upload Image"
                    >
                      <ImageIcon className="w-5 h-5" />
                    </button>

                    {/* Send/Stop button */}
                    <button
                      onClick={isGenerating ? handleStopGeneration : handleWelcomeSubmit}
                      disabled={!isGenerating && (!chatInput.trim() && uploadedImages.length === 0)}
                      className={`px-4 py-2 font-bold text-sm rounded transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none ${
                        isGenerating
                          ? 'bg-gradient-to-r from-red-500 to-red-600 text-white hover:from-red-600 hover:to-red-700'
                          : 'bg-gradient-to-r from-[#00f3ff] to-[#bc13fe] text-[#050505] hover:from-[#00e6ee] hover:to-[#b412e8]'
                      }`}
                    >
                      {isGenerating ? 'STOP' : 'SEND'}
                    </button>

                    {/* Upload input */}
                    <input
                      type="file"
                      ref={fileInputRef}
                      multiple
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </div>
                </div>

                {/* Divider with cyberpunk style */}
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex-1 h-0.5 bg-gradient-to-r from-transparent via-[#00f3ff]/50 to-transparent"></div>
                  <span className="text-[#00f3ff]/60 text-sm tracking-wider font-mono">OR</span>
                  <div className="flex-1 h-0.5 bg-gradient-to-r from-transparent via-[#bc13fe]/50 to-transparent"></div>
                </div>

                {/* Direct Enter Button */}
                <div className="text-center">
                  <button
                    onClick={handleDirectEnter}
                    className="group relative px-10 py-4 bg-transparent border-2 border-[#bc13fe]/50 text-[#bc13fe] font-mono font-bold tracking-wider text-lg rounded hover:bg-[#bc13fe]/10 hover:border-[#bc13fe] hover:text-white transition-all duration-300 transform hover:scale-105"
                  >
                    <span className="relative z-10">ENTER WORKSPACE</span>
                    {/* Animated background effect */}
                    <div className="absolute inset-0 bg-gradient-to-r from-[#bc13fe] to-[#00f3ff] opacity-0 group-hover:opacity-20 transition-opacity duration-300 rounded"></div>
                    {/* Corner brackets */}
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs opacity-0 group-hover:opacity-100 transition-opacity">[</span>
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs opacity-0 group-hover:opacity-100 transition-opacity">]</span>
                  </button>
                  <p className="text-[#00f3ff]/40 text-xs mt-3 tracking-wider">
                    Continue with existing workspace
                  </p>
                </div>
              </div>
            </div>

            {/* Corner decorations */}
            <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-[#00f3ff] rounded-tl-lg" />
            <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-[#00f3ff] rounded-tr-lg" />
            <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-[#00f3ff] rounded-bl-lg" />
            <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-[#00f3ff] rounded-br-lg" />
          </div>

          {/* Features hint */}
          <div className="text-center">
            <p className="text-[#00f3ff]/60 text-sm tracking-wider font-mono">
              ✨ SUPPORTS TEXT & IMAGE INPUT • 🎨 REAL-TIME CODE GENERATION • 🚀 ONE-CLICK DEPLOYMENT
            </p>
          </div>
        </div>

        {/* CSS for animations */}
        <style>{`
          @keyframes grid-move {
            0% { transform: rotateX(60deg) translateY(0) translateZ(-200px); }
            100% { transform: rotateX(60deg) translateY(50px) translateZ(-200px); }
          }

          @keyframes glitch-anim-1 {
            0% { clip: rect(30px, 9999px, 10px, 0); }
            5% { clip: rect(80px, 9999px, 90px, 0); }
            10% { clip: rect(10px, 9999px, 40px, 0); }
            15% { clip: rect(50px, 9999px, 20px, 0); }
            20% { clip: rect(20px, 9999px, 60px, 0); }
            100% { clip: rect(70px, 9999px, 30px, 0); }
          }

          @keyframes glitch-anim-2 {
            0% { clip: rect(10px, 9999px, 80px, 0); }
            5% { clip: rect(40px, 9999px, 10px, 0); }
            10% { clip: rect(90px, 9999px, 50px, 0); }
            15% { clip: rect(20px, 9999px, 70px, 0); }
            20% { clip: rect(60px, 9999px, 20px, 0); }
            100% { clip: rect(30px, 9999px, 90px, 0); }
          }

          .glitch-wrapper h1::before,
          .glitch-wrapper h1::after {
            content: attr(data-text);
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
          }

          .glitch-wrapper h1::before {
            left: 2px;
            text-shadow: -1px 0 #ff00c1;
            clip: rect(44px, 450px, 56px, 0);
            animation: glitch-anim-1 5s infinite linear alternate-reverse;
          }

          .glitch-wrapper h1::after {
            left: -2px;
            text-shadow: -1px 0 #00fff9;
            clip: rect(44px, 450px, 56px, 0);
            animation: glitch-anim-2 5s infinite linear alternate-reverse;
          }

          .writing-mode-vertical {
            writing-mode: vertical-rl;
            text-orientation: upright;
          }
        `}</style>
      </div>
    );
  }

  // Main work interface
  return (
    <div className={`flex h-screen w-screen bg-[#09090b] text-zinc-200 font-sans overflow-hidden transition-all duration-700 ${!showWelcome ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-full'}`}>
      
      {/* --- GLOBAL DRAG OVERLAY --- 
          This invisible layer covers everything (including iframes) when dragging,
          preventing mouse event loss and stuck splitters.
      */}
      {(isResizingSidebar || isResizingSplit) && (
        <div 
          className="fixed inset-0 z-[9999] bg-transparent" 
          style={{ cursor: isResizingSplit ? 'col-resize' : 'col-resize' }} 
        />
      )}

      {/* Notification Toast */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg text-sm font-medium shadow-2xl border animate-in fade-in slide-in-from-top-2 flex items-center gap-2 ${notification.type === 'success' ? 'bg-zinc-900 border-emerald-900/50 text-emerald-400' : 'bg-zinc-900 border-red-900/50 text-red-400'}`}>
           <div className={`w-2 h-2 rounded-full ${notification.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`} />
           {notification.text}
        </div>
      )}

      {/* SIDEBAR */}
      <div style={{ width: sidebarWidth }} className="flex flex-col flex-shrink-0 bg-[#0c0c0e] border-r border-zinc-800 relative group/sidebar">
        <div className="flex flex-col">
          <div className="flex items-center border-b border-zinc-800 bg-[#09090b]">
            {/* Home button - smaller, before chat */}
            <button
              onClick={handleBackToWelcome}
              className="py-3 px-2 flex items-center text-zinc-500 hover:text-zinc-300 transition-all relative border-r border-zinc-700"
              title="Go to Homepage"
            >
              <LayoutIcon className="w-4 h-4" />
            </button>

            {['chat', 'files', 'projects'].map(v => (
              <button key={v} onClick={() => setSidebarView(v as any)} className={`flex-1 py-3 flex justify-center text-zinc-500 hover:text-zinc-300 transition-all relative ${sidebarView === v ? 'text-blue-400' : ''}`}>
                {v === 'chat' && <ChatIcon />}
                {v === 'files' && <CodeIcon />}
                {v === 'projects' && <FolderIcon />}
                {sidebarView === v && <div className="absolute bottom-0 w-full h-0.5 bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]"></div>}
              </button>
            ))}
          </div>

        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
          {sidebarView === 'chat' && (
            <>
              {/* Chat Header with Clear History Button */}
              <div className="flex items-center justify-between px-1 py-2 border-b border-zinc-800 mb-4">
                <div className="flex items-center gap-2">
                  <ChatIcon />
                  <span className="text-sm font-medium text-zinc-300">Chat History</span>
                  <span className="text-xs text-zinc-500">({messages.length} messages)</span>
                </div>
                <button
                  onClick={handleClearChatHistory}
                  className="flex items-center gap-1.5 px-2 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-red-400 rounded-md transition-colors"
                  title="Clear Chat History"
                >
                  <TrashIcon />
                  <span>Clear</span>
                </button>
              </div>

              {/* Messages */}
              <div className="space-y-6 pb-4 px-1">
              {messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[95%] rounded-2xl px-4 py-3 text-sm shadow-sm select-text ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-zinc-800/40 text-zinc-300 border border-zinc-700/30 w-full rounded-bl-sm'}`}>
                    {renderMessageContent(msg)}
                  </div>
                </div>
              ))}
              {isGenerating && (
                <div className="flex justify-start pl-2">
                   <div className="flex gap-1">
                     <div className="w-2 h-2 bg-zinc-600 rounded-full animate-bounce" style={{animationDelay: '0ms'}} />
                     <div className="w-2 h-2 bg-zinc-600 rounded-full animate-bounce" style={{animationDelay: '150ms'}} />
                     <div className="w-2 h-2 bg-zinc-600 rounded-full animate-bounce" style={{animationDelay: '300ms'}} />
                   </div>
                </div>
              )}
              <div ref={chatEndRef} />
              </div>
            </>
          )}

          {sidebarView === 'files' && (
            <div className="mt-2">
               <div className="text-[10px] font-bold text-zinc-500 uppercase px-2 mb-2 flex justify-between items-center">
                  <span>Project Files ({files.length})</span>
                  <button onClick={() => {
                     const name = prompt("File path (e.g. src/components/Button.jsx):");
                     if(name) {
                        const now = Date.now();
                        const newFile: ProjectFile = {
                           id: generateId(),
                           name: name.split('/').pop() || name,
                           path: name,
                           language: getLanguageFromFilename(name),
                           content: '',
                           type: 'file',
                           createdAt: now,
                           modifiedAt: now
                        };
                        setFiles(prev => [...prev, newFile]);
                        requestAnimationFrame(() => {
                          setActiveFileName(name);
                          // Show the new file in tabs
                          setVisibleTabs(prev => {
                            const newSet = new Set(prev);
                            newSet.add(name);
                            return newSet;
                          });
                        });
                     }
                  }} className="hover:text-white hover:bg-zinc-800 rounded px-1.5 py-0.5 transition-colors">+</button>
               </div>
               {/* Render file tree */}
               {(() => {
                 const fileTree = buildFileTree(files);

                 const renderTreeNode = (node: ProjectFile, level: number = 0) => {
                   if (node.type === 'folder') {
                     const isExpanded = expandedFolders.has(node.id);
                     const children = fileTree[node.id] || [];

                     return (
                       <div key={node.id}>
                         <div
                           className="flex items-center gap-1 px-2 py-1 hover:bg-zinc-800 rounded cursor-pointer transition-colors"
                           style={{ paddingLeft: `${level * 12 + 8}px` }}
                           onClick={() => {
                             setExpandedFolders(prev => {
                               const newSet = new Set(prev);
                               if (newSet.has(node.id)) {
                                 newSet.delete(node.id);
                               } else {
                                 newSet.add(node.id);
                               }
                               return newSet;
                             });
                           }}
                         >
                           <span className="text-yellow-400 text-sm transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                             ▶
                           </span>
                           <span className="text-yellow-400">📁</span>
                           <span className="text-zinc-300 text-sm">{node.name}</span>
                           <span className="text-zinc-500 text-xs ml-auto">
                             {children.length > 0 && `(${children.length})`}
                           </span>
                         </div>
                         {isExpanded && children.map(child => renderTreeNode(child, level + 1))}
                       </div>
                     );
                   } else {
                     return (
                       <SidebarItem
                          key={node.id}
                          icon={CodeIcon}
                          label={node.name}
                          colorClass={getFileColorClass(node.name)}
                          active={activeFileName === node.path}
                          onClick={() => {
                            if (node.type === 'file') {
                              // Use requestAnimationFrame to ensure state updates are smooth
                              requestAnimationFrame(() => {
                                setActiveFileName(node.path);
                                // Show the tab if it was hidden
                                setVisibleTabs(prev => {
                                  const newSet = new Set(prev);
                                  newSet.add(node.path);
                                  return newSet;
                                });
                              });
                            }
                          }}
                          onDelete={(e: any) => handleDeleteFile(e, node.path)}
                          style={{ paddingLeft: `${level * 12 + 24}px` }}
                       />
                     );
                   }
                 };

                 return fileTree.root.map(node => renderTreeNode(node));
               })()}
            </div>
          )}

          {sidebarView === 'projects' && (
            <div className="mt-2">
              <div className="w-full mb-4 px-2">
                {currentProjectId ? (
                  <div className="bg-emerald-600/10 border border-emerald-600/30 rounded-lg py-2 text-xs text-center">
                    <div className="text-emerald-400 font-medium flex items-center justify-center gap-2">
                      <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                      Auto-saving "{savedProjects.find(p => p.id === currentProjectId)?.name}"
                    </div>
                    <div className="text-[10px] text-emerald-300/70 mt-1">All changes saved automatically</div>
                  </div>
                ) : (
                  <button onClick={handleSaveProject} className="w-full bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-600/30 rounded-lg py-2 text-xs font-medium transition-all flex items-center justify-center gap-2">
                    <SaveIcon /> Save Workspace
                  </button>
                )}
              </div>
              <div className="text-[10px] font-bold text-zinc-500 uppercase px-2 mb-2">History</div>
              {savedProjects.length === 0 && <div className="text-zinc-600 text-xs text-center py-4">No projects saved yet.</div>}
              {savedProjects.map(p => (
                <SidebarItem
                  key={p.id}
                  icon={FolderIcon}
                  label={p.name}
                  sub={
                    <div className="flex items-center gap-2">
                      <span>{new Date(p.lastModified).toLocaleDateString()}</span>
                      {p.id === currentProjectId && (
                        <div className="flex items-center gap-1 text-emerald-400">
                          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
                          <span className="text-[9px]">Auto</span>
                        </div>
                      )}
                    </div>
                  }
                  active={currentProjectId === p.id}
                  onClick={() => handleLoadProject(p)}
                  onRename={(e: any) => handleRenameProject(e, p.id)}
                  onDelete={(e: any) => handleDeleteProject(e, p.id)}
                />
              ))}
            </div>
          )}
        </div>

        {sidebarView === 'chat' && (
          <div className="p-4 border-t border-zinc-800 bg-[#0c0c0e]">
            {/* Image Preview Area */}
            {uploadedImages.length > 0 && (
              <div className="mb-3 p-3 bg-[#131316] rounded-lg border border-zinc-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-zinc-400 font-medium">Images ({uploadedImages.length})</span>
                  <button
                    onClick={clearAllImages}
                    className="text-xs text-red-400 hover:text-red-300 transition-colors"
                  >
                    Clear All
                  </button>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {uploadedImages.map((image) => (
                    <div key={image.id} className="relative group">
                      <img
                        src={image.url}
                        alt={image.name}
                        className="w-16 h-16 object-cover rounded-lg border border-zinc-700"
                      />
                      <button
                        onClick={() => removeUploadedImage(image.id)}
                        className="absolute -top-1 -right-1 bg-red-500 hover:bg-red-600 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <XIcon />
                      </button>
                      <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[9px] px-1 py-0.5 rounded-b-lg truncate">
                        {image.name}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="relative">
              {/* Image Upload Button */}
              <input
                type="file"
                id="image-upload"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                className="hidden"
              />
              <button
                onClick={() => document.getElementById('image-upload')?.click()}
                disabled={isGenerating}
                className="absolute bottom-3 left-3 p-1.5 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 disabled:hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
                title="Upload Image (or paste with Ctrl+V)"
              >
                <ImageIcon />
              </button>

              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSendMessage())}
                onPaste={handlePaste}
                placeholder="Describe a component or feature, paste an image, or upload a file..."
                className="w-full bg-[#131316] border border-zinc-800 rounded-xl py-3 pl-14 pr-10 text-sm focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 resize-none h-20 text-zinc-200 placeholder:text-zinc-600 transition-all"
              />
              <button
                onClick={isGenerating ? handleStopGeneration : handleSendMessage}
                disabled={!isGenerating && (!chatInput.trim() && uploadedImages.length === 0)}
                className={`absolute bottom-3 right-3 p-1.5 text-white rounded-lg transition-all transform hover:scale-105 shadow-lg ${
                  isGenerating
                    ? 'bg-red-600 hover:bg-red-500 shadow-red-900/20'
                    : 'bg-blue-600 hover:bg-blue-500 shadow-blue-900/20'
                } disabled:opacity-50 disabled:hover:scale-100 disabled:transform-none`}
              >
                {isGenerating ? (
                  <div className="relative">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">✕</span>
                  </div>
                ) : <SendIcon />}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* SIDEBAR RESIZER */}
      <div 
        onMouseDown={() => setIsResizingSidebar(true)} 
        className="w-1 bg-zinc-800 hover:bg-blue-500 cursor-col-resize transition-colors z-20 relative"
      >
         <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-0.5 bg-zinc-600 rounded-full opacity-0 group-hover/sidebar:opacity-100 transition-opacity"></div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#18181b]">
        {/* Toolbar */}
        <div className="h-11 border-b border-zinc-800 flex items-center justify-between px-2 bg-[#09090b] flex-shrink-0">
          <div className="flex items-center overflow-x-auto no-scrollbar gap-1 flex-1 mr-4 h-full pt-1" ref={tabsContainerRef}>
            {(() => {
                const visibleFiles = files.filter(f => f.type === 'file' && visibleTabs.has(f.path));
                console.log('Debug - Files:', files.length, 'Visible tabs:', visibleTabs.size, 'Filtered files:', visibleFiles.length);
                return visibleFiles.map(f => (
              <div
                key={f.id}
                onClick={() => {
                  requestAnimationFrame(() => {
                    setActiveFileName(f.path);
                  });
                }}
                className={`group relative flex items-center gap-2 px-3 py-1.5 rounded-t-md text-xs cursor-pointer border-t border-x min-w-[100px] max-w-[180px] transition-all ${activeFileName === f.path ? 'bg-[#1e1e2e] text-zinc-200 border-zinc-700 border-b-[#1e1e2e] z-10' : 'bg-transparent text-zinc-500 border-transparent hover:bg-zinc-800/50 border-b-zinc-800'}`}
                style={{marginBottom: '-1px'}}
              >
                <span className={`font-mono font-bold text-[10px] ${getFileColorClass(f.name)}`}>
                   {f.language === 'html' && '</>'}
                   {f.language === 'css' && '{}'}
                   {f.language === 'javascript' && 'JS'}
                   {f.language === 'typescript' && 'TS'}
                   {f.language === 'json' && '{}'}
                   {f.language === 'other' && '📄'}
                </span>
                <span className="truncate font-medium">{f.name}</span>
                <span onClick={(e) => {
                  e.stopPropagation();
                  // Hide the tab from visible tabs
                  setVisibleTabs(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(f.path);

                    // Switch to another visible tab if this was the active one
                    if (activeFileName === f.path) {
                      const visibleFiles = files.filter(file => file.type === 'file' && file.path !== f.path);
                      if (visibleFiles.length > 0) {
                        const nextVisibleFile = visibleFiles.find(file => newSet.has(file.path)) || visibleFiles[0];
                        requestAnimationFrame(() => {
                          setActiveFileName(nextVisibleFile.path);
                        });
                        newSet.add(nextVisibleFile.path);
                      }
                    }

                    return newSet;
                  });
                }} className="ml-auto p-0.5 rounded hover:bg-red-500/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity" title="Hide Tab">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </span>
                {activeFileName === f.path && <div className="absolute top-0 left-0 w-full h-0.5 bg-blue-500 rounded-t-full"></div>}
              </div>
            ));
              })()}
          </div>
          <div className="flex items-center gap-1 pb-1">
             <div className="flex items-center gap-2 px-3 py-1 bg-[#131316] rounded-md border border-zinc-700">
               <span className="text-xs font-medium text-zinc-400">Project:</span>
               <span className="text-xs font-bold text-blue-400">{projectName}</span>
             </div>
             <button onClick={downloadProject} className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-500 hover:text-white transition-colors" title="Download Project">
               <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                 <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                 <polyline points="7,10 12,15 17,10"/>
                 <line x1="12" y1="15" x2="12" y2="3"/>
               </svg>
             </button>
             <input
               type="file"
               id="folder-import"
               multiple
               webkitdirectory=""
               directory=""
               onChange={handleFolderImport}
               className="hidden"
             />
             <button
               onClick={() => document.getElementById('folder-import')?.click()}
               className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-500 hover:text-white transition-colors"
               title="Import Folder"
             >
               <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                 <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z"/>
                 <polyline points="16,14 12,18 8,14"/>
                 <line x1="12" y1="10" x2="12" y2="18"/>
               </svg>
             </button>
             <button onClick={handleNewProject} className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-500 hover:text-white transition-colors" title="New Project"><PlusIcon/></button>
             <button onClick={() => setPreviewKey(k => k + 1)} className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-500 hover:text-white transition-colors" title="Reload Preview"><RotateCwIcon/></button>
             <button onClick={() => setShowSettings(!showSettings)} className={`p-1.5 hover:bg-zinc-800 rounded-md transition-colors ${showSettings ? 'text-blue-400' : 'text-zinc-500'} hover:text-white`} title="Settings">
               <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                 <circle cx="12" cy="12" r="3"/>
                 <path d="M12 1v6m0 6v6m11-7h-6m-6 0H1"/>
               </svg>
             </button>
             {showPreview && (
               <button
                 onClick={handleFullscreenPreview}
                 className={`p-1.5 hover:bg-zinc-800 rounded-md transition-colors ${isFullscreen ? 'text-blue-400' : 'text-zinc-500'} hover:text-white`}
                 title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Preview"}
               >
                 {isFullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
               </button>
             )}
             <div className="w-px h-4 bg-zinc-800 mx-1"></div>
             <button onClick={() => setShowPreview(!showPreview)} className={`p-1.5 px-2 rounded-md text-xs font-medium border flex items-center gap-2 transition-colors ${showPreview ? 'bg-blue-900/20 text-blue-400 border-blue-800/30' : 'text-zinc-500 border-transparent hover:bg-zinc-800'}`}>
                <LayoutIcon />
                <span className="hidden sm:inline">Preview</span>
             </button>
          </div>
        </div>

        {/* Workspace Area */}
        {isFullscreen ? (
          // Fullscreen Preview Mode
          <div className="flex-1 flex overflow-hidden relative bg-white">
            <div className="absolute top-4 right-4 z-50">
              <button
                onClick={handleFullscreenPreview}
                className="p-2 bg-black/50 hover:bg-black/70 text-white rounded-lg transition-colors"
                title="Exit Fullscreen (ESC)"
              >
                <ExitFullscreenIcon />
              </button>
            </div>
            <Preview key={previewKey} files={files} />
          </div>
        ) : (
          // Normal Layout Mode
          <div ref={workspaceRef} className="flex-1 flex overflow-hidden relative">

            {/* CODE EDITOR PANE (Resizable) */}
            <div
              style={{
                width: showPreview ? `${editorWidthPercent}%` : '100%',
                minWidth: showPreview ? '300px' : '100%',
                maxWidth: showPreview ? 'calc(100% - 300px)' : '100%'
              }}
              className="h-full flex flex-col bg-[#1e1e2e] relative flex-shrink-0 transition-[width] duration-75"
            >
               {files.length > 0 ? (
                 <>
                   {/* Code History Toggle */}
                   <div className="flex items-center justify-between border-b border-zinc-700 px-3 py-2 bg-zinc-800/50">
                     <span className="text-xs text-zinc-400 font-medium">
                       {activeFileName}
                       {Object.keys(codeHistory).length > 0 && (
                         <span className="ml-2 text-blue-400">
                           {currentProjectId ? (
                             `(${Object.keys(codeHistory[currentProjectId] || {}).length} conversation version${Object.keys(codeHistory[currentProjectId] || {}).length !== 1 ? 's' : ''})`
                           ) : (
                             '(0 conversation versions)'
                           )}
                         </span>
                       )}
                     </span>
                     <div className="flex items-center gap-2">
                       {currentProjectId && Object.keys(codeHistory[currentProjectId] || {}).length > 0 && (
                         <button
                           onClick={() => setShowCodeHistory(!showCodeHistory)}
                           className="px-2 py-1 text-xs text-zinc-400 hover:text-white hover:bg-zinc-700 rounded transition-all"
                         >
                           {showCodeHistory ? 'Hide History' : 'Show History'}
                         </button>
                       )}
                     </div>
                   </div>

                   {/* Code History Panel */}
                   {showCodeHistory && currentProjectId && Object.keys(codeHistory[currentProjectId] || {}).length > 0 && (
                     <div className="border-b border-zinc-700 bg-zinc-900/50 max-h-64 overflow-y-auto">
                       <div className="p-2 space-y-1">
                         <div className="flex items-center justify-between mb-2">
                           <span className="text-xs text-zinc-500 font-medium">Conversation History (click to restore)</span>
                           <button
                             onClick={() => clearConversationHistory()}
                             className="text-xs text-red-400 hover:text-red-300 transition-colors"
                           >
                             Clear All
                           </button>
                         </div>
                         {getConversationVersions().map((version, index) => (
                           <div
                             key={version.messageId}
                             className="p-3 bg-zinc-800 hover:bg-zinc-700 rounded cursor-pointer transition-all group"
                           >
                             <div className="flex items-center justify-between mb-2">
                               <div
                                 className="flex-1"
                                 onClick={() => restoreConversationVersion(version.messageId)}
                               >
                                 <div className="flex items-center gap-2">
                                   <span className="text-xs text-zinc-300 font-medium">
                                     Version {index + 1} - {new Date(version.timestamp).toLocaleTimeString()}
                                   </span>
                                   <span className="text-xs text-zinc-500">
                                     {version.files.length} file{version.files.length !== 1 ? 's' : ''}
                                   </span>
                                 </div>
                               </div>
                               <button
                                 onClick={(e) => {
                                   e.stopPropagation();
                                   deleteConversationVersion(version.messageId);
                                 }}
                                 className="text-xs text-red-400 hover:text-red-300 transition-colors px-2 py-1 rounded hover:bg-zinc-700/50"
                                 title="Delete This Version"
                               >
                                 Delete
                               </button>
                             </div>
                             <div
                               className="text-xs text-zinc-400 mb-1 truncate"
                               onClick={() => restoreConversationVersion(version.messageId)}
                             >
                               {version.messageText.length > 0 ? version.messageText : 'No user message'}
                             </div>
                             <div
                               className="text-xs text-zinc-600"
                               onClick={() => restoreConversationVersion(version.messageId)}
                             >
                               Files: {version.files.map(f => f.name).join(', ')}
                             </div>
                           </div>
                         ))}
                       </div>
                     </div>
                   )}

                   <CodeEditor file={activeFile} onChange={handleFileChange} />
                 </>
               ) : (
                 <div className="flex-1 flex flex-col items-center justify-center text-zinc-600 text-sm gap-2">
                   <div className="p-4 rounded-full bg-zinc-800/50 mb-2"><CodeIcon/></div>
                   <p>No files open. Ask AI to create one.</p>
                 </div>
               )}
            </div>

            {showPreview && (
              <>
                {/* SPLITTER */}
                <div
                  onMouseDown={(e) => { e.preventDefault(); setIsResizingSplit(true); }}
                  className="w-1 bg-[#09090b] hover:bg-blue-500 cursor-col-resize z-20 flex flex-col justify-center items-center border-x border-zinc-800 flex-shrink-0"
                >
                    <div className="h-8 w-0.5 bg-zinc-700 rounded-full"></div>
                </div>

                {/* PREVIEW PANE (Fills remaining space) */}
                <div className="flex-1 h-full bg-white relative min-w-[300px]">
                  <Preview key={previewKey} files={files} />
                </div>
              </>
            )}
          </div>
        )}

        {/* Custom Modal */}
        {modal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[10000] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-6 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200">
              <div className="text-lg font-semibold text-white mb-4">{modal.title}</div>

              {modal.type === 'rename' ? (
                <>
                  <div className="text-sm text-zinc-300 mb-4">{modal.message}</div>
                  <input
                    type="text"
                    value={renameInputValue}
                    onChange={(e) => setRenameInputValue(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        modal.onConfirm?.(renameInputValue);
                        setModal(null);
                      } else if (e.key === 'Escape') {
                        setModal(null);
                      }
                    }}
                    className="w-full bg-[#0c0c0e] border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 mb-4"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setModal(null)}
                      className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        modal.onConfirm?.(renameInputValue);
                        setModal(null);
                      }}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
                    >
                      Rename
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-sm text-zinc-300 mb-6">{modal.message}</div>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setModal(null)}
                      className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        modal.onConfirm?.();
                        setModal(null);
                      }}
                      className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${
                        modal.type === 'delete'
                          ? 'bg-red-600 hover:bg-red-500'
                          : 'bg-blue-600 hover:bg-blue-500'
                      }`}
                    >
                      {modal.type === 'delete' ? 'Delete' : 'Confirm'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#1e1e2e] border border-zinc-700 rounded-xl p-6 w-96 max-w-[90vw]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Settings</h2>
              <button
                onClick={() => setShowSettings(false)}
                className="p-1 hover:bg-zinc-700 rounded text-zinc-400 hover:text-white transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {/* API Key Section */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Gemini API Key
                </label>
                <div className="space-y-2">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Enter your Gemini API key"
                    className="w-full px-3 py-2 bg-[#0d1117] border border-zinc-600 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <div className="text-xs text-zinc-500">
                    Your API key is stored locally and never sent to our servers.
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleSaveApiKey(apiKey)}
                  disabled={!apiKey.trim()}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Save API Key
                </button>
                <button
                  onClick={handleClearApiKey}
                  className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>

              {/* Storage Management Section */}
              <div className="border-t border-zinc-700 pt-4">
                <h3 className="text-sm font-medium text-zinc-300 mb-3">Storage Management</h3>
                <div className="space-y-3">
                  {/* Storage Size Info */}
                  <div className="bg-[#0d1117] border border-zinc-600 rounded-lg p-3">
                    <div className="text-xs text-zinc-400 mb-2">
                      Storage Usage
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-zinc-400">Total Size:</span>
                        <span className="text-zinc-300 font-mono">{getLocalStorageSize().formattedSize}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-zinc-400">Project Items:</span>
                        <span className="text-zinc-300 font-mono">{getLocalStorageSize().projectCount}</span>
                      </div>
                    </div>
                  </div>

                  {/* Clear Actions */}
                  <div className="space-y-2">
                    <button
                      onClick={handleClearProjectData}
                      className="w-full px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      Clear Project Data
                    </button>
                    <button
                      onClick={handleClearLocalStorage}
                      className="w-full px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      Clear All Data
                    </button>
                  </div>

                  <div className="text-xs text-zinc-500">
                    ⚠️ Clearing data is permanent and cannot be undone
                  </div>
                </div>
              </div>
            </div>
          </div>
      )}
    </div>
  );
};

export default App;