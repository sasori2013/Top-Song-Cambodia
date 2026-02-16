'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GAS_API_URL } from '@/lib/api';

export const SubmissionForm: React.FC = () => {
    const [url, setUrl] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'exists' | 'error'>('idle');
    const [message, setMessage] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!url.trim()) return;

        setStatus('loading');
        try {
            const res = await fetch(GAS_API_URL, {
                method: 'POST',
                mode: 'no-cors', // GAS requires no-cors for direct POST if redirects are involved, but we'll try standard first
                headers: {
                    'Content-Type': 'text/plain', // GAS doPost often prefers plain text for JSON strings
                },
                body: JSON.stringify({ youtubeUrl: url }),
            });

            // Note: with no-cors, we can't read the response. 
            // For a better UX, we might need a proxy or handle the redirect.
            // But usually, standard fetch works if GAS is set to "Anyone".
            
            // Re-trying with standard fetch to catch the response
            const resData = await fetch(GAS_API_URL, {
                method: 'POST',
                body: JSON.stringify({ youtubeUrl: url }),
            });
            
            const result = await resData.json();
            
            if (result.status === 'success') {
                setStatus('success');
                setMessage(result.message);
                setUrl('');
            } else if (result.status === 'exists') {
                setStatus('exists');
                setMessage(result.message);
            } else {
                setStatus('error');
                setMessage(result.message || 'Error occurred');
            }
        } catch (err) {
            console.error('Submission error:', err);
            // Some browsers/CORS issues might trigger this even on success if redirects fail
            setStatus('error');
            setMessage('送信に失敗しました。時間をおいて再度お試しください。');
        }
    };

    return (
        <section className="py-20 px-4 max-w-2xl mx-auto border-t border-white/5">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="text-center mb-10"
            >
                <h2 className="text-3xl font-black tracking-widest mb-4">ARTIST SUBMISSION</h2>
                <p className="text-white/50 text-sm font-light">
                    あなたのチャンネルをランキングに追加しませんか？<br />
                    YoutubeチャンネルのURLを送信してください。
                </p>
            </motion.div>

            <form onSubmit={handleSubmit} className="relative group">
                <div className="relative flex flex-col md:flex-row gap-4">
                    <input
                        type="url"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://www.youtube.com/@ArtistHandle"
                        required
                        className="flex-1 bg-black/40 border border-white/10 rounded-none px-6 py-4 text-white placeholder:text-white/20 focus:outline-none focus:border-white/40 transition-colors font-light"
                    />
                    <button
                        type="submit"
                        disabled={status === 'loading'}
                        className="bg-white text-black px-10 py-4 font-bold tracking-tighter hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        {status === 'loading' ? 'SENDING...' : 'REQUEST'}
                    </button>
                </div>

                <AnimatePresence mode="wait">
                    {status !== 'idle' && status !== 'loading' && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mt-6 overflow-hidden"
                        >
                            <div className={`p-4 border ${
                                status === 'success' ? 'border-green-500/50 bg-green-500/5 text-green-400' :
                                status === 'exists' ? 'border-yellow-500/50 bg-yellow-500/5 text-yellow-500' :
                                'border-red-500/50 bg-red-500/5 text-red-500'
                            } text-sm font-medium tracking-wide`}>
                                {message}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </form>
            
            <div className="mt-8 flex justify-center gap-8 opacity-20 hover:opacity-100 transition-opacity">
                 <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            </div>
        </section>
    );
};
