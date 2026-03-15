import { useState, useRef, useEffect } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import IconButton from "@mui/material/IconButton";
import CircularProgress from "@mui/material/CircularProgress";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import SendIcon from "@mui/icons-material/Send";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import PersonIcon from "@mui/icons-material/Person";
import ReactMarkdown from "react-markdown";
import { chatApi, ChatMessage } from "./api";

interface DisplayMessage {
  role: "user" | "assistant";
  content: string;
  sources?: Array<{
    document_name: string;
    page_number: number;
    content_preview?: string;
  }>;
  model?: string;
  queryIntent?: string;
}

export function Chat() {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: DisplayMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const chatMessages: ChatMessage[] = [
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user" as const, content: text },
      ];
      const res = await chatApi.send(chatMessages, sessionId);
      setSessionId(res.session_id);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: res.message,
          sources: res.sources,
          model: res.model,
          queryIntent: res.query_intent,
        },
      ]);
    } catch (e: unknown) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Error: ${e instanceof Error ? e.message : "Failed to get response"}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleClear() {
    if (sessionId) {
      try {
        await chatApi.clearSession(sessionId);
      } catch {
        // ignore
      }
    }
    setMessages([]);
    setSessionId(undefined);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <SmartToyIcon color="error" />
          <Typography variant="h6" fontWeight={600}>
            Ask About Your Vehicle
          </Typography>
        </Box>
        {messages.length > 0 && (
          <IconButton size="small" onClick={handleClear} title="Clear conversation">
            <DeleteOutlineIcon />
          </IconButton>
        )}
      </Box>

      {/* Messages Area */}
      <Card
        variant="outlined"
        sx={{
          flex: 1,
          overflow: "auto",
          mb: 2,
          p: 2,
          display: "flex",
          flexDirection: "column",
          gap: 2,
          minHeight: 300,
        }}
      >
        {messages.length === 0 && (
          <Box sx={{ textAlign: "center", py: 6, color: "text.secondary" }}>
            <SmartToyIcon sx={{ fontSize: 48, mb: 1, opacity: 0.3 }} />
            <Typography variant="body1">
              Ask anything about your vehicle — maintenance procedures, specs, troubleshooting, and more.
            </Typography>
            <Typography variant="body2" sx={{ mt: 1, opacity: 0.7 }}>
              Powered by AI with access to your owner's manual and service history.
            </Typography>
          </Box>
        )}

        {messages.map((msg, i) => (
          <Box key={i}>
            <Box
              sx={{
                display: "flex",
                gap: 1.5,
                alignItems: "flex-start",
                flexDirection: msg.role === "user" ? "row-reverse" : "row",
              }}
            >
              {msg.role === "user" ? (
                <PersonIcon color="primary" sx={{ mt: 0.5 }} />
              ) : (
                <SmartToyIcon color="error" sx={{ mt: 0.5 }} />
              )}
              <Paper
                elevation={0}
                sx={{
                  p: 1.5,
                  maxWidth: "80%",
                  bgcolor: msg.role === "user" ? "primary.50" : "grey.50",
                  borderRadius: 2,
                }}
              >
                {msg.role === "assistant" ? (
                  <Box sx={{ "& p": { m: 0 }, "& p + p": { mt: 1 }, "& ul, & ol": { pl: 2 } }}>
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </Box>
                ) : (
                  <Typography variant="body2">{msg.content}</Typography>
                )}
              </Paper>
            </Box>

            {/* Sources */}
            {msg.sources && msg.sources.length > 0 && (
              <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", ml: 5, mt: 0.5 }}>
                {msg.sources.map((s, j) => (
                  <Chip
                    key={j}
                    label={`${s.document_name} p.${s.page_number}`}
                    size="small"
                    variant="outlined"
                    color="info"
                  />
                ))}
              </Box>
            )}

            {/* Model info */}
            {msg.model && (
              <Typography variant="caption" color="text.disabled" sx={{ ml: 5, display: "block" }}>
                {msg.model} · {msg.queryIntent}
              </Typography>
            )}
          </Box>
        ))}

        {loading && (
          <Box sx={{ display: "flex", gap: 1.5, alignItems: "center" }}>
            <SmartToyIcon color="error" />
            <CircularProgress size={20} />
            <Typography variant="body2" color="text.secondary">
              Thinking...
            </Typography>
          </Box>
        )}

        <div ref={bottomRef} />
      </Card>

      {/* Input */}
      <Box sx={{ display: "flex", gap: 1 }}>
        <TextField
          fullWidth
          size="small"
          multiline
          maxRows={3}
          placeholder="Ask about your vehicle..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
        />
        <IconButton
          color="error"
          onClick={handleSend}
          disabled={!input.trim() || loading}
        >
          <SendIcon />
        </IconButton>
      </Box>
    </Box>
  );
}
