import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

interface ChatContextType {
  isOpen: boolean
  pendingMessage: string | null
  openChat: () => void
  closeChat: () => void
  openWithMessage: (message: string) => void
  clearPendingMessage: () => void
}

const ChatContext = createContext<ChatContextType | undefined>(undefined)

export function ChatProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [pendingMessage, setPendingMessage] = useState<string | null>(null)

  const openChat = useCallback(() => {
    setIsOpen(true)
  }, [])

  const closeChat = useCallback(() => {
    setIsOpen(false)
  }, [])

  const openWithMessage = useCallback((message: string) => {
    setPendingMessage(message)
    setIsOpen(true)
  }, [])

  const clearPendingMessage = useCallback(() => {
    setPendingMessage(null)
  }, [])

  return (
    <ChatContext.Provider
      value={{
        isOpen,
        pendingMessage,
        openChat,
        closeChat,
        openWithMessage,
        clearPendingMessage,
      }}
    >
      {children}
    </ChatContext.Provider>
  )
}

export function useChat() {
  const context = useContext(ChatContext)
  if (context === undefined) {
    throw new Error('useChat must be used within a ChatProvider')
  }
  return context
}
