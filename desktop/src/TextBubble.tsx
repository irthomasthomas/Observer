import React, { useState, useEffect } from 'react';
import { HelpCircle } from 'lucide-react';
import './styles/text-bubble.css';

interface TextBubbleProps {
  message: string;
  position?: 'top' | 'right' | 'bottom' | 'left';
  duration?: number; // in milliseconds, 0 for permanent
  icon?: boolean;
}

const TextBubble: React.FC<TextBubbleProps> = ({
  message,
  position = 'top',
  duration = 6000,
  icon = true
}) => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        setVisible(false);
      }, duration);
      
      return () => clearTimeout(timer);
    }
  }, [duration]);

  if (!visible) return null;

  return (
    <div className={`text-bubble ${position}`}>
      {icon && <HelpCircle className="bubble-icon" size={18} />}
      <span className="bubble-text">{message}</span>
    </div>
  );
};

export default TextBubble;
