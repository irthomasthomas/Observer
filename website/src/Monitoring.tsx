import React, { useState, useEffect } from 'react';

const Monitoring = () => {
  const [terminalLines, setTerminalLines] = useState<Array<{ text: string; completed: boolean }>>([]);
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [currentCharIndex, setCurrentCharIndex] = useState(0);

  const lines = [
    {
      prompt: '❯',
      command: 'observer status',
      color: 'text-cyan-400'
    },
    {
      prompt: '✓',
      command: 'Observer Agent: API Health Monitor',
      color: 'text-green-400',
      isOutput: true
    },
    {
      prompt: '→',
      command: 'Target: status.observer-ai.com',
      color: 'text-blue-400',
      isOutput: true
    },
    {
      prompt: '⏱',
      command: 'Interval: 10 minutes',
      color: 'text-purple-400',
      isOutput: true
    },
    {
      prompt: '🔔',
      command: 'Discord notifications: Enabled',
      color: 'text-yellow-400',
      isOutput: true
    },
    {
      prompt: '🟢',
      command: 'Status: ONLINE',
      color: 'text-green-400',
      isOutput: true
    }
  ];

  useEffect(() => {
    if (currentLineIndex >= lines.length) return;

    const currentLine = lines[currentLineIndex];
    const fullText = `${currentLine.prompt} ${currentLine.command}`;

    if (currentCharIndex < fullText.length) {
      const timeout = setTimeout(() => {
        setCurrentCharIndex(currentCharIndex + 1);
      }, 30); // Typing speed
      return () => clearTimeout(timeout);
    } else {
      // Line completed, move to next line after a brief pause
      const timeout = setTimeout(() => {
        setTerminalLines(prev => [...prev, {
          text: fullText,
          completed: true,
          color: currentLine.color,
          isOutput: currentLine.isOutput
        }]);
        setCurrentLineIndex(currentLineIndex + 1);
        setCurrentCharIndex(0);
      }, 200);
      return () => clearTimeout(timeout);
    }
  }, [currentCharIndex, currentLineIndex]);

  const currentLine = lines[currentLineIndex];
  const currentText = currentLine ? `${currentLine.prompt} ${currentLine.command}`.slice(0, currentCharIndex) : '';

  return (
    <section className="py-20 bg-gradient-to-b from-gray-800 to-gray-900">
      <div className="container mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-white mb-4">Observer Monitoring Observer</h2>
          <p className="text-gray-400 max-w-2xl mx-auto">
            Yes, we use Observer to monitor our own infrastructure. Watch it in action.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-6xl mx-auto">
          {/* Terminal Section */}
          <div className="bg-[#1e1e2e] rounded-lg overflow-hidden border border-gray-700 shadow-2xl">
            {/* Terminal Header */}
            <div className="bg-[#2a2a3a] px-4 py-3 flex items-center space-x-2 border-b border-gray-700">
              <div className="flex space-x-2">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
              </div>
              <span className="text-gray-400 text-sm ml-4 font-mono">observer-ai/monitoring</span>
            </div>

            {/* Terminal Content */}
            <div className="p-6 font-mono text-sm min-h-[320px]">
              {terminalLines.map((line, index) => (
                <div key={index} className={`${line.color} mb-2 ${line.isOutput ? 'ml-4' : ''}`}>
                  {line.text}
                </div>
              ))}
              {currentLineIndex < lines.length && (
                <div className={`${currentLine?.color} mb-2 ${currentLine?.isOutput ? 'ml-4' : ''}`}>
                  {currentText}
                  <span className="inline-block w-2 h-4 bg-white ml-1 animate-pulse"></span>
                </div>
              )}
            </div>
          </div>

          {/* Screenshot Section */}
          <div className="bg-[#1e1e2e] rounded-lg overflow-hidden border border-gray-700 shadow-2xl">
            {/* Live Indicator */}
            <div className="bg-[#2a2a3a] px-4 py-3 flex items-center justify-between border-b border-gray-700">
              <div className="flex items-center space-x-2">
                <div className="relative">
                  <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse"></div>
                  <div className="absolute inset-0 w-3 h-3 rounded-full bg-red-500 animate-ping"></div>
                </div>
                <span className="text-red-400 text-sm font-bold font-mono">LIVE</span>
              </div>
              <a
                href="https://status.observer-ai.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-white text-sm transition"
              >
                status.observer-ai.com →
              </a>
            </div>

            {/* Screenshot */}
            <div className="p-4">
              <img
                src="/monitoring.png"
                alt="Observer monitoring dashboard"
                className="w-full h-auto rounded border border-gray-600"
              />
            </div>

            {/* Footer Links */}
            <div className="bg-[#2a2a3a] px-4 py-3 border-t border-gray-700">
              <div className="flex items-center justify-center space-x-4 text-sm">
                <a
                  href="https://discord.gg/wnBb7ZQDUC"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 transition"
                >
                  Watch live in Discord
                </a>
                <span className="text-gray-600">•</span>
                <a
                  href="https://app.observer-ai.com"
                  className="text-purple-400 hover:text-purple-300 transition"
                >
                  Build your own agent
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Monitoring;
