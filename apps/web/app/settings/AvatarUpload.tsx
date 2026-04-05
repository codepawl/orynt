"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CameraFill, Trash, Upload } from "react-bootstrap-icons";

const API_URL =
  typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:8000"
    : "";

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);
const MAX_SIZE = 2 * 1024 * 1024; // 2 MB

interface AvatarUploadProps {
  currentUrl: string | null;
  username: string;
  token: string;
  onUploaded: (url: string) => void;
  onRemoved: () => void;
}

export function AvatarUpload({
  currentUrl,
  username,
  token,
  onUploaded,
  onRemoved,
}: AvatarUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const displayUrl = preview || currentUrl;

  const validateFile = (file: File): string | null => {
    if (!ALLOWED_TYPES.has(file.type)) {
      return "Only JPG, PNG, GIF, and WebP images are allowed.";
    }
    if (file.size > MAX_SIZE) {
      return "Image must be under 2 MB.";
    }
    return null;
  };

  const uploadFile = useCallback(
    async (file: File) => {
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }

      setError("");
      setPreview(URL.createObjectURL(file));
      setUploading(true);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch(`${API_URL}/api/community/upload-avatar`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.detail || "Upload failed");
        }

        const { url } = await res.json();
        onUploaded(url);
      } catch (err) {
        setPreview(null);
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [token, onUploaded],
  );

  const handleRemove = async () => {
    setError("");
    setUploading(true);
    try {
      await fetch(`${API_URL}/api/community/avatar`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setPreview(null);
      onRemoved();
    } catch {
      setError("Failed to remove avatar");
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  };

  // Paste support
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            uploadFile(file);
          }
          break;
        }
      }
    };

    container.addEventListener("paste", handlePaste);
    return () => container.removeEventListener("paste", handlePaste);
  }, [uploadFile]);

  // Clean up object URLs
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const initials = username?.[0]?.toUpperCase() || "?";

  return (
    <div className="space-y-2">
      <p className="block text-sm font-medium text-neutral-900 dark:text-neutral-100 mb-1.5">
        Avatar
      </p>
      <div className="flex items-center gap-4">
        {/* Avatar circle / drop zone */}
        <div
          ref={containerRef}
          tabIndex={0}
          role="button"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`relative w-24 h-24 rounded-full overflow-hidden cursor-pointer group focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-100 ${
            dragOver
              ? "ring-2 ring-dashed ring-neutral-400 dark:ring-neutral-500"
              : ""
          }`}
        >
          {displayUrl ? (
            <img
              src={displayUrl}
              alt={username}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-3xl font-bold text-neutral-500">
              {initials}
            </div>
          )}

          {/* Hover overlay */}
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            {uploading ? (
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <CameraFill className="w-6 h-6 text-white" />
            )}
          </div>

          {/* Upload spinner overlay */}
          {uploading && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors disabled:opacity-50 cursor-pointer bg-transparent"
          >
            <Upload size={14} />
            Upload image
          </button>
          {displayUrl && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={uploading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-colors disabled:opacity-50 cursor-pointer bg-transparent border-none"
            >
              <Trash size={14} />
              Remove avatar
            </button>
          )}
          <p className="text-xs text-neutral-400">
            JPG, PNG, GIF, or WebP. Max 2 MB.
            <br />
            Click, drag & drop, or paste from clipboard.
          </p>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />

      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}
