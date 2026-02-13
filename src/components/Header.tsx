import React from 'react';
import { FluctuatingText } from './FluctuatingText';

export const Header: React.FC = () => {
    return (
        <header className="fixed top-0 z-50 w-full pt-10">
            <div className="container mx-auto px-6 text-center">
                <FluctuatingText
                    text="BEATS OF CAMBODIA"
                    className="text-xs font-bold tracking-[0.5em] text-white/20"
                />
            </div>
        </header>
    );
};
