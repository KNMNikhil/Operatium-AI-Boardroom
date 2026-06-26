import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface QAModalProps {
  isOpen: boolean;
  onClose: () => void;
  content: string;
}

export function QAModal({ isOpen, onClose, content }: QAModalProps) {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pointer-events-auto">
          {/* Backdrop */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
          />

          {/* Modal */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-5xl max-h-[90vh] bg-[#FFF4E9] border-4 border-black rounded-xl shadow-[8px_8px_0_rgba(0,0,0,1)] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b-4 border-black p-4 bg-white">
              <h2 className="text-3xl font-bold font-['Caveat'] flex items-center gap-2 text-black">
                <span>✨</span> Board's Insight
              </h2>
              <button 
                onClick={onClose}
                className="w-10 h-10 border-2 border-black rounded-lg flex items-center justify-center hover:bg-black/5 transition-colors shadow-[2px_2px_0_rgba(0,0,0,1)] bg-white"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-8 prose prose-xl max-w-none text-black prose-headings:font-bold prose-headings:underline decoration-wavy prose-a:text-blue-600 font-sans bg-white">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {content}
              </ReactMarkdown>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
