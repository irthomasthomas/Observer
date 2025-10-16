import React, { useState, useMemo, useEffect } from 'react';
import Modal from '@components/EditAgent/Modal';
import {
  X, Mail, MessageSquare, MessageSquareQuote, Bell, Monitor, MessageCircle,
  MessageSquarePlus, CheckCircle, XCircle, Loader2, Save, SquarePen, PlayCircle,
  StopCircle, Hourglass, Video, VideoOff, Tag, Info
} from 'lucide-react';
import { WhatsAppIcon, DiscordIcon } from './icons';
import type { TokenProvider } from '@utils/main_loop';
import * as utils from '@utils/handlers/utils';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { EditorView, Decoration, ViewPlugin, DecorationSet, ViewUpdate } from '@codemirror/view';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';

interface ToolsModalProps {
  isOpen: boolean;
  onClose: () => void;
  code: string;
  agentName: string;
  agentId: string;
  getToken?: TokenProvider;
  onCodeChange?: (newCode: string) => void;
}

// Tool type definitions
interface ToolConfig {
  id: string;
  name: string;
  functionName: string;
  icon: React.ElementType;
  description: string;
  isTestable: boolean;
  parameters?: {
    name: string;
    description: string;
  }[];
  testMessage?: string;
  warning?: string;
  infoMessage?: string;
}

interface ToolCall {
  id: string;           // unique id for this specific call
  toolId: string;       // which tool (sendEmail, etc)
  functionName: string;
  args: string[];       // raw argument strings from code
  lineNumber: number;
  startIndex: number;
  endIndex: number;
  isTestable: boolean;
}

interface TestResult {
  success: boolean;
  message: string;
}

// All tools configuration - wrapped in function to avoid module initialization issues
function getAllTools(): ToolConfig[] {
  return [
    // Testable notification tools
    {
      id: 'sendEmail',
      name: 'sendEmail()',
      functionName: 'sendEmail',
      icon: Mail,
      description: 'Send an email notification',
      isTestable: true,
      parameters: [
        { name: 'email', description: 'Email address' },
        { name: 'message', description: 'Email message content' }
      ],
      testMessage: 'This is a test from Observer!'
    },
    {
      id: 'sendWhatsapp',
      name: 'sendWhatsapp()',
      functionName: 'sendWhatsapp',
      icon: WhatsAppIcon,
      description: 'Send a WhatsApp message',
      isTestable: true,
      parameters: [
        { name: 'phone_number', description: 'Phone number with country code' },
        { name: 'message', description: 'Message content' }
      ],
      testMessage: 'This is a test from Observer!',
      warning: '⚠️ IMPORTANT: Send a message first to +1 (555) 783-4727 to use WhatsApp.'
    },
    {
      id: 'sendPushover',
      name: 'sendPushover()',
      functionName: 'sendPushover',
      icon: Bell,
      description: 'Send a Pushover notification',
      isTestable: true,
      parameters: [
        { name: 'user_token', description: 'Pushover user token' },
        { name: 'message', description: 'Notification message' },
        { name: 'title', description: 'Notification title' }
      ],
      testMessage: 'This is a test from Observer!'
    },
    {
      id: 'sendDiscord',
      name: 'sendDiscord()',
      functionName: 'sendDiscord',
      icon: DiscordIcon,
      description: 'Send a Discord webhook message',
      isTestable: true,
      parameters: [
        { name: 'webhook_url', description: 'Discord webhook URL' },
        { name: 'message', description: 'Message content' }
      ],
      testMessage: 'This is a test from Observer!'
    },
    {
      id: 'sendTelegram',
      name: 'sendTelegram()',
      functionName: 'sendTelegram',
      icon: MessageCircle,
      description: 'Send a Telegram message',
      isTestable: true,
      parameters: [
        { name: 'chat_id', description: 'Telegram chat ID' },
        { name: 'message', description: 'Message content' }
      ],
      testMessage: 'This is a test from Observer!',
      infoMessage: 'ℹ️ Get your chat_id by messaging @observer_notification_bot'
    },
    {
      id: 'sendSms',
      name: 'sendSms()',
      functionName: 'sendSms',
      icon: MessageSquarePlus,
      description: 'Send an SMS message',
      isTestable: true,
      parameters: [
        { name: 'phone_number', description: 'Phone number with country code' },
        { name: 'message', description: 'SMS content' }
      ],
      testMessage: 'This is a test from Observer!',
      warning: '⚠️ IMPORTANT: Due to A2P policy, some SMS messages are being blocked. Not recommended for US/Canada.'
    },
    {
      id: 'notify',
      name: 'notify()',
      functionName: 'notify',
      icon: Bell,
      description: 'Send a browser notification',
      isTestable: true,
      parameters: [
        { name: 'title', description: 'Notification title' },
        { name: 'options', description: 'Notification options object' }
      ],
      testMessage: 'Browser notifications working!',
      warning: '⚠️ IMPORTANT: Some browsers block notifications. Check your browser settings if this doesn\'t work.'
    },
    {
      id: 'ask',
      name: 'ask()',
      functionName: 'ask',
      icon: MessageSquareQuote,
      description: 'Show a confirmation dialog',
      isTestable: true,
      parameters: [
        { name: 'question', description: 'Question to ask' },
        { name: 'title', description: 'Dialog title' }
      ],
      testMessage: 'Test confirmation - Is this working?'
    },
    {
      id: 'message',
      name: 'message()',
      functionName: 'message',
      icon: MessageSquare,
      description: 'Show a system message dialog',
      isTestable: true,
      parameters: [
        { name: 'message', description: 'Message content' },
        { name: 'title', description: 'Dialog title' }
      ],
      testMessage: 'Test from Observer - Messages working!'
    },
    {
      id: 'system_notify',
      name: 'system_notify()',
      functionName: 'system_notify',
      icon: Bell,
      description: 'Send a system notification',
      isTestable: true,
      parameters: [
        { name: 'body', description: 'Notification body' },
        { name: 'title', description: 'Notification title' }
      ],
      testMessage: 'System notifications working!'
    },
    {
      id: 'overlay',
      name: 'overlay()',
      functionName: 'overlay',
      icon: Monitor,
      description: 'Show an overlay message',
      isTestable: true,
      parameters: [
        { name: 'body', description: 'Overlay message content' }
      ],
      testMessage: 'Test from Observer - Overlay working!'
    },

    // Non-testable tools (info only)
    {
      id: 'getMemory',
      name: 'getMemory()',
      functionName: 'getMemory',
      icon: Save,
      description: 'Retrieve stored memory from an agent',
      isTestable: false,
      parameters: [
        { name: 'agentId', description: 'Agent ID (defaults to current agent)' }
      ]
    },
    {
      id: 'setMemory',
      name: 'setMemory()',
      functionName: 'setMemory',
      icon: SquarePen,
      description: 'Replace stored memory for an agent',
      isTestable: false,
      parameters: [
        { name: 'agentId', description: 'Agent ID (defaults to current agent)' },
        { name: 'content', description: 'Memory content to store' }
      ]
    },
    {
      id: 'appendMemory',
      name: 'appendMemory()',
      functionName: 'appendMemory',
      icon: SquarePen,
      description: 'Add to existing memory for an agent',
      isTestable: false,
      parameters: [
        { name: 'agentId', description: 'Agent ID (defaults to current agent)' },
        { name: 'content', description: 'Content to append' }
      ]
    },
    {
      id: 'getImageMemory',
      name: 'getImageMemory()',
      functionName: 'getImageMemory',
      icon: Save,
      description: 'Retrieve stored images from an agent',
      isTestable: false,
      parameters: [
        { name: 'agentId', description: 'Agent ID (defaults to current agent)' }
      ]
    },
    {
      id: 'setImageMemory',
      name: 'setImageMemory()',
      functionName: 'setImageMemory',
      icon: Save,
      description: 'Set images in agent memory',
      isTestable: false,
      parameters: [
        { name: 'agentId', description: 'Agent ID (defaults to current agent)' },
        { name: 'images', description: 'Array of base64 images' }
      ]
    },
    {
      id: 'appendImageMemory',
      name: 'appendImageMemory()',
      functionName: 'appendImageMemory',
      icon: Save,
      description: 'Add images to agent memory',
      isTestable: false,
      parameters: [
        { name: 'agentId', description: 'Agent ID (defaults to current agent)' },
        { name: 'images', description: 'Array of base64 images to append' }
      ]
    },
    {
      id: 'startAgent',
      name: 'startAgent()',
      functionName: 'startAgent',
      icon: PlayCircle,
      description: 'Start another agent',
      isTestable: false,
      parameters: [
        { name: 'agentId', description: 'ID of agent to start' }
      ]
    },
    {
      id: 'stopAgent',
      name: 'stopAgent()',
      functionName: 'stopAgent',
      icon: StopCircle,
      description: 'Stop another agent',
      isTestable: false,
      parameters: [
        { name: 'agentId', description: 'ID of agent to stop' }
      ]
    },
    {
      id: 'time',
      name: 'time()',
      functionName: 'time',
      icon: Hourglass,
      description: 'Get the current time',
      isTestable: false,
      parameters: []
    },
    {
      id: 'sleep',
      name: 'sleep()',
      functionName: 'sleep',
      icon: Hourglass,
      description: 'Wait for specified milliseconds',
      isTestable: false,
      parameters: [
        { name: 'ms', description: 'Milliseconds to wait' }
      ]
    },
    {
      id: 'startClip',
      name: 'startClip()',
      functionName: 'startClip',
      icon: Video,
      description: 'Start recording video',
      isTestable: false,
      parameters: []
    },
    {
      id: 'stopClip',
      name: 'stopClip()',
      functionName: 'stopClip',
      icon: VideoOff,
      description: 'Stop recording video',
      isTestable: false,
      parameters: []
    },
    {
      id: 'markClip',
      name: 'markClip()',
      functionName: 'markClip',
      icon: Tag,
      description: 'Add a label to active recording',
      isTestable: false,
      parameters: [
        { name: 'label', description: 'Label text for the clip' }
      ]
    }
  ];
}

// Helper: Smart argument parser that respects strings and nested structures
function parseArguments(argsString: string): string[] {
  if (!argsString || argsString.trim().length === 0) {
    return [];
  }

  const args: string[] = [];
  let currentArg = '';
  let inString = false;
  let stringChar = '';
  let depth = 0; // Track nesting of (), [], {}
  let escapeNext = false;

  for (let i = 0; i < argsString.length; i++) {
    const char = argsString[i];

    // Handle escape sequences
    if (escapeNext) {
      currentArg += char;
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      currentArg += char;
      escapeNext = true;
      continue;
    }

    // Handle string boundaries
    if ((char === '"' || char === "'" || char === '`') && !inString) {
      inString = true;
      stringChar = char;
      currentArg += char;
      continue;
    }

    if (char === stringChar && inString) {
      inString = false;
      stringChar = '';
      currentArg += char;
      continue;
    }

    // If we're inside a string, just add the character
    if (inString) {
      currentArg += char;
      continue;
    }

    // Track nesting depth for parentheses, brackets, braces
    if (char === '(' || char === '[' || char === '{') {
      depth++;
      currentArg += char;
      continue;
    }

    if (char === ')' || char === ']' || char === '}') {
      depth--;
      currentArg += char;
      continue;
    }

    // Split on comma only if we're at top level and not in a string
    if (char === ',' && depth === 0 && !inString) {
      const trimmed = currentArg.trim();
      if (trimmed.length > 0) {
        args.push(trimmed);
      }
      currentArg = '';
      continue;
    }

    // Add character to current argument
    currentArg += char;
  }

  // Add the last argument
  const trimmed = currentArg.trim();
  if (trimmed.length > 0) {
    args.push(trimmed);
  }

  return args;
}

// Helper: Extract full function call including nested parentheses
function extractFunctionCall(code: string, startPos: number): { argsString: string; endPos: number } | null {
  // Find the opening parenthesis
  let pos = startPos;
  while (pos < code.length && code[pos] !== '(') {
    pos++;
  }

  if (pos >= code.length) return null;

  const openParenPos = pos;
  pos++; // Move past opening paren

  let depth = 1;
  let inString = false;
  let stringChar = '';
  let escapeNext = false;

  // Find the matching closing parenthesis
  while (pos < code.length && depth > 0) {
    const char = code[pos];

    if (escapeNext) {
      escapeNext = false;
      pos++;
      continue;
    }

    if (char === '\\') {
      escapeNext = true;
      pos++;
      continue;
    }

    // Handle string boundaries
    if ((char === '"' || char === "'" || char === '`') && !inString) {
      inString = true;
      stringChar = char;
    } else if (char === stringChar && inString) {
      inString = false;
      stringChar = '';
    } else if (!inString) {
      // Only count parens outside of strings
      if (char === '(') {
        depth++;
      } else if (char === ')') {
        depth--;
      }
    }

    pos++;
  }

  if (depth !== 0) return null; // Unmatched parentheses

  // Extract the arguments string (between the parentheses)
  const argsString = code.substring(openParenPos + 1, pos - 1);

  return { argsString, endPos: pos };
}

// Parse code to find all tool calls
function parseToolCalls(code: string): ToolCall[] {
  const calls: ToolCall[] = [];
  const ALL_TOOLS = getAllTools();

  ALL_TOOLS.forEach(tool => {
    // Find function name occurrences
    const regex = new RegExp(`\\b${tool.functionName}\\s*\\(`, 'g');
    let match;

    while ((match = regex.exec(code)) !== null) {
      const startIndex = match.index;

      // Extract the full function call with nested parens
      const extraction = extractFunctionCall(code, startIndex + tool.functionName.length);

      if (!extraction) continue;

      const { argsString, endPos } = extraction;

      // Find line number
      const beforeMatch = code.substring(0, startIndex);
      const lineNumber = beforeMatch.split('\n').length;

      // Parse arguments using smart parser
      const args = parseArguments(argsString);

      // Create unique ID for this call
      const callId = `${tool.id}_line${lineNumber}_${startIndex}`;

      calls.push({
        id: callId,
        toolId: tool.id,
        functionName: tool.functionName,
        args,
        lineNumber,
        startIndex: startIndex,
        endIndex: endPos,
        isTestable: tool.isTestable
      });
    }
  });

  // Sort by position in code
  return calls.sort((a, b) => a.startIndex - b.startIndex);
}

// Create CodeMirror extension for highlighting and clicking tools
function createToolHighlightExtension(toolCalls: ToolCall[], onToolClick: (call: ToolCall, event?: MouseEvent) => void) {
  const toolDecorations = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = this.buildDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = this.buildDecorations(update.view);
        }
      }

      buildDecorations(_view: EditorView): DecorationSet {
        const decorations: any[] = [];

        toolCalls.forEach((call) => {
          const mark = Decoration.mark({
            class: call.isTestable
              ? 'cm-tool-testable'
              : 'cm-tool-info',
            attributes: {
              'data-tool-id': call.id,
              style: 'cursor: pointer;'
            }
          });

          decorations.push(mark.range(call.startIndex, call.endIndex));
        });

        return Decoration.set(decorations, true);
      }
    },
    {
      decorations: v => v.decorations
    }
  );

  // Handle clicks on tool decorations
  const clickHandler = EditorView.domEventHandlers({
    click: (event, _view) => {
      const target = event.target as HTMLElement;
      const toolElement = target.closest('[data-tool-id]') as HTMLElement;

      if (toolElement) {
        const toolId = toolElement.getAttribute('data-tool-id');
        const tool = toolCalls.find(t => t.id === toolId);
        if (tool) {
          onToolClick(tool, event);
          event.preventDefault();
          return true;
        }
      }
      return false;
    }
  });

  return [toolDecorations, clickHandler];
}

// Helper: Intelligently format argument based on its content
function formatArg(value: string): string {
  // Only these specific variables stay unquoted
  if (value === 'response' || value === 'agentId') {
    return value;
  }
  // Everything else gets quoted (including screen, camera, images, etc.)
  return `"${value.replace(/"/g, '\\"')}"`;
}

// Helper: Update a specific tool call on a given line
function updateCallOnLine(
  code: string,
  lineNumber: number,
  functionName: string,
  newArgs: string[]
): string {
  const lines = code.split('\n');
  const lineIndex = lineNumber - 1;

  if (lineIndex < 0 || lineIndex >= lines.length) {
    return code; // Safety check
  }

  const line = lines[lineIndex];

  // Find where the function name starts on this line
  const funcNameRegex = new RegExp(`\\b${functionName}\\s*\\(`);
  const match = line.match(funcNameRegex);

  if (!match || match.index === undefined) {
    return code; // No match found
  }

  // Calculate the position in the full code string
  const lineStartPos = lines.slice(0, lineIndex).join('\n').length + (lineIndex > 0 ? 1 : 0);
  const funcStartPosInLine = match.index;
  const funcStartPosInCode = lineStartPos + funcStartPosInLine;

  // Extract the full function call using smart extraction
  const extraction = extractFunctionCall(code, funcStartPosInCode + functionName.length);

  if (!extraction) {
    return code; // Couldn't extract function call
  }

  const { argsString } = extraction;

  // Parse existing arguments to preserve 3rd+ parameters (e.g., images)
  const existingArgs = parseArguments(argsString);

  // Build new arguments array:
  // - First 2 args from newArgs (formatted)
  // - Rest from existing args (preserved as-is)
  const finalArgs = [
    ...newArgs.slice(0, 2).map(formatArg),  // First 2 from user input
    ...existingArgs.slice(2)                 // 3rd+ preserved from original code
  ];

  const newCall = `${functionName}(${finalArgs.join(', ')})`;

  // Replace on this line only - find the function call pattern and replace
  const lineBeforeFunc = line.substring(0, funcStartPosInLine);
  const lineAfterMatch = funcNameRegex.exec(line);
  if (lineAfterMatch) {
    // Use extractFunctionCall to find exact end position
    const lineExtraction = extractFunctionCall(line, funcStartPosInLine + functionName.length);
    if (lineExtraction) {
      const callEnd = lineExtraction.endPos;
      const lineAfterFunc = line.substring(callEnd);
      lines[lineIndex] = lineBeforeFunc + newCall + lineAfterFunc;
    }
  }

  return lines.join('\n');
}

const ToolsModal: React.FC<ToolsModalProps> = ({ isOpen, onClose, code, agentName, agentId, getToken, onCodeChange }) => {
  const [selectedCall, setSelectedCall] = useState<ToolCall | null>(null);
  const [testInputs, setTestInputs] = useState<string[]>([]);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testingTool, setTestingTool] = useState<boolean>(false);
  const [showHelp, setShowHelp] = useState<boolean>(false);
  const [bubblePosition, setBubblePosition] = useState<{ top: number; left: number } | null>(null);
  const [modifiedCode, setModifiedCode] = useState<string>(code);
  const [isEditing, setIsEditing] = useState<boolean>(false);

  // Sync modifiedCode when code prop changes (prevents empty code bug)
  useEffect(() => {
    if (code && code !== modifiedCode) {
      setModifiedCode(code);
    }
  }, [code]);

  // Handle modal close with save (following SensorModal pattern)
  const handleClose = () => {
    if (onCodeChange && modifiedCode !== code) {
      onCodeChange(modifiedCode);
    }
    onClose();
  };

  // Parse tool calls from modified code (re-parse when code changes)
  const toolCalls = useMemo(() => parseToolCalls(modifiedCode), [modifiedCode]);

  // Get selected tool config
  const selectedToolConfig = selectedCall
    ? getAllTools().find(t => t.id === selectedCall.toolId)
    : null;

  // Mock context for evaluating arguments
  const mockContext = useMemo(() => ({
    response: "This is the model's response from Observer AI",
    agentId: agentId
  }), []);

  // When a tool is clicked, evaluate its arguments and populate inputs
  const handleToolClick = (call: ToolCall, event?: MouseEvent) => {
    // Re-parse modified code to get fresh tool calls with updated indices
    const freshCalls = parseToolCalls(modifiedCode);

    // Find the corresponding call by line number (stable identifier)
    const freshCall = freshCalls.find(
      c => c.lineNumber === call.lineNumber &&
           c.functionName === call.functionName
    ) || call; // Fallback to original if not found

    setSelectedCall(freshCall);
    setTestResult(null);
    setShowHelp(false);

    // Calculate bubble position based on click event
    if (event) {
      const clickX = event.clientX;
      const clickY = event.clientY;

      // Position bubble to the right of the click, with some offset
      const bubbleWidth = 300;
      const offset = 20;

      // Ensure bubble stays within viewport
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let left = clickX + offset;
      let top = clickY;

      // If bubble would go off right edge, position to the left instead
      if (left + bubbleWidth > viewportWidth - 20) {
        left = clickX - bubbleWidth - offset;
      }

      // Ensure top doesn't go below viewport
      if (top > viewportHeight - 400) {
        top = viewportHeight - 400;
      }

      // Ensure top doesn't go above viewport
      if (top < 100) {
        top = 100;
      }

      setBubblePosition({ top, left });
    }

    // Evaluate only first 2 arguments with mock context (ignore 3rd+ params like images)
    const evaluatedArgs = freshCall.args.slice(0, 2).map(arg => {
      try {
        // Create a function that evaluates the argument with mock context
        const func = new Function(...Object.keys(mockContext), `return ${arg}`);
        const result = func(...Object.values(mockContext));
        return String(result);
      } catch (error) {
        // If evaluation fails, return the raw argument
        return arg.replace(/['"]/g, ''); // Remove quotes from string literals
      }
    });

    setTestInputs(evaluatedArgs);
  };

  // Close side panel
  const handleClosePanel = () => {
    setSelectedCall(null);
    setTestResult(null);
  };

  // Execute tool test - calls utils directly for clean, authentic testing
  const handleTest = async () => {
    if (!selectedCall || !selectedToolConfig) return;

    setTestingTool(true);
    setTestResult(null);

    try {
      const toolId = selectedToolConfig.id;

      // Get authentication token for tools that need it
      const getAuthToken = async () => {
        if (!getToken) throw new Error('Authentication not available');
        const token = await getToken();
        if (!token) throw new Error('Failed to retrieve authentication token');
        return token;
      };

      // Execute the appropriate tool function
      switch (toolId) {
        case 'sendEmail': {
          const token = await getAuthToken();
          const email = testInputs[0] || '';
          const message = testInputs[1] || selectedToolConfig.testMessage || '';
          await utils.sendEmail(message, email, token);
          break;
        }

        case 'sendWhatsapp': {
          const token = await getAuthToken();
          const number = testInputs[0] || '';
          const message = testInputs[1] || selectedToolConfig.testMessage || '';
          await utils.sendWhatsapp(message, number, token);
          break;
        }

        case 'sendSms': {
          const token = await getAuthToken();
          const number = testInputs[0] || '';
          const message = testInputs[1] || selectedToolConfig.testMessage || '';
          await utils.sendSms(message, number, token);
          break;
        }

        case 'sendPushover': {
          const token = await getAuthToken();
          const userKey = testInputs[0] || '';
          const message = testInputs[1] || selectedToolConfig.testMessage || '';
          const title = testInputs[2] || 'Test from Observer';
          await utils.sendPushover(message, userKey, token, undefined, title);
          break;
        }

        case 'sendDiscord': {
          const token = await getAuthToken();
          const webhookUrl = testInputs[0] || '';
          const message = testInputs[1] || selectedToolConfig.testMessage || '';
          await utils.sendDiscord(message, webhookUrl, token);
          break;
        }

        case 'sendTelegram': {
          const token = await getAuthToken();
          const chatId = testInputs[0] || '';
          const message = testInputs[1] || selectedToolConfig.testMessage || '';
          await utils.sendTelegram(message, chatId, token);
          break;
        }

        case 'notify': {
          const title = testInputs[0] || 'Test from Observer';
          const message = selectedToolConfig.testMessage || '';
          utils.notify(title, message);
          break;
        }

        case 'ask': {
          const appUrl = 'http://localhost:3838';
          const question = selectedToolConfig.testMessage || '';
          const title = testInputs[1] || 'Test Confirmation';
          const result = await utils.ask(appUrl, title, question);
          setTestResult({
            success: true,
            message: `✓ User responded: ${result ? 'Yes' : 'No'}`
          });
          setTestingTool(false);
          return;
        }

        case 'message': {
          const appUrl = 'http://localhost:3838';
          const message = selectedToolConfig.testMessage || '';
          const title = testInputs[1] || 'Test from Observer';
          await utils.message(appUrl, title, message);
          break;
        }

        case 'system_notify': {
          const appUrl = 'http://localhost:3838';
          const body = selectedToolConfig.testMessage || '';
          const title = testInputs[1] || 'Observer AI Test';
          await utils.system_notify(appUrl, title, body);
          break;
        }

        case 'overlay': {
          const appUrl = 'http://localhost:3838';
          const message = selectedToolConfig.testMessage || '';
          await utils.overlay(appUrl, message);
          break;
        }

        default:
          throw new Error(`Test not implemented for ${toolId}`);
      }

      // Success!
      setTestResult({
        success: true,
        message: `✓ Success! Test ${selectedToolConfig.functionName} executed successfully.`
      });

    } catch (error) {
      // Display the actual error message from the API or tool
      const errorMessage = error instanceof Error ? error.message : String(error);
      setTestResult({
        success: false,
        message: `✗ ${errorMessage}`
      });
    } finally {
      setTestingTool(false);
    }
  };

  if (!isOpen) return null;

  const hasTools = toolCalls.length > 0;

  return (
    <Modal
      open={isOpen}
      onClose={handleClose}
      className="w-full max-w-7xl max-h-[90vh] flex flex-col"
    >
      {/* Header */}
      <div className="flex-shrink-0 flex justify-between items-center p-4 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
        <div className="flex items-center space-x-3">
          <Monitor className="h-6 w-6" />
          <div>
            <h2 className="text-xl font-semibold">Test Tools</h2>
            <p className="text-sm text-blue-100">{agentName}</p>
          </div>
        </div>
        <button
          onClick={handleClose}
          className="p-1.5 rounded-full hover:bg-blue-700 hover:bg-opacity-50 text-indigo-100 hover:text-white transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-grow flex overflow-hidden bg-gray-50 relative">
        {/* Code Display Panel - Full width */}
        <div className="flex-1 overflow-y-auto bg-white">
          <div className="p-6 space-y-4">
            {/* Show info message when no tools detected */}
            {!hasTools && (
              <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <Info className="h-5 w-5 text-blue-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-blue-900">No Observer tools detected</p>
                  <p className="text-xs text-blue-700 mt-0.5">
                    Add tools like <code className="px-1 py-0.5 bg-blue-100 rounded text-xs">sendEmail()</code>, <code className="px-1 py-0.5 bg-blue-100 rounded text-xs">notify()</code>, or <code className="px-1 py-0.5 bg-blue-100 rounded text-xs">getMemory()</code> to test them
                  </p>
                </div>
              </div>
            )}

            {/* Always show code editor */}
            <div className={`rounded-lg overflow-hidden border border-gray-300 shadow-sm ${!isEditing ? 'cm-readonly' : ''}`}>
              <style>{`
                /* Clean code display - only dim when read-only */
                .cm-readonly .cm-editor .cm-content {
                  opacity: 0.7;
                }

                /* Testable tools - blue theme */
                .cm-tool-testable {
                  background: rgba(59, 130, 246, 0.25);
                  border-bottom: 2px solid rgba(59, 130, 246, 0.7);
                  padding: 2px 4px;
                  font-weight: 600;
                  color: rgb(29, 78, 216) !important;
                  opacity: 1 !important;
                  transition: all 0.15s ease;
                  border-radius: 3px;
                  box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.2);
                }
                .cm-tool-testable:hover {
                  background: rgba(59, 130, 246, 0.35);
                  border-bottom-color: rgba(59, 130, 246, 0.9);
                  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3);
                  transform: translateY(-1px);
                }

                /* Info tools - grey theme */
                .cm-tool-info {
                  background: rgba(100, 116, 139, 0.08);
                  border-bottom: 2px solid rgba(100, 116, 139, 0.3);
                  padding: 2px 4px;
                  font-weight: 600;
                  color: rgb(71, 85, 105) !important;
                  opacity: 1 !important;
                  transition: all 0.15s ease;
                  border-radius: 3px;
                }
                .cm-tool-info:hover {
                  background: rgba(100, 116, 139, 0.12);
                  border-bottom-color: rgba(100, 116, 139, 0.4);
                }
              `}</style>
              <CodeMirror
                value={modifiedCode}
                height="450px"
                theme={vscodeDark}
                extensions={[
                  javascript(),
                  // Only add tool highlighting in Easy Mode (not editing)
                  ...(isEditing ? [] : createToolHighlightExtension(toolCalls, handleToolClick)),
                  EditorView.editable.of(isEditing)
                ]}
                onChange={(value) => {
                  setModifiedCode(value);
                }}
                basicSetup={{
                  lineNumbers: true,
                  foldGutter: false,
                  highlightActiveLine: isEditing,
                  highlightActiveLineGutter: isEditing
                }}
                className="text-sm"
              />
            </div>
          </div>
        </div>

        {/* Compact Floating Bubble - Appears near clicked tool */}
        {selectedCall && selectedToolConfig && bubblePosition && (
          <div
            className="fixed bg-white rounded-xl shadow-2xl border border-gray-200 w-72 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200"
            style={{
              top: `${bubblePosition.top}px`,
              left: `${bubblePosition.left}px`,
            }}
          >
            {/* Compact Header */}
            <div className="flex items-center justify-between p-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                {React.createElement(selectedToolConfig.icon, { className: 'w-4 h-4 text-indigo-600 flex-shrink-0' })}
                <span className="font-semibold text-sm text-gray-900">{selectedToolConfig.name.replace('()', '')}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowHelp(!showHelp)}
                  className="p-1 rounded-md hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-700"
                  title="Help"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={handleClosePanel}
                  className="p-1 rounded-md hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Collapsible Help Section */}
            {showHelp && (
              <div className="p-3 bg-gray-50 border-b border-gray-100 text-xs space-y-2">
                <p className="text-gray-700">{selectedToolConfig.description}</p>

                {selectedToolConfig.parameters && selectedToolConfig.parameters.length > 0 && (
                  <div className="space-y-1">
                    {selectedToolConfig.parameters.map((param, idx) => (
                      <div key={idx} className="text-gray-600">
                        <span className="font-mono font-semibold">{param.name}:</span> {param.description}
                      </div>
                    ))}
                  </div>
                )}

                {selectedToolConfig.warning && (
                  <div className="p-2 bg-amber-50 border border-amber-200 rounded text-amber-800">
                    {selectedToolConfig.warning}
                  </div>
                )}

                {selectedToolConfig.infoMessage && (
                  <div className="p-2 bg-blue-50 border border-blue-200 rounded text-blue-700">
                    {selectedToolConfig.infoMessage}
                  </div>
                )}
              </div>
            )}

            {/* Bubble Content */}
            <div className="p-3">
              {selectedToolConfig.isTestable ? (
                <>
                  {/* Compact Parameter Inputs - Only show first 2 parameters */}
                  {selectedToolConfig.parameters && selectedToolConfig.parameters.length > 0 && (
                    <div className="space-y-2 mb-3">
                      {selectedToolConfig.parameters.slice(0, 2).map((param, idx) => (
                        <div key={idx}>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            {param.name}
                          </label>
                          <input
                            type="text"
                            value={testInputs[idx] || ''}
                            onChange={(e) => {
                              const newInputs = [...testInputs];
                              newInputs[idx] = e.target.value;
                              setTestInputs(newInputs);

                              // Live update the code (only first 2 params)
                              if (selectedCall) {
                                const updatedCode = updateCallOnLine(
                                  modifiedCode,
                                  selectedCall.lineNumber,
                                  selectedCall.functionName,
                                  newInputs
                                );
                                setModifiedCode(updatedCode);
                              }
                            }}
                            placeholder={param.description}
                            className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Inline Test Button with States */}
                  <button
                    onClick={handleTest}
                    disabled={testingTool}
                    className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all ${
                      testResult
                        ? testResult.success
                          ? 'bg-green-600 text-white'
                          : 'bg-red-600 text-white'
                        : testingTool
                        ? 'bg-gray-300 text-gray-600 cursor-wait'
                        : 'bg-indigo-600 text-white hover:bg-indigo-700'
                    }`}
                  >
                    {testingTool ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Testing...
                      </>
                    ) : testResult ? (
                      testResult.success ? (
                        <>
                          <CheckCircle className="w-3 h-3" />
                          Success!
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3 h-3" />
                          Failed
                        </>
                      )
                    ) : (
                      <>Test</>
                    )}
                  </button>

                  {/* Brief Error Message */}
                  {testResult && !testResult.success && (
                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-800">
                      {testResult.message}
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* Info Only Badge and Parameters */}
                  <div className="mb-2 px-2 py-1 bg-slate-100 border border-slate-200 rounded text-xs text-slate-700 text-center font-medium">
                    Info Only
                  </div>

                  {selectedToolConfig.parameters && selectedToolConfig.parameters.length > 0 && (
                    <div className="space-y-1.5 text-xs">
                      {selectedToolConfig.parameters.map((param, idx) => (
                        <div key={idx} className="text-gray-600">
                          <span className="font-mono font-semibold text-gray-800">{param.name}</span>
                          <p className="text-gray-500 ml-2">{param.description}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 flex justify-end items-center gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
        <button
          onClick={() => setIsEditing(!isEditing)}
          className={`px-5 py-2 rounded-md text-sm transition-colors ${
            isEditing
              ? 'bg-green-600 text-white hover:bg-green-700'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          {isEditing ? 'Done Editing' : 'Edit'}
        </button>
        <button
          onClick={handleClose}
          className="px-5 py-2 bg-indigo-600 text-white rounded-md text-sm hover:bg-indigo-700"
        >
          Close
        </button>
      </div>
    </Modal>
  );
};

export default ToolsModal;
