"use client";

import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, User, Bot, Loader2 } from "lucide-react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

type Message = {
  id: string;
  role: "user" | "bot";
  content: string;
};

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: "1", role: "bot", content: "こんにちは！お気づきですね😉 カンボジア音楽の歴史やHEATについて何でも聞いてください！" },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  const toggleChat = () => setIsOpen(!isOpen);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg: Message = { id: Date.now().toString(), role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const apiMessages = [...messages, userMsg].map(m => ({
        role: m.role,
        content: m.content
      }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages }),
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Something went wrong");
      }

      const botMsg: Message = { 
        id: (Date.now() + 1).toString(), 
        role: "bot", 
        content: data.text 
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch (error) {
      console.error(error);
      const errorMsg: Message = { 
        id: (Date.now() + 1).toString(), 
        role: "bot", 
        content: "すみません、エラーが発生しました。" 
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {isOpen && (
        <div className="mb-4 flex flex-col h-[500px] max-h-[80vh] w-[350px] sm:w-[400px] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl transition-all duration-300">
          {/* Header */}
          <div className="flex items-center justify-between bg-gradient-to-r from-teal-500 to-emerald-500 p-4 text-white">
            <div className="flex items-center gap-2">
              <Bot className="h-6 w-6" />
              <h3 className="font-semibold">HEAT AI Chat</h3>
            </div>
            <button
              onClick={toggleChat}
              className="rounded-full p-1 hover:bg-white/20 transition-colors"
              aria-label="Close chat"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Messages Body */}
          <div className="flex-1 overflow-y-auto p-4 bg-gray-50 flex flex-col gap-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex items-start gap-3 max-w-[85%]",
                  msg.role === "user" ? "self-end flex-row-reverse" : "self-start"
                )}
              >
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                    msg.role === "user" ? "bg-teal-600 text-white" : "bg-gray-200 text-gray-700"
                  )}
                >
                  {msg.role === "user" ? <User className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
                </div>
                <div
                  className={cn(
                    "rounded-2xl px-4 py-2 text-sm",
                    msg.role === "user"
                      ? "bg-teal-600 text-white rounded-tr-none shadow-sm"
                      : "bg-white text-gray-800 border border-gray-100 shadow-sm rounded-tl-none whitespace-pre-wrap"
                  )}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex items-start gap-3 max-w-[85%] self-start">
                 <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-gray-700">
                   <Bot className="h-5 w-5" />
                 </div>
                 <div className="rounded-2xl px-4 py-3 bg-white border border-gray-100 shadow-sm rounded-tl-none flex items-center gap-2 text-gray-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Thinking...</span>
                 </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="bg-white p-3 border-t border-gray-100">
            <form onSubmit={handleSubmit} className="flex gap-2 relative items-center bg-gray-100 rounded-full pr-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="メッセージを入力..."
                className="flex-1 bg-transparent px-4 py-3 outline-none text-sm text-gray-800"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-500 text-white transition-transform hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Floating Button */}
      <button
        onClick={toggleChat}
        className={cn(
          "flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 text-white shadow-xl transition-all hover:scale-105 active:scale-95",
          isOpen ? "scale-0 opacity-0 pointer-events-none" : "scale-100 opacity-100"
        )}
        aria-label="Open chat"
      >
        <MessageCircle className="h-7 w-7" />
      </button>
    </div>
  );
}
