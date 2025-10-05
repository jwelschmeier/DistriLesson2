import { lazy, Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";

// Lazy load the HelpBot component
const HelpBot = lazy(() => import("./HelpBot").then(module => ({ default: module.HelpBot })));

export function HelpBotButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  const handleOpen = () => {
    setIsMounted(true); // Trigger lazy loading
    setIsOpen(true);
    setIsMinimized(false);
  };

  const handleClose = () => {
    setIsOpen(false);
    setIsMinimized(false);
  };

  const handleMinimize = () => {
    setIsMinimized(!isMinimized);
  };

  return (
    <>
      {!isOpen && (
        <Button
          onClick={handleOpen}
          className="fixed bottom-4 right-4 z-40 h-14 w-14 rounded-full shadow-lg"
          data-testid="button-open-helpbot"
          aria-label="Hilfe-Bot öffnen"
        >
          <MessageCircle className="h-6 w-6" />
        </Button>
      )}
      
      {isMounted && (
        <Suspense fallback={
          <div className="fixed bottom-4 right-4 z-50 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        }>
          <HelpBot
            isOpen={isOpen}
            onClose={handleClose}
            onMinimize={handleMinimize}
            isMinimized={isMinimized}
          />
        </Suspense>
      )}
    </>
  );
}