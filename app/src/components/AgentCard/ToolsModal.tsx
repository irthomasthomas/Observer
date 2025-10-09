import React, { useState, useEffect, useMemo } from 'react';
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

// Parse code to find all tool calls
function parseToolCalls(code: string): ToolCall[] {
  const calls: ToolCall[] = [];
  const ALL_TOOLS = getAllTools();

  ALL_TOOLS.forEach(tool => {
    // Match function calls: functionName(...args...)
    const regex = new RegExp(`\\b${tool.functionName}\\s*\\(([^)]*)\\)`, 'g');
    let match;

    while ((match = regex.exec(code)) !== null) {
      const fullMatch = match[0];
      const argsString = match[1];

      // Find line number
      const beforeMatch = code.substring(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;

      // Parse arguments (simple split by comma, handles basic cases)
      const args = argsString
        ? argsString.split(',').map(arg => arg.trim()).filter(arg => arg.length > 0)
        : [];

      // Create unique ID for this call
      const callId = `${tool.id}_line${lineNumber}_${match.index}`;

      calls.push({
        id: callId,
        toolId: tool.id,
        functionName: tool.functionName,
        args,
        lineNumber,
        startIndex: match.index,
        endIndex: match.index + fullMatch.length,
        isTestable: tool.isTestable
      });
    }
  });

  // Sort by position in code
  return calls.sort((a, b) => a.startIndex - b.startIndex);
}

// Create CodeMirror extension for highlighting and clicking tools
function createToolHighlightExtension(toolCalls: ToolCall[], onToolClick: (call: ToolCall) => void) {
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
          onToolClick(tool);
          event.preventDefault();
          return true;
        }
      }
      return false;
    }
  });

  return [toolDecorations, clickHandler];
}

const ToolsModal: React.FC<ToolsModalProps> = ({ isOpen, onClose, code, agentName, getToken }) => {
  const [selectedCall, setSelectedCall] = useState<ToolCall | null>(null);
  const [testInputs, setTestInputs] = useState<string[]>([]);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testingTool, setTestingTool] = useState<boolean>(false);

  // Parse tool calls from code
  const toolCalls = useMemo(() => parseToolCalls(code), [code]);

  // Get selected tool config
  const selectedToolConfig = selectedCall
    ? getAllTools().find(t => t.id === selectedCall.toolId)
    : null;

  // Mock context for evaluating arguments
  const mockContext = useMemo(() => ({
    response: "This is the model's response from Observer AI",
    agentId: "current-agent-id",
    screen: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", // 1x1 red pixel placeholder
    camera: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", // 1x1 red pixel placeholder
    images: [] as string[],
    imemory: [] as string[]
  }), []);

  // When a tool is clicked, evaluate its arguments and populate inputs
  const handleToolClick = (call: ToolCall) => {
    setSelectedCall(call);
    setTestResult(null);

    // Evaluate arguments with mock context
    const evaluatedArgs = call.args.map(arg => {
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
      onClose={onClose}
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
          onClick={onClose}
          className="p-1.5 rounded-full hover:bg-blue-700 hover:bg-opacity-50 text-indigo-100 hover:text-white transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-grow flex overflow-hidden bg-gray-50">
        {/* Code Display Panel */}
        <div
          className={`overflow-y-auto bg-gradient-to-br from-gray-50 to-gray-100 border-r border-gray-300 transition-all duration-300 ease-in-out ${
            selectedCall ? 'w-3/5' : 'w-full'
          }`}
        >
          <div className="p-6 space-y-4">
            {!hasTools && (
              <div className="text-center py-12">
                <Info className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-500">No Observer tools detected in agent code</p>
                <p className="text-sm text-gray-400 mt-2">Add tools like sendEmail(), notify(), or getMemory() to test them here</p>
              </div>
            )}

            {hasTools && (
              <>
                <div className="mb-4 flex items-center gap-4 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(59, 130, 246, 0.2)' }}></div>
                    <span>Click <span className="font-semibold text-blue-600">blue tools</span> to test</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(100, 116, 139, 0.2)' }}></div>
                    <span><span className="font-semibold text-slate-600">Grey tools</span> for info</span>
                  </div>
                </div>

                <div className="rounded-lg overflow-hidden border border-gray-700 shadow-lg">
                  <style>{`
                    /* Mute the base CodeMirror text */
                    .cm-editor .cm-content {
                      opacity: 0.6;
                    }

                    /* Make tool highlights vibrant and stand out */
                    .cm-tool-testable {
                      background: linear-gradient(135deg, rgba(59, 130, 246, 0.4), rgba(37, 99, 235, 0.4));
                      border: 1px solid rgba(59, 130, 246, 0.6);
                      border-radius: 4px;
                      padding: 2px 4px;
                      font-weight: 700;
                      color: rgb(30, 64, 175) !important;
                      opacity: 1 !important;
                      box-shadow: 0 0 8px rgba(59, 130, 246, 0.3);
                      transition: all 0.2s ease;
                    }
                    .cm-tool-testable:hover {
                      background: linear-gradient(135deg, rgba(59, 130, 246, 0.6), rgba(37, 99, 235, 0.6));
                      box-shadow: 0 0 12px rgba(59, 130, 246, 0.5);
                      transform: translateY(-1px);
                    }

                    .cm-tool-info {
                      background: linear-gradient(135deg, rgba(148, 163, 184, 0.4), rgba(100, 116, 139, 0.4));
                      border: 1px solid rgba(148, 163, 184, 0.6);
                      border-radius: 4px;
                      padding: 2px 4px;
                      font-weight: 700;
                      color: rgb(51, 65, 85) !important;
                      opacity: 1 !important;
                      box-shadow: 0 0 8px rgba(100, 116, 139, 0.3);
                      transition: all 0.2s ease;
                    }
                    .cm-tool-info:hover {
                      background: linear-gradient(135deg, rgba(148, 163, 184, 0.6), rgba(100, 116, 139, 0.6));
                      box-shadow: 0 0 12px rgba(100, 116, 139, 0.5);
                      transform: translateY(-1px);
                    }
                  `}</style>
                  <CodeMirror
                    value={code}
                    height="400px"
                    theme={vscodeDark}
                    extensions={[
                      javascript(),
                      ...createToolHighlightExtension(toolCalls, handleToolClick),
                      EditorView.editable.of(false)
                    ]}
                    basicSetup={{
                      lineNumbers: true,
                      foldGutter: false,
                      highlightActiveLine: false,
                      highlightActiveLineGutter: false
                    }}
                    className="text-sm"
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Side Panel (slides in from right) */}
        <div
          className={`overflow-hidden bg-gradient-to-b from-gray-50 to-white border-l border-gray-200 transition-all duration-300 ease-in-out ${
            selectedCall ? 'w-2/5' : 'w-0'
          }`}
        >
          {selectedCall && selectedToolConfig && (
            <div className="h-full overflow-y-auto">
              {/* Panel Header */}
              <div className="sticky top-0 z-10 bg-gradient-to-r from-indigo-600 to-blue-600 text-white p-4 shadow-md">
                <div className="flex justify-between items-start">
                  <div className="flex items-start gap-3 flex-1">
                    {React.createElement(selectedToolConfig.icon, { className: 'w-6 h-6 flex-shrink-0 mt-0.5' })}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold truncate">{selectedToolConfig.name}</h3>
                      <p className="text-sm text-indigo-100 mt-0.5">{selectedToolConfig.description}</p>
                    </div>
                  </div>
                  <button
                    onClick={handleClosePanel}
                    className="p-1.5 rounded-full hover:bg-white/20 transition-colors flex-shrink-0 ml-2"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="p-6">

              {/* Testable Tool Panel */}
              {selectedToolConfig.isTestable && (
                <>
                  {/* Show the actual call from code */}
                  <div className="mb-6 p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Code Reference</p>
                    <code className="text-sm text-gray-800 font-mono block bg-gray-50 p-2 rounded border border-gray-200">
                      {selectedCall.functionName}({selectedCall.args.join(', ')})
                    </code>
                  </div>

                  {/* Warning message */}
                  {selectedToolConfig.warning && (
                    <div className="mb-4 p-3 bg-yellow-50 border-l-4 border-yellow-400 rounded-r-md">
                      <p className="text-sm text-yellow-800">{selectedToolConfig.warning}</p>
                    </div>
                  )}

                  {/* Info message */}
                  {selectedToolConfig.infoMessage && (
                    <div className="mb-4 p-3 bg-blue-50 border-l-4 border-blue-400 rounded-r-md">
                      <p className="text-sm text-blue-800">{selectedToolConfig.infoMessage}</p>
                    </div>
                  )}

                  {/* Editable Arguments */}
                  {selectedToolConfig.parameters && selectedToolConfig.parameters.length > 0 && (
                    <div className="mb-6 space-y-4">
                      <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Test Parameters</h4>
                      {selectedToolConfig.parameters.map((param, idx) => (
                        <div key={idx}>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            {param.name}
                            <span className="text-xs text-gray-500 font-normal ml-2">({param.description})</span>
                          </label>
                          <input
                            type="text"
                            value={testInputs[idx] || ''}
                            onChange={(e) => {
                              const newInputs = [...testInputs];
                              newInputs[idx] = e.target.value;
                              setTestInputs(newInputs);
                            }}
                            placeholder={param.description}
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm transition-all shadow-sm hover:border-gray-400"
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Test Button */}
                  <button
                    onClick={handleTest}
                    disabled={testingTool}
                    className={`w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-lg font-semibold transition-all shadow-md ${
                      testingTool
                        ? 'bg-amber-500 text-white cursor-wait shadow-amber-200'
                        : 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white hover:from-indigo-700 hover:to-blue-700 hover:shadow-lg active:scale-98'
                    }`}
                  >
                    {testingTool ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Testing...
                      </>
                    ) : (
                      <>
                        <PlayCircle className="w-5 h-5" />
                        Run Test
                      </>
                    )}
                  </button>

                  {/* Test Results */}
                  {testResult && (
                    <div className={`mt-6 p-4 rounded-lg border-l-4 shadow-sm ${
                      testResult.success
                        ? 'bg-green-50 border-green-500'
                        : 'bg-red-50 border-red-500'
                    }`}>
                      <div className="flex items-start gap-3">
                        {testResult.success ? (
                          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                        )}
                        <p className={`text-sm font-medium ${
                          testResult.success ? 'text-green-800' : 'text-red-800'
                        }`}>
                          {testResult.message}
                        </p>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Info Tool Panel (non-testable) */}
              {!selectedToolConfig.isTestable && (
                <>
                  {/* Show the actual call from code */}
                  <div className="mb-6 p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Code Reference</p>
                    <code className="text-sm text-gray-800 font-mono block bg-gray-50 p-2 rounded border border-gray-200">
                      {selectedCall.functionName}({selectedCall.args.join(', ')})
                    </code>
                  </div>

                  {/* Parameters Info */}
                  {selectedToolConfig.parameters && selectedToolConfig.parameters.length > 0 && (
                    <div className="mb-6 p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
                      <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Parameters</h4>
                      <div className="space-y-3">
                        {selectedToolConfig.parameters.map((param, idx) => (
                          <div key={idx} className="flex gap-3 items-start">
                            <div className="w-2 h-2 rounded-full bg-indigo-500 mt-1.5 flex-shrink-0"></div>
                            <div className="flex-1">
                              <span className="text-sm font-mono font-semibold text-gray-800">{param.name}</span>
                              <p className="text-sm text-gray-600 mt-0.5">{param.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Info message */}
                  <div className="p-4 bg-blue-50 border-l-4 border-blue-500 rounded-r-lg shadow-sm">
                    <div className="flex gap-3">
                      <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-blue-800 font-medium">
                        This tool cannot be tested directly as it interacts with agent state or system resources.
                      </p>
                    </div>
                  </div>
                </>
              )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 flex justify-between items-center px-6 py-4 border-t border-gray-200 bg-gradient-to-r from-gray-50 to-white">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
          <span className="font-medium">{toolCalls.length}</span>
          <span>tool call{toolCalls.length !== 1 ? 's' : ''} detected</span>
        </div>
        <button
          onClick={onClose}
          className="px-6 py-2.5 bg-gradient-to-r from-gray-700 to-gray-800 text-white rounded-lg text-sm font-medium hover:from-gray-800 hover:to-gray-900 transition-all shadow-md hover:shadow-lg"
        >
          Close
        </button>
      </div>
    </Modal>
  );
};

export default ToolsModal;
