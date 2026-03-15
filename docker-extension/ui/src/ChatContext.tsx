import { createContext, useContext, useState, type ReactNode } from "react";

interface ChatContextType {
  isOpen: boolean;
  pendingMessage: string | null;
  openChat: () => void;
  closeChat: () => void;
  openWithMessage: (msg: string) => void;
  clearPendingMessage: () => void;
}

const ChatContext = createContext<ChatContextType | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);

  return (
    <ChatContext.Provider
      value={{
        isOpen,
        pendingMessage,
        openChat: () => setIsOpen(true),
        closeChat: () => setIsOpen(false),
        openWithMessage: (msg: string) => {
          setPendingMessage(msg);
          setIsOpen(true);
        },
        clearPendingMessage: () => setPendingMessage(null),
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
}
