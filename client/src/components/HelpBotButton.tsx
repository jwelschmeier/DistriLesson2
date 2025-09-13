import { useState } from "react";
import { Button } from "@/components/ui/button";
import { HelpBot } from "./HelpBot";
import { MessageCircle } from "lucide-react";

export function HelpBotButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  const handleOpen = () => {
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
        >
          <MessageCircle className="h-6 w-6" />
        </Button>
      )}
      
      <HelpBot
        isOpen={isOpen}
        onClose={handleClose}
        onMinimize={handleMinimize}
        isMinimized={isMinimized}
      />
    </>
  );
}