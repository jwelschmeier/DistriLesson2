import { Sidebar } from "@/components/layout/sidebar";
import { ChatGPTImport } from "@/components/ChatGPTImport";
import { MessageSquare } from "lucide-react";

export default function AdminChatGPT() {
  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 overflow-auto">
        <div className="container mx-auto p-8 space-y-8">
          <div className="flex items-center space-x-2">
            <MessageSquare className="h-6 w-6" />
            <h1 className="text-3xl font-bold" data-testid="heading-chatgpt-import">
              ChatGPT Import
            </h1>
          </div>
          
          <ChatGPTImport />
        </div>
      </div>
    </div>
  );
}