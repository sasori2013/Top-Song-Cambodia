import { Header } from '@/components/Header';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
    title: 'Privacy Policy | HEAT',
};

export default function PrivacyPolicyPage() {
    return (
        <main className="bg-black min-h-screen">
            <Header />
            <div className="max-w-3xl mx-auto px-6 pt-32 pb-24 text-white">
                <h1 className="text-3xl md:text-4xl font-bold mb-12 uppercase tracking-wide">Privacy Policy</h1>

                <div className="space-y-12">
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
                                <strong className="text-white/90">Storage:</strong> To maintain a historical index of Cambodian music, data is stored for up to 90 days before being archived or refreshed.
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
                            <Link href="mailto:info@example.com" className="text-white/90 underline hover:text-white transition-colors">[ここに連絡用メールアドレスまたはフォームのリンクを挿入してください]</Link>
                        </p>
                    </section>
                </div>
            </div>
        </main>
    );
}
