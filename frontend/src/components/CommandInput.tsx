import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMeetingStore } from '../store/useMeetingStore';

export function CommandInput({ onSubmit, onGenerateReport }: { onSubmit: (text: string) => void, onGenerateReport?: () => void }) {
  const [input, setInput] = useState('');
  const { addTimelineEvent, qaState } = useMeetingStore();
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    
    const userIdea = input;
    setInput('');
    setIsLoading(true);

    try {
      await onSubmit(userIdea);
    } catch (err: any) {
      addTimelineEvent(`Failed to send: ${err.message}`, 'System');
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 pointer-events-auto flex items-center justify-center">
      <form onSubmit={handleSubmit} className="flex-1 bg-[#FFF4E9] border-2 border-black rounded-lg p-2 flex items-center gap-3 transition-all focus-within:border-black/70 rotate-[-1deg] shadow-[4px_4px_0_rgba(0,0,0,1)]">
        <div className="w-8 h-8 rounded-full border-2 border-black flex items-center justify-center flex-shrink-0 bg-[#FFF4E9]">
          <span className="text-black text-xs">✨</span>
        </div>
        <input 
          type="text" 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your answer or follow-up question..." 
          className="w-full bg-transparent border-none outline-none text-black placeholder:text-black/50 px-2 py-2 font-['Caveat'] text-2xl"
        />
        <button type="submit" className="px-4 py-2 border-2 border-black bg-transparent hover:bg-black/5 rounded-lg text-xl font-bold font-['Caveat'] transition-colors shadow-[2px_2px_0_rgba(0,0,0,1)]">
          Send
        </button>
      </form>
      {qaState === 'asking_questions' && onGenerateReport && (
        <button
          onClick={onGenerateReport}
          className="ml-3 px-4 py-2 border-2 border-black bg-[#FFF4E9] hover:bg-black/5 rounded-lg text-xl font-bold font-['Caveat'] transition-colors shadow-[4px_4px_0_rgba(0,0,0,1)] flex-shrink-0"
        >
          Generate Report
        </button>
      )}
    </div>
  );
}
