import React from 'react';
import Link from 'next/link';

interface FooterProps {
    hideDisclaimer?: boolean;
}

export const Footer: React.FC<FooterProps> = ({ hideDisclaimer }) => {
    return (
        <footer className="relative z-10 mt-32 pb-32 text-center px-6 pointer-events-auto">
            <div className="max-w-2xl mx-auto space-y-4">

                {!hideDisclaimer && (
                    <div className="max-w-4xl mx-auto text-center border-t border-white/5 pt-12 pb-8">
                        <p className="text-[11px] md:text-[13px] text-white/50 leading-relaxed font-normal tracking-wide">
                            Disclaimer: The Rankings, HEAT Point, VEL, and RCT are proprietary metrics independently calculated by HEAT using an AI-driven intelligence layer. These indices integrate public data from YouTube, Facebook, and TikTok to provide a comprehensive analysis of the Cambodian music market. These metrics are independent of, and do not replace, the official analytics provided by YouTube or any other platform.
                        </p>
                    </div>
                )}

                <div className="flex items-center justify-center gap-4 pt-8">
                    <div className="h-px w-8 bg-white/20" />
                    <p className="text-[9px] tracking-[0.4em] font-bold text-white/30 uppercase">
                        Updated daily
                    </p>
                    <div className="h-px w-8 bg-white/20" />
                </div>

                <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4 pt-8">
                    <Link href="/" className="text-[10px] tracking-[0.2em] font-bold text-white/30 hover:text-white/70 transition-colors uppercase">
                        Home
                    </Link>
                    <Link href="/methodology" className="text-[10px] tracking-[0.2em] font-bold text-white/30 hover:text-white/70 transition-colors uppercase">
                        Methodology
                    </Link>
                    <Link href="/terms" className="text-[10px] tracking-[0.2em] font-bold text-white/30 hover:text-white/70 transition-colors uppercase">
                        Terms of Service
                    </Link>
                    <Link href="/privacy" className="text-[10px] tracking-[0.2em] font-bold text-white/30 hover:text-white/70 transition-colors uppercase">
                        Privacy Policy
                    </Link>
                </div>
            </div>
        </footer>
    );
};
