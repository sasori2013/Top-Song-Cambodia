import React from 'react';
import { FluctuatingText } from './FluctuatingText';

export const Header: React.FC = () => {
    return (
        <header className="fixed top-0 z-50 w-full pt-10 px-6">
            <div className="container mx-auto px-6 flex justify-center">
                {/* Logo removed per request */}
            </div>
        </header>
    );
};
