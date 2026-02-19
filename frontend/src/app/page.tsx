"use client";

import { motion, Variants } from "framer-motion";
import Link from "next/link";
import { useEffect, useState } from "react";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.8, ease: [0.2, 0.65, 0.3, 0.9] },
  }),
};

function GlowEffect() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-blue-600/20 blur-[120px] rounded-full mix-blend-screen opacity-50" />
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-indigo-600/10 blur-[100px] rounded-full mix-blend-screen opacity-30" />
    </div>
  );
}

const features = [
  {
    title: "Ironclad NDA",
    desc: "AI agents run inside a TEE. Raw IP never leaves the enclave.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    ),
  },
  {
    title: "Dual-Agent Negotiation",
    desc: "Buyer’s & Seller’s AI negotiate price within your budget & threshold.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
  {
    title: "Atomic Settlement",
    desc: "Smart contract releases funds & IP simultaneously. No counterparty risk.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
];

export default function HomePage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-[#0B0C10] text-white">
      <GlowEffect />

      {/* Hero Section */}
      <main className="relative z-10 max-w-5xl mx-auto px-6 pt-32 pb-16 text-center space-y-12">
        <motion.div
          initial="hidden"
          animate="visible"
          className="space-y-8"
        >


          {/* Heading */}
          <motion.div custom={1} variants={fadeUp} className="space-y-4">
            <h1 className="text-6xl md:text-7xl font-bold tracking-tight leading-[1.1]">
              Deals without <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">
                Data Leaks
              </span>
            </h1>
            <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed">
              Solve the Disclosure Paradox with AI agents inside a TEE. <br className="hidden md:block" />
              Upload IP securely. Negotiate blindly. Settle atomically.
            </p>
          </motion.div>

          {/* CTAs */}
          <motion.div custom={2} variants={fadeUp} className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Link
              href="/deal?role=founder"
              className="px-8 py-3.5 rounded-2xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-500 transition-all shadow-[0_0_20px_-5px_rgba(37,99,235,0.5)] w-full sm:w-auto"
            >
              Create Deal Room
            </Link>
            <Link
              href="/deal?role=investor"
              className="px-8 py-3.5 rounded-2xl bg-white/5 border border-white/10 text-white font-semibold text-sm hover:bg-white/10 transition-all w-full sm:w-auto"
            >
              Join Negotiation
            </Link>
          </motion.div>

          {/* Feature Grid */}
          <motion.div
            custom={3}
            variants={fadeUp}
            className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-16 text-left"
          >
            {features.map((item, i) => (
              <div
                key={i}
                className="group p-6 rounded-3xl bg-zinc-900/40 border border-white/5 hover:border-blue-500/30 transition-colors backdrop-blur-sm"
              >
                <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-400 mb-4 group-hover:scale-110 transition-transform">
                  {item.icon}
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{item.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </motion.div>
        </motion.div>

        {/* Footer */}
        <motion.div
          custom={4}
          variants={fadeUp}
          className="pt-16 pb-8 border-t border-white/5"
        >
          <p className="text-xs text-zinc-600">
            Based on <a href="https://arxiv.org/abs/2502.07924" target="_blank" className="text-zinc-500 hover:text-blue-400 transition-colors">NDAI Agreements (arXiv:2502.07924)</a>
          </p>
        </motion.div>
      </main>
    </div>
  );
}
