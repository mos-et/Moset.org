import { useState, useEffect, useRef } from 'react';
import { Send, Settings, X, BrainCircuit, Bot, User, Loader2, Save } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export function ChatPanel({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  
  // Config
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('deepseek/deepseek-coder');
  const [baseUrl, setBaseUrl] = useState('https://openrouter.ai/api/v1');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load config from localStorage
    setApiKey(localStorage.getItem('moset_api_key') || '');
    setModel(localStorage.getItem('moset_model') || 'deepseek/deepseek-coder');
    setBaseUrl(localStorage.getItem('moset_base_url') || 'https://openrouter.ai/api/v1');
    
    // Load chat history
    const savedChat = localStorage.getItem('moset_chat_history');
    if (savedChat) {
      try { setMessages(JSON.parse(savedChat)); } catch (e) {}
    } else {
      setMessages([{ role: 'assistant', content: 'Hola. Soy la IA de Moset. ¿En qué puedo ayudarte hoy?' }]);
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    if (messages.length > 0) {
      localStorage.setItem('moset_chat_history', JSON.stringify(messages));
    }
  }, [messages]);

  const handleSaveSettings = () => {
    localStorage.setItem('moset_api_key', apiKey);
    localStorage.setItem('moset_model', model);
    localStorage.setItem('moset_base_url', baseUrl);
    setShowSettings(false);
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    
    if (!apiKey) {
      alert("Por favor, configura tu API Key en los ajustes primero.");
      setShowSettings(true);
      return;
    }

    const userMessage = input.trim();
    setInput('');
    const newMessages: Message[] = [...messages, { role: 'user', content: userMessage }];
    setMessages(newMessages);
    setIsTyping(true);

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          stream: true
        })
      });

      if (!response.ok) {
        throw new Error(`Error HTTP: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder("utf-8");
      
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      let assistantMessage = '';
      let lineBuffer = ''; // Buffer for partial SSE lines across chunks
      
      while (reader) {
        const { value, done } = await reader.read();
        if (done) break;
        
        lineBuffer += decoder.decode(value, { stream: true });
        const lines = lineBuffer.split('\n');
        // Keep the last (potentially incomplete) line in the buffer
        lineBuffer = lines.pop() || '';
        
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed === '' || trimmed === 'data: [DONE]') continue;
          if (trimmed.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(trimmed.slice(6));
              if (parsed.choices && parsed.choices[0].delta && parsed.choices[0].delta.content) {
                assistantMessage += parsed.choices[0].delta.content;
                setMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { ...updated[updated.length - 1], content: assistantMessage };
                  return updated;
                });
              }
            } catch (e) {
              // Incomplete JSON — will be completed in next chunk
            }
          }
        }
      }
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: `[Error de Conexión] ${(error as Error).message}` }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0d0d0f] border-l border-[#1a1a20] w-[400px]">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-[#1a1a20] bg-[#121215]">
        <div className="flex items-center gap-2">
          <BrainCircuit size={18} className="text-indigo-400" />
          <span className="font-semibold text-gray-200">Moset AI</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowSettings(!showSettings)} className="text-gray-400 hover:text-indigo-400 transition-colors">
            <Settings size={16} />
          </button>
          <button onClick={onClose} className="text-gray-400 hover:text-red-400 transition-colors">
            <X size={16} />
          </button>
        </div>
      </div>

      {showSettings ? (
        <div className="p-4 bg-[#121215] flex-1 flex flex-col gap-4">
          <h3 className="text-sm font-bold text-gray-300 uppercase">Configuración IA</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">API Key</label>
              <input 
                type="password" 
                value={apiKey} 
                onChange={e => setApiKey(e.target.value)}
                className="w-full bg-[#0d0d0f] border border-[#1a1a20] rounded p-2 text-sm text-gray-200 focus:outline-none focus:border-indigo-500"
                placeholder="sk-or-v1-..."
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Base URL</label>
              <input 
                type="text" 
                value={baseUrl} 
                onChange={e => setBaseUrl(e.target.value)}
                className="w-full bg-[#0d0d0f] border border-[#1a1a20] rounded p-2 text-sm text-gray-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Modelo</label>
              <input 
                type="text" 
                value={model} 
                onChange={e => setModel(e.target.value)}
                className="w-full bg-[#0d0d0f] border border-[#1a1a20] rounded p-2 text-sm text-gray-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
          <button 
            onClick={handleSaveSettings}
            className="mt-4 flex items-center justify-center gap-2 w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded p-2 text-sm font-semibold transition-colors"
          >
            <Save size={16} /> Guardar Ajustes
          </button>
        </div>
      ) : (
        <>
          {/* Chat History */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === 'user' ? 'bg-indigo-600' : 'bg-[#1a1a20]'}`}>
                  {msg.role === 'user' ? <User size={16} /> : <Bot size={16} className="text-indigo-400" />}
                </div>
                <div className={`max-w-[80%] rounded-lg p-3 text-sm whitespace-pre-wrap ${msg.role === 'user' ? 'bg-indigo-600/20 text-indigo-100' : 'bg-[#1a1a20] text-gray-300'}`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center bg-[#1a1a20]">
                  <Bot size={16} className="text-indigo-400" />
                </div>
                <div className="bg-[#1a1a20] rounded-lg p-3 flex items-center">
                  <Loader2 size={16} className="animate-spin text-indigo-400" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-3 bg-[#121215] border-t border-[#1a1a20]">
            <div className="flex items-end gap-2 bg-[#0d0d0f] border border-[#1a1a20] rounded-lg p-2 focus-within:border-indigo-500 transition-colors">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Pregunta a Moset AI..."
                className="flex-1 bg-transparent text-sm text-gray-200 focus:outline-none resize-none max-h-32 min-h-[24px]"
                rows={1}
              />
              <button 
                onClick={handleSend}
                disabled={!input.trim() || isTyping}
                className="p-1.5 rounded-md text-indigo-400 hover:bg-indigo-500/20 disabled:opacity-50 disabled:hover:bg-transparent transition-colors"
              >
                <Send size={16} />
              </button>
            </div>
            <div className="text-center mt-2">
              <span className="text-[10px] text-gray-600">Presiona Enter para enviar, Shift+Enter para salto de línea.</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
