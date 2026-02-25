import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { AuraR3F } from '@/components/AuraR3F';
import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Data Methodology | HEAT',
};

export default function MethodologyPage() {
    return (
        <main className="relative bg-black min-h-screen overflow-hidden">
            <AuraR3F color="rgba(255, 255, 255, 0.2)" fullscreen progress={0} hideCluster />
            <Header />
            <div className="relative z-10 max-w-3xl mx-auto px-6 pt-32 pb-24 text-white">
                <h1 className="text-3xl md:text-4xl font-bold mb-12 uppercase tracking-wide">Data Methodology</h1>

                <div className="space-y-12 backdrop-blur-sm bg-black/30 p-8 rounded-2xl border border-white/10">
                    <section>
                        <h2 className="text-2xl font-bold mb-4 text-white/90">The "Heat Point" Algorithm</h2>
                        <p className="text-white/70 leading-relaxed">
                            HEAT Point is not a direct replica of YouTube metrics. It is a proprietary cross-platform index.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mb-4 text-white/90">1. Multi-Source Intelligence</h2>
                        <p className="text-white/70 leading-relaxed mb-4">
                            Our logic integrates data from multiple sources:
                        </p>
                        <ul className="list-disc pl-5 space-y-4 text-white/70 leading-relaxed">
                            <li>
                                <strong className="text-white/90">YouTube Data API v3:</strong> Real-time volume and velocity.
                            </li>
                            <li>
                                <strong className="text-white/90">Social Engagement:</strong> Facebook interaction data (including manual verification for accuracy).
                            </li>
                            <li>
                                <strong className="text-white/90">Market Velocity:</strong> Growth rates and engagement density analyzed by AI.
                            </li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mb-4 text-white/90">2. Fraud Resistance</h2>
                        <p className="text-white/70 leading-relaxed">
                            We use AI agents to detect abnormal growth rates and filter out low-engagement high-view anomalies to ensure the integrity of the "Heat Log".
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mb-4 text-white/90">3. Cultural Indexing</h2>
                        <p className="text-white/70 leading-relaxed">
                            Our mission is to establish a reliable historical index for the Cambodian music industry, functioning as a "Cambodia Music Intelligence Layer".
                        </p>
                    </section>
                </div>
            </div>
            <Footer />
        </main>
    );
}
