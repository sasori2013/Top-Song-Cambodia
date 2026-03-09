'use client';

import React from 'react';

interface FluctuatingTextProps {
    text: string;
    className?: string;
}

export const FluctuatingText: React.FC<FluctuatingTextProps> = ({ text, className }) => {
    return (
        <span className={className}>
            {text}
        </span>
    );
};
