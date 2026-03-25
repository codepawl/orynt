"use client";

import React, { useState } from "react";
import { Clipboard, CheckLg } from "react-bootstrap-icons";
import { motion, AnimatePresence } from "motion/react";

interface CodeCopyButtonProps {
  code: string;
  className?: string;
}

export function CodeCopyButton({ code, className = "" }: CodeCopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (err) {
      console.error("Failed to copy code:", err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={`p-1.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors duration-200 opacity-70 hover:opacity-100 relative ${className}`}
      aria-label={copied ? "Copied!" : "Copy code"}
      title={copied ? "Copied!" : "Copy code"}
      style={{ width: "28px", height: "28px" }}
    >
      <div className="relative w-full h-full flex items-center justify-center">
        <AnimatePresence mode="wait" initial={false}>
          {copied ? (
            <motion.span
              key="check"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.2 }}
              className="absolute flex items-center justify-center"
            >
              <CheckLg size={16} className="text-green-600 dark:text-green-400" />
            </motion.span>
          ) : (
            <motion.span
              key="copy"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.2 }}
              className="absolute flex items-center justify-center"
            >
              <Clipboard size={16} className="text-neutral-600 dark:text-neutral-400" />
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </button>
  );
}
