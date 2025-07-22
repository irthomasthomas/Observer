import { useState, useEffect } from 'react';
import { Moon, Sun } from 'lucide-react';
import { themeManager, type Theme } from '../utils/theme';

const ThemeToggle: React.FC = () => {
  const [theme, setTheme] = useState<Theme>(themeManager.getTheme());

  useEffect(() => {
    const unsubscribe = themeManager.subscribe(setTheme);
    return unsubscribe;
  }, []);

  const handleToggle = () => {
    themeManager.toggleTheme();
  };

  return (
    <button
      onClick={handleToggle}
      className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200"
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
      title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
    >
      {theme === 'light' ? (
        <Moon className="h-5 w-5 text-gray-600 dark:text-gray-300" />
      ) : (
        <Sun className="h-5 w-5 text-gray-600 dark:text-gray-300" />
      )}
    </button>
  );
};

export default ThemeToggle;