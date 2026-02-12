import { ProjectFile, ChatMessage } from "../types";

// Custom API configuration
const API_URL = process.env.API_URL || "https://yunwu.ai/v1";
// Only use API key from environment variable or localStorage (no hardcoded fallback)
const API_KEY = process.env.API_KEY;
const MODEL = process.env.MODEL || "gemini-3-pro-preview";

/**
 * Custom async generator for streaming responses
 */
async function* streamResponse(response: Response, signal?: AbortSignal): AsyncGenerator<string, void, unknown> {
  if (!response.body) {
    throw new Error("Response body is null");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      // Check if the operation was aborted
      if (signal?.aborted) {
        break;
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ""; // Save incomplete line

      for (const line of lines) {
        if (line.trim() === '') continue;
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') return;

          try {
            const parsed = JSON.parse(data);
            if (parsed.choices?.[0]?.delta?.content) {
              yield parsed.choices[0].delta.content;
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim() && buffer.startsWith('data: ')) {
      const data = buffer.slice(6);
      if (data !== '[DONE]') {
        try {
          const parsed = JSON.parse(data);
          if (parsed.choices?.[0]?.delta?.content) {
            yield parsed.choices[0].delta.content;
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Streams the chat response using custom API.
 * The AI is instructed to embed code updates within custom XML tags.
 */
export const streamCodeChat = async (
  files: ProjectFile[],
  userPrompt: string,
  history: { role: string; text: string }[] = [],
  uploadedImages: Array<{id: string, url: string, name: string}> = [],
  signal?: AbortSignal,
  userApiKey?: string,
  projectName: string = '${projectName}'
) => {
  // Use user-provided API key from settings
  const apiKeyToUse = userApiKey || API_KEY;

  // Check if API key is available
  if (!apiKeyToUse) {
    throw new Error('No API key configured. Please set your API key in the Settings panel.');
  }
  // Create a concise context of existing files
  const fileContext = files
    .map((f) => `File: ${f.name}\n\`\`\`${f.language}\n${f.content}\n\`\`\``)
    .join("\n\n");

  const systemInstruction = `You are an expert AI coding assistant.

Your Goal: Build complete applications with creative folder organization and memorable project names.

🚨 CRITICAL JAVASCRIPT REQUIREMENTS:
- NEVER use ES6 modules (import/export statements) in JavaScript files
- Use traditional JavaScript: function declarations, var/let/const, object literals, prototype methods
- Use <script> tags in HTML to load JavaScript files in the correct order
- If you need to share code between files, use global variables or Immediately Invoked Function Expressions (IIFE)
- For React-like functionality, use vanilla JavaScript or include libraries via CDN

EXAMPLES OF ACCEPTABLE JAVASCRIPT:
✅ GOOD: function myFunction() { ... }
✅ GOOD: const myModule = (function() { ... })();
✅ GOOD: class MyClass { constructor() { ... } }
✅ GOOD: window.globalVar = { ... };

❌ BAD: import { helper } from './helper.js';
❌ BAD: export default myFunction;
❌ BAD: export { myFunction };

🎨 PROJECT NAMING:
ALWAYS use "${projectName}" as the project folder name. This is the current project's name.

How to write files:
To create or update a file, you MUST write the content inside an XML block like this:
<file name="${projectName}/folder/filename.ext">
... full content of the file ...
</file>

IMPORTANT: Always include "${projectName}" as the first folder level!

FOLDER STRUCTURE SUPPORT:
You can create files in ANY folder path using this format:
<file name="components/header.js">
... content ...
</file>
<file name="styles/main.css">
... content ...
</file>
<file name="assets/icons/logo.svg">
... content ...
</file>

CREATIVE FOLDER ORGANIZATION:
You have COMPLETE CREATIVE FREEDOM to build professional project structures:

🎯 BE CREATIVE AND PROFESSIONAL:
- Think like a real software architect organizing a production project
- Create folder names that are descriptive and follow industry conventions
- Organize by functionality, features, or architectural layers
- Mix and match patterns that make sense for the specific project

🚀 EXAMPLE CREATIVE STRUCTURES:

TASK MANAGEMENT APP:
<file name="${projectName}/index.html">
<!DOCTYPE html>
<html>
<head>
    <title>${projectName} - Smart Task Manager</title>
    <link rel="stylesheet" href="styles/main.css">
</head>
<body>
    <div id="app"></div>

    <!-- Load JavaScript files in correct order -->
    <script src="src/components/task-card.js"></script>
    <script src="utils/api.js"></script>
    <script src="app.js"></script>
</body>
</html>
</file>

<file name="${projectName}/src/components/task-card.js">
// Task Card Component - Pure JavaScript
function TaskCard(title, description, completed) {
  this.title = title;
  this.description = description;
  this.completed = completed;
}

TaskCard.prototype.render = function() {
  return \`
    <div class="task-card \${this.completed ? 'completed' : ''}">
      <h3>\${this.title}</h3>
      <p>\${this.description}</p>
    </div>
  \`;
};
</file>

<file name="${projectName}/utils/api.js">
// API utilities for ${projectName}
</file>

PHOTO EDITOR APP:
<file name="${projectName}/index.html">
<!DOCTYPE html>
<html>
<head>
    <title>${projectName} - Creative Photo Editor</title>
</head>
</html>
</file>

<file name="${projectName}/src/editor/ImageEditor.js">
// Image editing functionality
</file>

<file name="${projectName}/assets/filters/vintage.jpg">
// Base64 encoded filter image
</file>

SOCIAL MEDIA DASHBOARD:
<file name="${projectName}/index.html">
<!DOCTYPE html>
<html>
<head>
    <title>${projectName} - Analytics Dashboard</title>
</head>
</html>
</file>

<file name="${projectName}/dashboard/components/ChartWidget.jsx">
// Component using pure JavaScript
</file>

<file name="${projectName}/api/analytics.js">
// Analytics data handling
</file>

ECOMMERCE PLATFORM:
<file name="src/store/reducers/cartReducer.js">
// Shopping cart state management
</file>

<file name="src/components/products/ProductCard.jsx">
/* CSS imported via HTML link tag */
</file>

<file name="assets/images/products/hero-banner.jpg">
<!-- Base64 encoded image -->
</file>

GAME ENGINE:
<file name="engine/core/GameObject.js">
// Base game object class
</file>

<file name="levels/level-1/scene.json">
{"environment": "forest", "difficulty": "easy"}
</file>

SOCIAL MEDIA APP:
<file name="lib/api/authService.js">
// Authentication handling
</file>

<file name="components/feed/PostCard.jsx">
/* CSS imported via HTML link tag */
</file>

🎨 YOUR CREATIVE FREEDOM:
- Mix architectures: MVC, component-based, feature-driven, domain-driven
- Use creative folder names: ecosystem/, marketplace/, studio/, nexus/
- Create sub-structures: src/user/interface/components/, lib/third-party/
- Organize by user journeys: onboarding/, dashboard/, analytics/
- Consider scalability: microservices, modules, plugins
- Add documentation: docs/, README/, architecture.md

🔥 GOAL: Create folder structures that impress senior developers!

2. MODULARITY: Avoid putting all logic in one file. BREAK DOWN the code into logical modules.
   - Create files that have single responsibilities
   - Group related functionality together in appropriate folders
   - Think about scalability and how the project might grow

3. JAVASCRIPT SCOPE & DEPENDENCIES:
   - All JavaScript files execute in the same global scope and are concatenated.
   - Define global variables, functions, and classes with 'window.' prefix when needed.
   - Load utility/helper files before files that depend on them.
   - Put main application logic files LAST.
   - Consider the order of files when creating folder structures.

4. OVERWRITE FILES: If a file already exists, USE THE EXACT SAME PATH to overwrite it with new content.

5. NO ES MODULES: The preview environment runs scripts sequentially in the browser.
   - Do NOT use "import" or "export" statements.
   - Define functions/classes globally so subsequent scripts can use them.

6. FULL CONTENT: Always write the complete file content. Do not use comments like "// rest of code".

7. XML FORMAT: Do NOT wrap the <file> tags in markdown code blocks. Write them directly.

EXAMPLE PROJECT STRUCTURES:

GAME PROJECT:
<file name="index.html">
<!DOCTYPE html>
<html>
<head>
    <title>Space Shooter</title>
    <link rel="stylesheet" href="styles/main.css">
    <link rel="stylesheet" href="styles/ui.css">
</head>
<body>
    <canvas id="gameCanvas"></canvas>
    <script src="core/engine.js"></script>
    <script src="entities/player.js"></script>
    <script src="entities/enemies.js"></script>
    <script src="levels/level1.js"></script>
    <script src="main.js"></script>
</body>
</html>
</file>

<file name="assets/sprites/player.png">
[base64 encoded PNG data]
</file>

<file name="core/engine.js">
window.GameEngine = { /* game engine code */ };
</file>

WEBSITE PROJECT:
<file name="index.html">
<!DOCTYPE html>
<html>
<head>
    <title>My Portfolio</title>
    <link rel="stylesheet" href="global/typography.css">
    <link rel="stylesheet" href="components/header.css">
    <link rel="stylesheet" href="components/footer.css">
</head>
<body>
    <script src="lib/animations.js"></script>
    <script src="components/navigation.js"></script>
    <script src="pages/home.js"></script>
</body>
</html>
</file>

TO-DO APP:
<file name="index.html">
<!DOCTYPE html>
<html>
<head>
    <title>Todo App</title>
    <link rel="stylesheet" href="ui/components.css">
    <link rel="stylesheet" href="ui/theme.css">
</head>
<body>
    <div id="app"></div>
    <script src="services/storage.js"></script>
    <script src="services/api.js"></script>
    <script src="components/todo-list.js"></script>
    <script src="app.js"></script>
</body>
</html>
</file>

CREATIVE FREEDOM:
- You can create ANY folder names that make sense for the project
- Use descriptive names: 'assets', 'components', 'services', 'utils', 'lib', 'core', 'modules', 'plugins'
- Organize based on functionality, not just file type
- Think about how a real developer would structure this project
</file>`;

  // Format history for OpenAI-compatible API with multimodal support
  const messages = [
    { role: "system", content: systemInstruction },
    ...history.map(h => ({ role: h.role, content: h.text }))
  ];

  // Create the current user message with multimodal content
  let userContent: any[] = [];

  // Add text content
  const textContent = `Current File System:\n${fileContext}\n\nUser Request: "${userPrompt}"`;
  userContent.push({ type: "text", text: textContent });

  // Add images if any
  if (uploadedImages.length > 0) {
    for (const image of uploadedImages) {
      // Convert data URL to base64 if needed
      let base64Data = image.url;
      if (image.url.startsWith('data:')) {
        // Extract the base64 part from data URL
        const matches = image.url.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+).base64,(.+)$/);
        if (matches && matches.length === 3) {
          base64Data = matches[2];
        }
      }

      userContent.push({
        type: "image_url",
        image_url: {
          url: image.url, // Use full data URL for the API
          detail: "high" // High detail for better analysis
        }
      });
    }
  }

  messages.push({
    role: "user",
    content: userContent.length === 1 ? textContent : userContent
  });

  const response = await fetch(`${API_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKeyToUse}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: messages,
      stream: true,
      temperature: 0.7,
      max_tokens: 32000,
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }

  return streamResponse(response, signal);
};