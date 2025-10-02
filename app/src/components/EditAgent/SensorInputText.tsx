import React from 'react';

const SENSOR_COLORS: Record<string, string> = {
  SCREEN_OCR: 'text-blue-500 bg-blue-50',
  SCREEN_64: 'text-purple-500 bg-purple-50',
  CAMERA: 'text-purple-500 bg-purple-50',
  CLIPBOARD_TEXT: 'text-slate-500 bg-slate-50',
  MICROPHONE: 'text-slate-500 bg-slate-50',
  SCREEN_AUDIO: 'text-slate-500 bg-slate-50',
  ALL_AUDIO: 'text-slate-500 bg-slate-50',
  IMEMORY: 'text-purple-500 bg-purple-50',
  MEMORY: 'text-green-500 bg-green-50',
};

const highlightPrompt = (text: string) => {
  const parts = text.split(/(\$[A-Z0-9_@]+)/g);
  return parts.map((part, i) => {
    const match = part.match(/^\$([A-Z0-9_@]+)/);
    if (match) {
      const sensorName = match[1].split('@')[0];
      const colorClass = SENSOR_COLORS[sensorName] || 'text-green-500 bg-green-50';
      return <span key={i} className={`font-semibold ${colorClass}`}>{part}</span>;
    }
    return part;
  });
};

interface SensorInputTextProps {
  value: string;
  onChange: (value: string) => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement>;
  className?: string;
  placeholder?: string;
  rows?: number;
}

const SensorInputText: React.FC<SensorInputTextProps> = ({
  value,
  onChange,
  textareaRef,
  className = '',
  placeholder = '',
  rows,
}) => {
  return (
    <div className={`relative ${className}`}>
      <div
        className="absolute inset-0 p-4 font-mono text-sm whitespace-pre-wrap pointer-events-none leading-relaxed overflow-hidden"
        aria-hidden="true"
      >
        {highlightPrompt(value)}
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="w-full h-full p-4 bg-transparent text-transparent caret-blue-500 border border-gray-300 rounded-lg font-mono text-sm resize-none focus:ring-2 focus:ring-blue-500 leading-relaxed"
        placeholder={placeholder}
      />
    </div>
  );
};

export default SensorInputText;
