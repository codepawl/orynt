"use client";

import { useState, useEffect } from "react";

type ToastType = "success" | "error";

let showToastFn: ((msg: string, type?: ToastType) => void) | null = null;

export function toast(msg: string, type: ToastType = "success") {
  showToastFn?.(msg, type);
}

export function ToastProvider() {
  const [items, setItems] = useState<{ id: number; msg: string; type: ToastType }[]>([]);

  useEffect(() => {
    showToastFn = (msg, type = "success") => {
      const id = Date.now();
      setItems((prev) => [...prev, { id, msg, type }]);
      setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), 3000);
    };
    return () => {
      showToastFn = null;
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {items.map((item) => (
        <div
          key={item.id}
          className={`px-4 py-2.5 rounded-lg text-sm text-white shadow-lg ${
            item.type === "error" ? "bg-red-600" : "bg-green-600"
          }`}
        >
          {item.msg}
        </div>
      ))}
    </div>
  );
}
