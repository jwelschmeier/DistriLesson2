import { Sidebar } from "@/components/layout/sidebar";
import { ChatGPTImport } from "@/components/ChatGPTImport";

export default function ChatGPTImportPage() {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="ml-64 p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">ChatGPT Import</h1>
          <p className="text-muted-foreground">
            Stundenplan-Daten mit ChatGPT automatisch importieren
          </p>
        </div>
        <ChatGPTImport />
      </main>
    </div>
  );
}