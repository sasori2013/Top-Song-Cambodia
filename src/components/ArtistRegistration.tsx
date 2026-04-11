"use client";

import React, { useState } from 'react';

export const ArtistRegistration: React.FC = () => {
    const [url, setUrl] = useState('');
    const [status, setStatus] = useState<null | 'loading' | 'success' | 'existing' | 'error'>(null);
    const [message, setMessage] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!url) return;

        setStatus('loading');
        setMessage('');

        try {
            const res = await fetch('/api/artist/request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });

            const data = await res.json();

            if (!res.ok) {
                setStatus('error');
                setMessage(data.error || 'Failed to submit request.');
                return;
            }

            if (data.existing) {
                setStatus('existing');
                setMessage(data.message);
            } else {
                setStatus('success');
                setMessage('Successfully submitted for review. Thank you!');
                setUrl('');
            }

        } catch (err) {
            setStatus('error');
            setMessage('Network error. Please try again.');
        }
    };

    return (
        <div className="max-w-xl mx-auto mb-16 px-4">
            <div className="border border-white/10 bg-white/5 backdrop-blur-md rounded-xl p-6 transition-all hover:bg-white/[0.07]">
                <h3 className="text-white/80 text-sm font-semibold tracking-wider uppercase mb-2">Request Artist Registration</h3>
                <p className="text-white/40 text-[11px] mb-4">
                    Submit a YouTube or Facebook link. It will be reviewed before being added to our database.
                </p>
                <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 relative">
                    <input 
                        type="url" 
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://youtube.com/... or https://facebook.com/..."
                        className="flex-1 bg-black/50 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white/90 placeholder-white/20 focus:outline-none focus:border-white/30 transition-colors"
                        required
                        disabled={status === 'loading'}
                    />
                    <button 
                        type="submit" 
                        disabled={status === 'loading' || !url}
                        className="bg-white/10 hover:bg-white/20 text-white/90 text-sm font-medium px-6 py-2.5 rounded-lg transition-colors border border-white/5 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                        {status === 'loading' ? 'Checking...' : 'Submit'}
                    </button>
                </form>

                {message && (
                    <div className={`mt-3 text-xs tracking-wide ${
                        status === 'success' ? 'text-green-400/90' : 
                        status === 'existing' ? 'text-orange-400/90' : 
                        'text-red-400/90'
                    }`}>
                        {message}
                    </div>
                )}
            </div>
        </div>
    );
};
