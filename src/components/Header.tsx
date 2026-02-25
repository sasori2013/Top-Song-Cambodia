import React from 'react';

export const Header: React.FC = () => {
    return (
        <header className="fixed top-0 z-50 w-full pt-6 px-6 md:pt-8 md:px-10 pointer-events-none">
            <div className="container mx-auto flex justify-end">
                <span className="pointer-events-auto px-2.5 py-1 bg-white/10 backdrop-blur-md border border-white/20 rounded-sm text-[10px] md:text-[11px] font-bold tracking-[0.2em] text-white/90 uppercase shadow-lg">
                    BETA
                </span>
            </div>
        </header>
    );
};
