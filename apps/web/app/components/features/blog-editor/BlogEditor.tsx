"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Placeholder from "@tiptap/extension-placeholder";
import { createLowlight, common } from "lowlight";
import { EditorToolbar } from "./EditorToolbar";

const lowlight = createLowlight(common);

export interface BlogEditorProps {
  /** Initial HTML content */
  initialContent?: string;
  /** Initial raw markdown (for markdown mode) */
  initialMarkdown?: string;
  /** Called whenever content changes. html = rendered HTML, markdown = raw md string */
  onChange?: (html: string, markdown: string) => void;
  /** Token for image upload */
  uploadToken?: string;
  placeholder?: string;
}

export function BlogEditor({
  initialContent = "",
  initialMarkdown = "",
  onChange,
  uploadToken,
  placeholder = "Start writing your post…",
}: BlogEditorProps) {
  const [mode, setMode] = useState<"rich" | "markdown">("rich");
  const [markdownText, setMarkdownText] = useState(initialMarkdown);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        // Disable default code block in favour of lowlight version
        codeBlock: false,
      }),
      Image.configure({ inline: false, allowBase64: false }),
      Link.configure({ openOnClick: false, autolink: true }),
      CodeBlockLowlight.configure({ lowlight }),
      Placeholder.configure({ placeholder }),
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class:
          "prose prose-neutral dark:prose-invert max-w-none min-h-[320px] px-4 py-3 focus:outline-none text-sm leading-relaxed",
      },
    },
    onUpdate({ editor }) {
      const html = editor.getHTML();
      onChange?.(html, markdownText);
    },
  });

  // Notify parent when markdown text changes (markdown mode)
  useEffect(() => {
    if (mode === "markdown") {
      onChange?.("", markdownText);
    }
  }, [markdownText, mode, onChange]);

  const switchMode = useCallback(() => {
    if (mode === "rich") {
      // Switching to markdown — capture current HTML as markdown placeholder
      setMarkdownText((prev) => prev || (editor ? editor.getHTML() : ""));
      setMode("markdown");
    } else {
      // Switching to rich — if editor content was blank, set from markdown
      if (editor && markdownText && editor.isEmpty) {
        editor.commands.setContent(`<p>${markdownText.replace(/\n/g, "</p><p>")}</p>`);
      }
      setMode("rich");
    }
  }, [mode, editor, markdownText]);

  const handleImageUpload = useCallback(async (file: File) => {
    if (!uploadToken) {
      setUploadError("Login required to upload images");
      return;
    }
    setUploading(true);
    setUploadError("");
    try {
      const { uploadBlogImage } = await import("app/lib/blog");
      const url = await uploadBlogImage(uploadToken, file);
      editor?.chain().focus().setImage({ src: url }).run();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }, [uploadToken, editor]);

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleImageUpload(file);
      e.target.value = "";
    },
    [handleImageUpload]
  );

  const onPaste = useCallback(
    (e: React.ClipboardEvent) => {
      const file = Array.from(e.clipboardData.items)
        .find((item) => item.type.startsWith("image/"))
        ?.getAsFile();
      if (file) {
        e.preventDefault();
        handleImageUpload(file);
      }
    },
    [handleImageUpload]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      const file = Array.from(e.dataTransfer.files).find((f) =>
        f.type.startsWith("image/")
      );
      if (file) {
        e.preventDefault();
        handleImageUpload(file);
      }
    },
    [handleImageUpload]
  );

  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
      {/* Mode toggle */}
      <div className="flex items-center justify-between px-3 pt-2 pb-0">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => mode !== "rich" && switchMode()}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              mode === "rich"
                ? "bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900"
                : "text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            }`}
          >
            Rich editor
          </button>
          <button
            type="button"
            onClick={() => mode !== "markdown" && switchMode()}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              mode === "markdown"
                ? "bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900"
                : "text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            }`}
          >
            Markdown
          </button>
        </div>
      </div>

      {/* Toolbar (rich mode only) */}
      {mode === "rich" && editor && (
        <EditorToolbar
          editor={editor}
          onImageUpload={() => fileInputRef.current?.click()}
          uploading={uploading}
        />
      )}

      {/* Editor area */}
      {mode === "rich" ? (
        <div onPaste={onPaste} onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
          <EditorContent editor={editor} />
        </div>
      ) : (
        <textarea
          value={markdownText}
          onChange={(e) => setMarkdownText(e.target.value)}
          placeholder={placeholder}
          className="w-full min-h-[320px] px-4 py-3 bg-transparent text-sm font-mono text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none resize-y"
        />
      )}

      {/* Upload status */}
      {uploading && (
        <div className="px-4 py-2 text-xs text-neutral-500 dark:text-neutral-400 border-t border-neutral-200 dark:border-neutral-800">
          Uploading image…
        </div>
      )}
      {uploadError && (
        <div className="px-4 py-2 text-xs text-red-500 border-t border-neutral-200 dark:border-neutral-800">
          {uploadError}
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="hidden"
        onChange={onFileChange}
      />
    </div>
  );
}
