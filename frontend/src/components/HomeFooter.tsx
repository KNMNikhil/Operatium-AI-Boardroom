import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const QUOTES = [
  "“The best way to predict the future is to create it.” — Peter Drucker",
  "“Ideas are cheap. Execution is everything.” — Chris Sacca",
  "“If you're not embarrassed by the first version of your product, you've launched too late.” — Reid Hoffman",
  "“Move fast and break things.” — Mark Zuckerberg",
  "“Timing, perseverance, and ten years of trying will eventually make you look like an overnight success.” — Biz Stone",
  "“Don't find customers for your products, find products for your customers.” — Seth Godin",
  "“It's not about ideas. It's about making ideas happen.” — Scott Belsky",
  "“Risk more than others think is safe. Dream more than others think is practical.” — Howard Schultz"
];

export function HomeFooter() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % QUOTES.length);
    }, 8000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 pointer-events-auto">
      <div className="bg-[#FFF4E9] border-2 border-black rounded-lg p-4 flex items-center justify-center overflow-hidden rotate-[1deg] shadow-[4px_4px_0_rgba(0,0,0,1)] font-['Caveat'] relative min-h-[5rem]">
        <div className="absolute top-0 left-0 w-8 h-full bg-gradient-to-r from-[#FFF4E9] to-transparent z-10" />
        <div className="absolute top-0 right-0 w-8 h-full bg-gradient-to-l from-[#FFF4E9] to-transparent z-10" />
        
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeInOut" }}
            className="text-xl md:text-2xl font-bold text-black text-center px-4 md:px-8 w-full leading-tight"
          >
            {QUOTES[index]}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
