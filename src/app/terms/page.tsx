import { Header } from '@/components/Header';
import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Terms of Service | HEAT',
};

export default function TermsPage() {
    return (
        <main className="bg-black min-h-screen">
            <Header />
            <div className="max-w-3xl mx-auto px-6 pt-32 pb-24 text-white">
                <h1 className="text-3xl md:text-4xl font-bold mb-12 uppercase tracking-wide">Terms of Service</h1>

                <div className="space-y-12">
                    <section>
                        <h2 className="text-xl font-semibold mb-4 text-white/90">1. Agreement to Terms</h2>
                        <p className="text-white/70 leading-relaxed">
                            By using this API Client (HEAT), users are agreeing to be bound by the YouTube Terms of Service (<a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer" className="text-white/90 underline hover:text-white transition-colors">https://www.youtube.com/t/terms</a>).
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mb-4 text-white/90">2. Service Description</h2>
                        <p className="text-white/70 leading-relaxed">
                            HEAT is a digital asset and cultural infrastructure designed to archive the "Heat Log" of Cambodian music history. It provides rankings based on a multi-source intelligence layer.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mb-4 text-white/90">3. Neutrality</h2>
                        <p className="text-white/70 leading-relaxed">
                            HEAT remains a third-party data institution, independent of specific labels or political backgrounds.
                        </p>
                    </section>
                </div>
            </div>
        </main>
    );
}
