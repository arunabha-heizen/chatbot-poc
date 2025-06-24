'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

type Message = {
  sender: 'user' | 'bot';
  text: string;
  isStreaming?: boolean;
};

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streamingResponse, setStreamingResponse] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const socketRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const streamingResponseRef = useRef('');

  // Update ref when streamingResponse changes
  useEffect(() => {
    streamingResponseRef.current = streamingResponse;
  }, [streamingResponse]);

  useEffect(() => {
    const connectWebSocket = () => {
      const socket = new WebSocket('ws://localhost:8000/ws/1');
      socketRef.current = socket;

      socket.onopen = () => {
        console.log('WebSocket connected');
        setConnectionStatus('connected');
      };

      socket.onmessage = (event) => {
        console.log('Received message:', event.data); // Add this debug line
        
        if (event.data === '[END]') {
          // Use ref to get current value
          const finalResponse = streamingResponseRef.current;
          console.log('Final response:', finalResponse); // Add this debug line
          
          setMessages((prev) => [
            ...prev,
            { sender: 'bot', text: finalResponse }
          ]);
          setStreamingResponse('');
          setIsStreaming(false);
        } else {
          console.log('Streaming chunk:', event.data); // Add this debug line
          setStreamingResponse((prev) => prev + event.data);
          setIsStreaming(true);
        }
      };

      socket.onerror = (e) => {
        console.error('WebSocket error:', e);
        setConnectionStatus('disconnected');
        setIsStreaming(false);
      };

      socket.onclose = () => {
        console.warn('WebSocket closed');
        setConnectionStatus('disconnected');
        setIsStreaming(false);
      };
    };

    connectWebSocket();

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, []); // Remove streamingResponse dependency

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingResponse]);

  const sendMessage = useCallback(() => {
    if (!input || !socketRef.current || isStreaming || connectionStatus !== 'connected') return;

    const userMsg: Message = { sender: 'user', text: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setStreamingResponse('');
    setIsStreaming(true);
    socketRef.current.send(input);
  }, [input, isStreaming, connectionStatus]);

  return (
    <div className="min-h-screen bg-gray-50 p-6 flex flex-col items-center">
      <h1 className="text-3xl font-semibold mb-6">LangGraph Chatbot</h1>
      
      {/* Connection status */}
      <div className={`mb-4 px-3 py-1 rounded-full text-sm ${
        connectionStatus === 'connected' ? 'bg-green-100 text-green-800' :
        connectionStatus === 'connecting' ? 'bg-yellow-100 text-yellow-800' :
        'bg-red-100 text-red-800'
      }`}>
        {connectionStatus === 'connected' ? '🟢 Connected' :
         connectionStatus === 'connecting' ? '🟡 Connecting...' :
         '🔴 Disconnected'}
      </div>

      <Card className="w-full max-w-2xl h-[500px] overflow-y-auto p-4 space-y-2 bg-white shadow-md">
        <CardContent className="space-y-3">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${
                msg.sender === 'user' ? 'justify-end' : 'justify-start'
              } w-full`}
            >
              <div
                className={`inline-block px-4 py-2 rounded-2xl max-w-xs ${
                  msg.sender === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-black'
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}

          {/* Show streaming response */}
          {isStreaming && streamingResponse && (
            <div className="flex justify-start w-full">
              <div className="inline-block px-4 py-2 rounded-2xl bg-gray-100 text-black border-2 border-blue-200 max-w-xs">
                {streamingResponse}
                <span className="animate-pulse">|</span>
              </div>
            </div>
          )}

          <div ref={bottomRef}></div>
        </CardContent>
      </Card>

      <div className="mt-4 w-full max-w-2xl flex gap-2">
        <Input
          placeholder="Type a message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          disabled={isStreaming || connectionStatus !== 'connected'}
        />
        <Button 
          onClick={sendMessage} 
          disabled={isStreaming || connectionStatus !== 'connected'}
        >
          {isStreaming ? 'Sending...' : 'Send'}
        </Button>
      </div>
    </div>
  );
}
