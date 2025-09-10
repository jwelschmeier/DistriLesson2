import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, FileText, X, CheckCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  onFileRemove?: () => void;
  accept?: string;
  maxSize?: number;
  multiple?: boolean;
  disabled?: boolean;
  className?: string;
  uploadProgress?: number;
  uploadStatus?: "idle" | "uploading" | "success" | "error";
  errorMessage?: string;
}

export function FileUpload({
  onFileSelect,
  onFileRemove,
  accept = ".csv",
  maxSize = 5 * 1024 * 1024, // 5MB
  multiple = false,
  disabled = false,
  className,
  uploadProgress,
  uploadStatus = "idle",
  errorMessage,
}: FileUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: any[]) => {
    if (rejectedFiles.length > 0) {
      return;
    }

    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      setSelectedFile(file);
      onFileSelect(file);
    }
  }, [onFileSelect]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.csv'],
    },
    maxSize,
    multiple,
    disabled: disabled || uploadStatus === "uploading",
  });

  const handleRemoveFile = () => {
    setSelectedFile(null);
    onFileRemove?.();
  };

  const getStatusIcon = () => {
    switch (uploadStatus) {
      case "uploading":
        return <Upload className="h-8 w-8 text-blue-500 animate-pulse" />;
      case "success":
        return <CheckCircle className="h-8 w-8 text-green-500" />;
      case "error":
        return <AlertCircle className="h-8 w-8 text-red-500" />;
      default:
        return <Upload className="h-8 w-8 text-muted-foreground" />;
    }
  };

  const getStatusMessage = () => {
    switch (uploadStatus) {
      case "uploading":
        return "Datei wird hochgeladen...";
      case "success":
        return "Datei erfolgreich hochgeladen!";
      case "error":
        return errorMessage || "Fehler beim Hochladen der Datei";
      default:
        return "Datei hier ablegen oder klicken zum Auswählen";
    }
  };

  return (
    <div className={cn("space-y-4", className)}>
      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer",
          isDragActive || dragActive
            ? "border-primary bg-primary/5"
            : "border-input hover:border-primary/50",
          disabled && "cursor-not-allowed opacity-50",
          uploadStatus === "error" && "border-red-300 bg-red-50",
          uploadStatus === "success" && "border-green-300 bg-green-50"
        )}
        data-testid="file-upload-dropzone"
      >
        <input {...getInputProps()} data-testid="file-upload-input" />
        
        {selectedFile ? (
          <div className="flex items-center justify-center space-x-3">
            <FileText className="h-8 w-8 text-primary" />
            <div className="text-left">
              <p className="font-medium text-foreground">{selectedFile.name}</p>
              <p className="text-sm text-muted-foreground">
                {(selectedFile.size / 1024).toFixed(1)} KB
              </p>
            </div>
            {uploadStatus !== "uploading" && (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveFile();
                }}
                data-testid="button-remove-file"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {getStatusIcon()}
            <div>
              <p className="text-sm text-muted-foreground mb-2">
                {getStatusMessage()}
              </p>
              <p className="text-xs text-muted-foreground">
                Maximale Dateigröße: {(maxSize / 1024 / 1024).toFixed(1)} MB
              </p>
            </div>
          </div>
        )}
      </div>

      {uploadProgress !== undefined && uploadStatus === "uploading" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Upload-Fortschritt</span>
            <span className="font-medium">{uploadProgress}%</span>
          </div>
          <Progress value={uploadProgress} className="w-full" />
        </div>
      )}

      {uploadStatus === "error" && errorMessage && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      {uploadStatus === "success" && (
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>
            Datei wurde erfolgreich hochgeladen und verarbeitet.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
