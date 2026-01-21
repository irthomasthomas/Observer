// src/components/InteractiveTutorial.tsx

import React, { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { X as CloseIcon, Sparkles, Wrench, Play } from 'lucide-react';
import { Logger } from '@utils/logging';

export type TutorialStep = {
  id: string;
  targetSelector?: string; // CSS selector for the element to highlight (optional for non-spotlight steps)
  title: string;
  message: string;
  icon?: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center' | 'top-left'; // 'center' for floating messages, 'top-left' for corner
  action?: 'click' | 'auto'; // 'click' = user must click the highlighted element, 'auto' = auto-advance
  waitForEvent?: string; // Custom event name to wait for before advancing
  noSpotlight?: boolean; // If true, shows message without highlighting any element
  noOverlay?: boolean; // If true, doesn't show any background overlay (allows full interaction)
};

interface InteractiveTutorialProps {
  isActive: boolean;
  onComplete: () => void;
  onDismiss: () => void;
  agentId: string;
  hasPhoneTools: boolean;
}

export const InteractiveTutorial: React.FC<InteractiveTutorialProps> = ({
  isActive,
  onComplete,
  onDismiss,
  agentId,
  hasPhoneTools,
}) => {
  const { user } = useAuth0();
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [isTemporarilyHidden, setIsTemporarilyHidden] = useState(false);

  // Define tutorial steps
  const steps: TutorialStep[] = [
    {
      id: 'welcome',
      targetSelector: `[data-tutorial-agent-card="${agentId}"]`,
      title: 'This is your first agent!',
      message: 'See the timer? It runs in a loop - every few seconds it observes, thinks, acts, then waits to loop again!',
      icon: <Sparkles className="h-6 w-6 text-blue-500" />,
      position: 'bottom',
      action: 'auto',
    },
    {
      id: 'show-tools',
      targetSelector: `[data-tutorial-tools-button="${agentId}"]`,
      title: 'This is what your agent will do',
      message: 'Click the Tools button to see what your agent can do',
      icon: <Wrench className="h-6 w-6 text-purple-500" />,
      position: 'right',
      action: 'click',
    },
    {
      id: 'test-tools',
      targetSelector: '[data-tutorial-tool-card]',
      title: 'Test Your Tools',
      message: 'Click on any tool card to see what it does and test it out!',
      icon: <Wrench className="h-6 w-6 text-purple-500" />,
      position: 'right',
      action: 'click',
    },
    {
      id: 'tools-done',
      title: 'Great!',
      message: hasPhoneTools
        ? 'Test more tools if you want, or close this modal when you\'re ready. Note: Phone tools will require verification when you start your agent.'
        : 'Test more tools if you want, or close this modal when you\'re ready to continue.',
      icon: <Wrench className="h-6 w-6 text-purple-500" />,
      position: 'top-left',
      action: 'auto',
      waitForEvent: 'toolsModalClosed',
      noSpotlight: true,
      noOverlay: true,
    },
    {
      id: 'start',
      targetSelector: `[data-tutorial-start-button="${agentId}"]`,
      title: 'Start Your Agent',
      message: 'Now click here to start your agent and watch it work!',
      icon: <Play className="h-6 w-6 text-green-500" />,
      position: 'right',
      action: 'click',
    },
  ];

  const currentStepData = steps[currentStep];

  const handleComplete = () => {
    if (dontShowAgain && user && 'sub' in user && user.sub) {
      localStorage.setItem(`observer_tutorial_dismissed_${user.sub}`, 'true');
      Logger.info('TUTORIAL', 'User completed tutorial with "Don\'t show again"');
    }
    onComplete();
  };

  const advanceStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handleDismiss = () => {
    // Special case: if user closes on step 3 (index 2), hide tutorial, wait for modal to close, then show step 4
    if (currentStep === 2) {
      Logger.info('TUTORIAL', 'User closed step 3, hiding tutorial until modal closes');
      setIsTemporarilyHidden(true);
      advanceStep();
      // Listen for modal close event to show tutorial again
      const handleModalClosed = () => {
        setIsTemporarilyHidden(false);
      };
      window.addEventListener('toolsModalClosed', handleModalClosed, { once: true });
      return;
    }

    if (dontShowAgain && user && 'sub' in user && user.sub) {
      localStorage.setItem(`observer_tutorial_dismissed_${user.sub}`, 'true');
      Logger.info('TUTORIAL', 'User dismissed tutorial with "Don\'t show again"');
    }
    onDismiss();
  };

  // Update target element position
  useEffect(() => {
    if (!isActive || !currentStepData) return;

    // Skip if this is a non-spotlight step
    if (currentStepData.noSpotlight || !currentStepData.targetSelector) {
      setTargetRect(null);
      return;
    }

    const updateTargetPosition = () => {
      const element = document.querySelector(currentStepData.targetSelector!);
      if (element) {
        const rect = element.getBoundingClientRect();
        setTargetRect(rect);
      }
    };

    // Initial update
    updateTargetPosition();

    // Continuous updates using requestAnimationFrame for smooth tracking
    let rafId: number;
    const continuousUpdate = () => {
      updateTargetPosition();
      rafId = requestAnimationFrame(continuousUpdate);
    };
    rafId = requestAnimationFrame(continuousUpdate);

    // Update on scroll/resize as backup
    window.addEventListener('scroll', updateTargetPosition, true);
    window.addEventListener('resize', updateTargetPosition);

    // Observe DOM changes in case element moves
    const observer = new MutationObserver(updateTargetPosition);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', updateTargetPosition, true);
      window.removeEventListener('resize', updateTargetPosition);
      observer.disconnect();
    };
  }, [isActive, currentStepData]);

  // Listen for custom events to advance tutorial
  useEffect(() => {
    const eventName = currentStepData?.waitForEvent;
    if (!isActive || !eventName) return;

    const handleEvent = () => {
      advanceStep();
    };

    window.addEventListener(eventName, handleEvent);

    return () => {
      window.removeEventListener(eventName, handleEvent);
    };
  }, [isActive, currentStepData]);

  // Listen for ESC key to dismiss tutorial
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleDismiss();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isActive]);

  // Allow users to temporarily dismiss the welcome step by clicking inside the agent card
  useEffect(() => {
    if (
      !isActive ||
      currentStepData?.id !== 'welcome' ||
      !currentStepData.targetSelector ||
      isTemporarilyHidden
    ) {
      return;
    }

    const handleAgentCardClick = (event: Event) => {
      const target = event.target as HTMLElement;
      const highlightedElement = document.querySelector(currentStepData.targetSelector!);

      if (highlightedElement && (highlightedElement === target || highlightedElement.contains(target))) {
        Logger.info('TUTORIAL', 'User clicked inside agent card on welcome step, hiding until tools modal opens');
        setIsTemporarilyHidden(true);

        const handleToolsModalOpened = () => {
          const resumeIndex = steps.findIndex(step => step.id === 'test-tools');
          if (resumeIndex !== -1) {
            Logger.info('TUTORIAL', 'Tools modal opened, resuming tutorial at "Test Your Tools" step');
            setCurrentStep(resumeIndex);
          }
          setIsTemporarilyHidden(false);
        };

        window.addEventListener('toolsModalOpened', handleToolsModalOpened, { once: true });
      }
    };

    document.addEventListener('click', handleAgentCardClick, true);

    return () => {
      document.removeEventListener('click', handleAgentCardClick, true);
    };
  }, [isActive, currentStepData, isTemporarilyHidden, steps]);

  // Handle clicks on highlighted elements
  useEffect(() => {
    if (!isActive || currentStepData?.action !== 'click' || !currentStepData.targetSelector) return;

    const handleClick = (e: Event) => {
      const target = e.target as HTMLElement;
      const highlightedElement = document.querySelector(currentStepData.targetSelector!);
      const clickedInside = highlightedElement && (highlightedElement === target || highlightedElement.contains(target));

      if (clickedInside) {
        // User clicked the highlighted element - advance tutorial
        currentStep === steps.length - 1 ? handleComplete() : advanceStep();
      } else if (currentStepData.id === 'test-tools') {
        // Step 3 special case: clicking outside the tool card dismisses
        handleDismiss();
      }
    };

    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [isActive, currentStep, currentStepData]);

  if (!isActive || !currentStepData || isTemporarilyHidden) {
    return null;
  }

  // Calculate speech bubble position
  const getBubbleStyle = (): React.CSSProperties => {
    const padding = 20;
    const bubbleWidth = 320;
    const isMobile = window.innerWidth < 768;
    const position = currentStepData.position || 'right';

    // Handle top-left positioning
    if (position === 'top-left') {
      return {
        top: padding,
        left: padding,
        right: padding,
      };
    }

    // Center position for non-spotlight steps or center position
    if (position === 'center' || (currentStepData.noSpotlight && !targetRect)) {
      return {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      };
    }

    // For spotlight steps, position relative to target
    if (!targetRect) {
      return {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      };
    }

    // On mobile, position at the top with padding
    if (isMobile) {
      return {
        top: padding,
        left: padding,
        right: padding,
      };
    }

    // Desktop positioning
    switch (position) {
      case 'right':
        // Check if bubble would go off-screen on the right
        if (targetRect.right + bubbleWidth + padding * 2 > window.innerWidth) {
          // Position on left instead
          return {
            left: targetRect.left - bubbleWidth - padding,
            top: targetRect.top + targetRect.height / 2,
            transform: 'translateY(-50%)',
          };
        }
        return {
          left: targetRect.right + padding,
          top: targetRect.top + targetRect.height / 2,
          transform: 'translateY(-50%)',
        };
      case 'left':
        // Check if bubble would go off-screen on the left
        if (targetRect.left - bubbleWidth - padding < 0) {
          // Position on right instead
          return {
            left: targetRect.right + padding,
            top: targetRect.top + targetRect.height / 2,
            transform: 'translateY(-50%)',
          };
        }
        return {
          left: targetRect.left - bubbleWidth - padding,
          top: targetRect.top + targetRect.height / 2,
          transform: 'translateY(-50%)',
        };
      case 'top':
        return {
          left: targetRect.left + targetRect.width / 2,
          top: targetRect.top - padding,
          transform: 'translate(-50%, -100%)',
        };
      case 'bottom':
        return {
          left: targetRect.left + targetRect.width / 2,
          top: targetRect.bottom + padding,
          transform: 'translateX(-50%)',
        };
      default:
        return {
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        };
    }
  };

  const getArrowClass = () => {
    const isMobile = window.innerWidth < 768;

    // No arrow for mobile, center, non-spotlight, or top-left steps
    if (isMobile || currentStepData.noSpotlight || currentStepData.position === 'center' || currentStepData.position === 'top-left') {
      return '';
    }

    const position = currentStepData.position || 'right';

    // Check if we flipped the position due to screen bounds
    if (position === 'right' && targetRect) {
      const bubbleWidth = 320;
      const padding = 20;
      if (targetRect.right + bubbleWidth + padding * 2 > window.innerWidth) {
        return 'arrow-right'; // We flipped to left, so arrow points right
      }
      return 'arrow-left';
    }

    if (position === 'left' && targetRect) {
      const bubbleWidth = 320;
      const padding = 20;
      if (targetRect.left - bubbleWidth - padding < 0) {
        return 'arrow-left'; // We flipped to right, so arrow points left
      }
      return 'arrow-right';
    }

    switch (position) {
      case 'top':
        return 'arrow-bottom';
      case 'bottom':
        return 'arrow-top';
      default:
        return '';
    }
  };

  return (
    <>
      {/* Secondary highlight for loop timer on welcome step */}
      {currentStepData.id === 'welcome' && (
        <style>{`
          [data-tutorial-loop-timer] {
            position: relative;
            animation: timer-pulse 2s ease-in-out infinite;
          }
          @keyframes timer-pulse {
            0%, 100% {
              box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.6);
              background-color: rgba(59, 130, 246, 0.1);
              border-radius: 6px;
            }
            50% {
              box-shadow: 0 0 0 6px rgba(59, 130, 246, 0.3);
              background-color: rgba(59, 130, 246, 0.2);
              border-radius: 6px;
            }
          }
        `}</style>
      )}

      {/* Overlay with spotlight effect - only render if not a no-spotlight step */}
      {targetRect && !currentStepData.noSpotlight && (
        <>
          {/* Top bar */}
          <div
            className="fixed left-0 right-0 bg-black bg-opacity-5 z-[100] pointer-events-auto"
            style={{
              top: 0,
              height: targetRect.top - 4,
            }}
            onClick={handleDismiss}
          />

          {/* Bottom bar */}
          <div
            className="fixed left-0 right-0 bg-black bg-opacity-5 z-[100] pointer-events-auto"
            style={{
              top: targetRect.bottom + 4,
              bottom: 0,
            }}
            onClick={handleDismiss}
          />

          {/* Left bar */}
          <div
            className="fixed left-0 bg-black bg-opacity-5 z-[100] pointer-events-auto"
            style={{
              top: targetRect.top - 4,
              bottom: window.innerHeight - (targetRect.bottom + 4),
              width: targetRect.left - 4,
            }}
            onClick={handleDismiss}
          />

          {/* Right bar */}
          <div
            className="fixed right-0 bg-black bg-opacity-5 z-[100] pointer-events-auto"
            style={{
              top: targetRect.top - 4,
              bottom: window.innerHeight - (targetRect.bottom + 4),
              left: targetRect.right + 4,
            }}
            onClick={handleDismiss}
          />

          {/* Pulsing border around spotlight */}
          <div
            className="fixed pointer-events-none z-[101]"
            style={{
              left: targetRect.left - 4,
              top: targetRect.top - 4,
              width: targetRect.width + 8,
              height: targetRect.height + 8,
              borderRadius: '8px',
              boxShadow: '0 0 0 4px rgba(59, 130, 246, 0.5)',
              animation: 'pulse 2s ease-in-out infinite',
            }}
          />
        </>
      )}

      {/* Gentle overlay for no-spotlight steps (unless noOverlay is true) */}
      {currentStepData.noSpotlight && !currentStepData.noOverlay && (
        <div
          className="fixed inset-0 bg-black bg-opacity-5 z-[100] pointer-events-auto"
          onClick={handleDismiss}
        />
      )}

      {/* Speech bubble */}
      <div
        className={`fixed z-[101] pointer-events-auto bg-white rounded-xl shadow-2xl p-6 ${getArrowClass()}`}
        style={{
          ...getBubbleStyle(),
          ...(window.innerWidth >= 768 && { width: '320px' }),
          maxWidth: 'calc(100vw - 40px)',
        }}
      >
        {/* Close button */}
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-700 transition-colors"
        >
          <CloseIcon className="h-5 w-5" />
        </button>

        {/* Content */}
        <div className="mb-4">
          <div className="flex items-center space-x-2 mb-2">
            {currentStepData.icon}
            <h3 className="text-lg font-bold text-gray-900">
              {currentStepData.title}
            </h3>
          </div>
          <p className="text-sm text-gray-700 leading-relaxed">
            {currentStepData.message}
          </p>
        </div>

        {/* Progress indicator */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex space-x-2">
            {steps.map((_, index) => (
              <div
                key={index}
                className={`h-2 w-8 rounded-full transition-colors ${
                  index === currentStep
                    ? 'bg-blue-600'
                    : index < currentStep
                    ? 'bg-blue-300'
                    : 'bg-gray-300'
                }`}
              />
            ))}
          </div>
          <span className="text-xs text-gray-500">
            {currentStep + 1} of {steps.length}
          </span>
        </div>

        {/* Next button for auto-advance steps */}
        {currentStepData.action === 'auto' && !currentStepData.waitForEvent && (
          <button
            onClick={advanceStep}
            className="w-full mb-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            Next
          </button>
        )}

        {/* Don't show again checkbox (on first step, or last two steps) */}
        {(currentStep === 0 || currentStep >= steps.length - 2) && (
          <div className="pt-3 border-t border-gray-200">
            <label className="flex items-center cursor-pointer text-xs text-gray-600 hover:text-gray-800 transition-colors">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                className="mr-2 h-3 w-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Don't show this tutorial again
            </label>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% {
            box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.5), 0 0 0 9999px rgba(0, 0, 0, 0.7);
          }
          50% {
            box-shadow: 0 0 0 8px rgba(59, 130, 246, 0.3), 0 0 0 9999px rgba(0, 0, 0, 0.7);
          }
        }

        .arrow-left::before {
          content: '';
          position: absolute;
          left: -8px;
          top: 50%;
          transform: translateY(-50%);
          width: 0;
          height: 0;
          border-top: 8px solid transparent;
          border-bottom: 8px solid transparent;
          border-right: 8px solid white;
        }

        .arrow-right::before {
          content: '';
          position: absolute;
          right: -8px;
          top: 50%;
          transform: translateY(-50%);
          width: 0;
          height: 0;
          border-top: 8px solid transparent;
          border-bottom: 8px solid transparent;
          border-left: 8px solid white;
        }

        .arrow-top::before {
          content: '';
          position: absolute;
          top: -8px;
          left: 50%;
          transform: translateX(-50%);
          width: 0;
          height: 0;
          border-left: 8px solid transparent;
          border-right: 8px solid transparent;
          border-bottom: 8px solid white;
        }

        .arrow-bottom::before {
          content: '';
          position: absolute;
          bottom: -8px;
          left: 50%;
          transform: translateX(-50%);
          width: 0;
          height: 0;
          border-left: 8px solid transparent;
          border-right: 8px solid transparent;
          border-top: 8px solid white;
        }
      `}</style>
    </>
  );
};

export default InteractiveTutorial;
