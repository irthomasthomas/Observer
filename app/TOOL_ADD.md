# Adding a New Tool to Observer AI (Frontend Integration Guide)

This guide documents all the frontend integration points required when adding a new tool to Observer AI. Use this as a checklist when implementing new tools.

## Overview

When adding a new tool to Observer AI, you need to update **7 core frontend files**. This guide uses the `click()` and `type()` tools as concrete examples.

---

## Integration Checklist

### 1. Tool Detection & UI Highlighting (`agentCapabilities.tsx`)

**File:** `app/src/components/AgentCard/agentCapabilities.tsx`

This file handles automatic detection of tools in agent code and displays them in the UI with appropriate warnings.

#### What to Update:

**a) Add to TOOL_CONFIG object** (around line 58):

```typescript
export const TOOL_CONFIG: Record<string, ToolConfigEntry> = {
  // ... existing tools ...

  click: {
    label: 'Mouse Click',
    iconName: 'MousePointer',
    iconType: 'lucide',
    regex: /\bclick\s*\(/g,
    warning: 'Position mouse before agent runs'
  },
  type: {
    label: 'Type Text',
    iconName: 'Keyboard',
    iconType: 'lucide',
    regex: /\btype\s*\(/g,
    warning: 'Ensure cursor is in correct input field'
  },
};
```

**b) Import required icons** (top of file):

```typescript
import {
  // ... existing imports ...
  MousePointer, Keyboard
} from 'lucide-react';
```

**c) Update webIncompatibleTools array** (if Tauri-only, around line 143):

```typescript
const webIncompatibleTools = ['overlay', 'message', 'ask', 'system_notify', 'click', 'type'];
```

**Key fields explained:**
- `label`: Display name shown in UI
- `iconName`: Icon from lucide-react or custom icons
- `iconType`: Either 'lucide' or 'custom'
- `regex`: Pattern to detect tool usage in code (use `\b` for word boundaries)
- `warning`: Optional warning message shown to users
- Tauri-only tools get automatic "Only available in Observer App" warning

---

### 2. Simple Creator UI (`SimpleCreatorModal.tsx`)

**File:** `app/src/components/EditAgent/SimpleCreatorModal.tsx`

This is the wizard-based UI where users select tools through clickable buttons.

#### What to Update:

**a) Import icons** (around line 9):

```typescript
import {
  // ... existing imports ...
  MousePointer, Keyboard
} from 'lucide-react';
```

**b) Add tool buttons in appropriate section** (around line 380-400):

Tools are organized into sections:
- **Reliable Notifications** (Discord, Email, Telegram, Pushover)
- **Logging & Recording** (Memory, Video)
- **App Specific Utils** (Tauri-only tools like ask, message, overlay, click, type)
- **Other Notifications** (Browser notifications, SMS, WhatsApp)

Example for Tauri-only tools in "App Specific Utils" section:

```typescript
{hostingContext === 'self-hosted' && (
  <div className="space-y-4">
    <h4 className="text-lg font-semibold text-gray-700">App Specific Utils</h4>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {/* ... existing tools ... */}

      {/* Click Tool */}
      <button type="button" onClick={() => toggleTool('click')}
        className={`group flex items-center space-x-4 p-4 border-2 rounded-lg text-left transition-all ${selectedTools.has('click') ? 'border-pink-500 bg-pink-50' : 'border-gray-300 hover:border-gray-400'}`}>
        <MousePointer className={`h-8 w-8 transition-colors ${selectedTools.has('click') ? 'text-pink-500' : 'text-gray-400 group-hover:text-gray-600'}`} />
        <div>
          <h3 className="font-semibold text-gray-900">Mouse Click</h3>
          <p className="text-sm text-gray-500">Clicks at current cursor position.</p>
        </div>
      </button>

      {/* Type Tool */}
      <button type="button" onClick={() => toggleTool('type')}
        className={`group flex items-center space-x-4 p-4 border-2 rounded-lg text-left transition-all ${selectedTools.has('type') ? 'border-amber-500 bg-amber-50' : 'border-gray-300 hover:border-gray-400'}`}>
        <Keyboard className={`h-8 w-8 transition-colors ${selectedTools.has('type') ? 'text-amber-500' : 'text-gray-400 group-hover:text-gray-600'}`} />
        <div>
          <h3 className="font-semibold text-gray-900">Type Text</h3>
          <p className="text-sm text-gray-500">Types text at cursor focus position.</p>
        </div>
      </button>
    </div>
  </div>
)}
```

**Styling notes:**
- Choose a unique color theme (e.g., pink-500 for click, amber-500 for type)
- Use consistent border/background pattern with other tools
- Keep descriptions concise (1 short sentence)

---

### 3. Tools Testing Interface (`ToolsModal.tsx`)

**File:** `app/src/components/AgentCard/ToolsModal.tsx`

This modal allows users to test tools interactively with clickable highlighting in the code editor.

#### What to Update:

**a) Import icons** (around line 3-7):

```typescript
import {
  // ... existing imports ...
  MousePointer, Keyboard
} from 'lucide-react';
```

**b) Add to getAllTools() function** (around line 60-350):

Tools are split into two categories:
- **Testable tools** (can be executed from the UI) - lines 62-210
- **Non-testable tools** (info-only) - lines 212+

Example for testable tools:

```typescript
function getAllTools(): ToolConfig[] {
  return [
    // ... existing testable tools ...

    {
      id: 'click',
      name: 'click()',
      functionName: 'click',
      icon: MousePointer,
      description: 'Trigger mouse click at cursor position',
      isTestable: true,
      parameters: [],
      testMessage: '',
      warning: '⚠️ IMPORTANT: Position mouse before agent runs.'
    },
    {
      id: 'type',
      name: 'type()',
      functionName: 'type',
      icon: Keyboard,
      description: 'Type text at cursor focus position',
      isTestable: true,
      parameters: [
        { name: 'text', description: 'Text to type' }
      ],
      testMessage: 'Test from Observer',
      warning: '⚠️ IMPORTANT: Ensure cursor is in correct input field.'
    },

    // ... non-testable tools ...
  ];
}
```

**c) Add test handlers** (around line 800-950):

Add cases to the `handleTest` switch statement:

```typescript
const handleTest = async () => {
  // ... existing code ...

  switch (toolId) {
    // ... existing cases ...

    case 'click': {
      const appUrl = 'http://localhost:3838';
      await utils.click(appUrl);
      break;
    }

    case 'type': {
      const appUrl = 'http://localhost:3838';
      const text = testInputs[0] || selectedToolConfig.testMessage || '';
      await utils.type(appUrl, text);
      break;
    }

    default:
      throw new Error(`Test not implemented for ${toolId}`);
  }
};
```

**Testing notes:**
- Use `testInputs[0]` for first parameter, `testInputs[1]` for second, etc.
- Fallback to `selectedToolConfig.testMessage` if user hasn't entered a value
- Tools that require appUrl (Tauri tools) use `'http://localhost:3838'`

---

### 4. Code Generation (`agentTemplateManager.ts`)

**File:** `app/src/utils/agentTemplateManager.ts`

This generates the actual JavaScript code when users create agents via Simple Creator.

#### What to Update:

**a) Add to SimpleTool type** (line 5):

```typescript
export type SimpleTool =
  'notification' | 'memory' | 'sms' | 'email' | 'whatsapp' |
  'start_clip' | 'mark_clip' | 'pushover' | 'discord' | 'telegram' |
  'ask' | 'system_notify' | 'message' | 'overlay' |
  'click' | 'type';  // <-- Add your tools here
```

**b) Add to TOOL_CODE_SNIPPETS object** (around line 16-120):

```typescript
const TOOL_CODE_SNIPPETS: Record<SimpleTool, (data: ToolData) => string> = {
  // ... existing tools ...

  click: () => `
// --- MOUSE CLICK TOOL ---
// Triggers a mouse click at the current cursor position.
// IMPORTANT: Position the mouse before the agent runs.
click();
`,

  type: () => `
// --- TYPE TEXT TOOL ---
// Types text at the current cursor/focus position.
// IMPORTANT: Ensure the cursor is in the correct input field.
type(response);
`,
};
```

**Code snippet guidelines:**
- Start with a descriptive comment block
- Include IMPORTANT warnings if applicable
- Use `response` variable for the model's output
- Use `agentId` for current agent's ID
- Keep code simple and self-documenting
- If tool needs parameters from ToolData, accept `data` argument and extract values

---

### 5. Multi-Agent Creator System Prompt (`multi_agent_creator.ts`)

**File:** `app/src/utils/multi_agent_creator.ts`

This is the system prompt that guides the AI when users create multi-agent teams.

#### What to Update:

Find the **TOOLS (Agent Hands)** section (around line 368-374) and update the appropriate category:

```typescript
#### TOOLS (Agent Hands)
Tools enable agents to perform actions and interact with the system or the user.

*   **Agent & Memory Control:** Manage agent behavior with \`startAgent()\`, \`stopAgent()\`, and \`sleep()\`. Store and retrieve information using \`setMemory()\`, \`getMemory()\`, and \`appendMemory()\`.
*   **Notifications & Communication:** Send alerts through various channels, including email (\`sendEmail\`), system notifications (\`system_notify\`), and messaging apps like Discord (\`sendDiscord\`) and Telegram (\`sendTelegram\`).
*   **User Interaction:** Directly engage with the user by showing a message (\`message\`), displaying information on the screen (\`overlay\`), or asking for confirmation with a dialog box (\`ask\`). Control the user's mouse and keyboard with \`click()\` to trigger a click at the cursor position, or \`type(text)\` to type text at the cursor focus.
*   **Video Recording:** Programmatically start, stop, and mark video recordings of on-screen activity using \`startClip()\`, \`stopClip()\`, and \`markClip()\`.
```

**Categories:**
- **Agent & Memory Control** - startAgent, stopAgent, sleep, memory functions
- **Notifications & Communication** - sendEmail, system_notify, messaging apps
- **User Interaction** - message, overlay, ask, click, type
- **Video Recording** - startClip, stopClip, markClip

---

### 6. README Documentation (`README.md`)

**File:** `README.md`

Update the App Tools section (around line 148-155):

```markdown
App Tools:
  * `ask(question, title="Confirmation")` - Pops up a system confirmation dialog
  * `message(message, title="Agent Message")` - Pops up a system message
  * `system_notify(body, title="Observer AI")` - Sends a system notification
  * `overlay(body)` - Pushes a message to the overlay
  * `click()` - Triggers a mouse click at the current cursor position ⚠️IMPORTANT: Position mouse before agent runs
  * `type(text)` - Types the provided text at the current cursor/focus position ⚠️IMPORTANT: Ensure cursor is in correct input field
```

**Documentation guidelines:**
- Include function signature with parameter names
- Add brief description (one line)
- Include ⚠️IMPORTANT warnings if applicable
- Keep alphabetical order within sections (optional but helpful)

---

### 7. Tool Execution Icon (`ToolStatus.tsx`)

**File:** `app/src/components/AgentCard/ToolStatus.tsx`

This component displays tool execution status in the ActiveAgentView. Add your tool's icon to the icon mapping.

#### What to Update:

**a) Import icon** (around line 3-7):

```typescript
import {
  CheckCircle, XCircle, Send, MessageSquare, MessageSquarePlus, MessageSquareQuote,
  MessageCircle, Mail, Bell, Save, SquarePen, PlayCircle, StopCircle, Hourglass,
  Video, VideoOff, Hammer, Tag, AlertTriangle, HelpCircle, Phone  // <-- Add your icon here
} from 'lucide-react';
```

**b) Add to iconMap** (around line 12-35):

```typescript
const iconMap: Record<string, React.ElementType> = {
  // ... existing tools ...
  sendEmail: Mail,
  call: Phone,  // <-- Add your tool here
  notify: Bell,
  // ... more tools ...
};
```

**Mapping guidelines:**
- Use the same icon as in other UI components for consistency
- Map the tool's function name (e.g., 'call', 'sendEmail') to the icon component
- Icons appear next to success/error indicators when tools are executed

---

## Important Notes

### Files to SKIP

**DO NOT update** `app/src/utils/conversational_system_prompt.ts`

This file is specifically for notification-only tools. Only update it if your tool:
- Sends notifications (email, SMS, Discord, Telegram, WhatsApp, Pushover)
- Records video (startClip, stopClip, markClip)

System interaction tools (click, type, ask, message, etc.) should NOT be added here.

### Backend Prerequisites

This guide assumes you've already implemented the backend functionality:
- Rust handler in `app/src-tauri/src/` (e.g., `controls.rs`)
- Route registration in `lib.rs`
- Utility functions in `app/src/utils/handlers/utils.ts`
- Execution context in `app/src/utils/handlers/javascript.ts`

Refer to the backend implementation guide for those steps.

---

## Verification Checklist

After implementing a new tool, verify:

- [ ] Tool appears in Agent Card's capabilities section when used in code
- [ ] Tool button shows in Simple Creator (if applicable)
- [ ] Tool can be clicked in Tools Modal code editor
- [ ] Test button works in Tools Modal (if testable)
- [ ] Code snippets generate correctly from Simple Creator
- [ ] Multi-Agent Creator knows about the tool
- [ ] README documentation is updated
- [ ] Tool icon displays correctly in execution status (ToolStatus component)
- [ ] Icons display correctly in all UI components
- [ ] Warnings show appropriately
- [ ] Tauri-only restrictions work (if applicable)

---

## Example: Complete Integration Diff

Here's a minimal example showing what changed for `click()`:

### agentCapabilities.tsx
```typescript
+  click: { label: 'Mouse Click', iconName: 'MousePointer', iconType: 'lucide', regex: /\bclick\s*\(/g, warning: 'Position mouse before agent runs' },
```

### SimpleCreatorModal.tsx
```typescript
+      <button type="button" onClick={() => toggleTool('click')} ...>
+        <MousePointer className={...} />
+        <div>
+          <h3>Mouse Click</h3>
+          <p>Clicks at current cursor position.</p>
+        </div>
+      </button>
```

### ToolsModal.tsx
```typescript
+    {
+      id: 'click',
+      name: 'click()',
+      functionName: 'click',
+      icon: MousePointer,
+      description: 'Trigger mouse click at cursor position',
+      isTestable: true,
+      parameters: [],
+      warning: '⚠️ IMPORTANT: Position mouse before agent runs.'
+    },

+    case 'click': {
+      await utils.click('http://localhost:3838');
+      break;
+    }
```

### agentTemplateManager.ts
```typescript
+ export type SimpleTool = ... | 'click';

+  click: () => `
+ // --- MOUSE CLICK TOOL ---
+ click();
+ `,
```

### multi_agent_creator.ts
```typescript
-*   **User Interaction:** ... or asking for confirmation with a dialog box (\`ask\`).
+*   **User Interaction:** ... or asking for confirmation with a dialog box (\`ask\`). Control the user's mouse with \`click()\`.
```

### README.md
```markdown
+  * `click()` - Triggers a mouse click at the current cursor position ⚠️IMPORTANT: Position mouse before agent runs
```

### ToolStatus.tsx
```typescript
+ import {
+   // ... existing imports ...
+   Phone  // <-- Add new icon
+ } from 'lucide-react';

+ const iconMap: Record<string, React.ElementType> = {
+   // ... existing tools ...
+   call: Phone,  // <-- Add tool mapping
+   // ... more tools ...
+ };
```

---

## Questions?

If you need to add a tool and encounter issues:

1. Check that the backend implementation is complete first
2. Follow this guide step-by-step for each file
3. Use the `click()` and `type()` implementations as reference examples
4. Verify the tool appears in all 7 integration points

---

*Last updated: Based on click()/type()/call() tool implementations. Added ToolStatus.tsx integration point.*
