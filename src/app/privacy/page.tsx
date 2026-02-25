import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { AuraR3F } from '@/components/AuraR3F';
import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Privacy Policy | HEAT',
};

export default function PrivacyPolicyPage() {
    return (
        <main className="relative bg-black min-h-screen overflow-hidden">
            <AuraR3F color="rgba(255, 255, 255, 0.2)" fullscreen progress={0} hideCluster />
            <Header />
            <div className="relative z-10 max-w-3xl mx-auto px-6 pt-32 pb-24 text-white">
                <h1 className="text-3xl md:text-4xl font-bold mb-12 uppercase tracking-wide">Privacy Policy</h1>

                <div className="space-y-12 backdrop-blur-sm bg-black/30 p-8 rounded-2xl border border-white/10">
                    <section>
                        <h2 className="text-xl font-semibold mb-4 text-white/90">1. YouTube API Services</h2>
                        <p className="text-white/70 leading-relaxed">
                            This API Client uses YouTube API Services.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mb-4 text-white/90">2. Google Privacy Policy</h2>
                        <p className="text-white/70 leading-relaxed">
                            For information on how Google manages data, please refer to the Google Privacy Policy at <a href="http://www.google.com/policies/privacy" target="_blank" rel="noopener noreferrer" className="text-white/90 underline hover:text-white transition-colors">http://www.google.com/policies/privacy</a>.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mb-4 text-white/90">3. Information Collection and Use</h2>
                        <ul className="list-disc pl-5 space-y-4 text-white/70 leading-relaxed">
                            <li>
                                <strong className="text-white/90">Data Accessed:</strong> We access public YouTube API data (views, likes, comments) and integrate it with external data sources, including Facebook engagement data and manual market statistics.
                            </li>
                            <li>
                                <strong className="text-white/90">Purpose:</strong> Data is processed via AI (Vertex AI) to calculate the "Heat Point" index for cultural archiving and market analysis.
                            </li>
                            <li>
                                <strong className="text-white/90">Storage & Refresh:</strong> To comply with YouTube API Services Terms, data that cannot be synced with the API for more than 30 days is automatically discarded. Furthermore, to maintain the latest state, stored API data is refreshed (synced with YouTube API) at least once every 24 hours. The "Heat Log" acts as an index built upon this regularly verified data stream.
                            </li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mb-4 text-white/90">4. Cookies and Device Information</h2>
                        <p className="text-white/70 leading-relaxed">
                            We may use cookies or similar technologies to recognize user devices and improve the experience.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mb-4 text-white/90">5. Contact Information</h2>
                        <p className="text-white/70 leading-relaxed">
                            <a href="mailto:kxolab.ai@gmail.com" className="text-white/90 underline hover:text-white transition-colors">kxolab.ai@gmail.com</a>
                        </p>
                    </section>
                </div>
            </div>
            <Footer />
        </main>
    );
}
