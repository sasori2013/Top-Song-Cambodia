import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { MegaHitRanking } from '@/components/MegaHitRanking';

export const metadata = {
  title: 'MEGA HITS | HEAT Cambodia',
  description: 'All-time Cambodian music mega hits — 5M+ views ranking',
};

export default function MegaHitsPage() {
  return (
    <main className="bg-black min-h-screen">
      <Header />

      {/* Hero */}
      <section className="relative pt-24 pb-8 px-4">
        <div className="container mx-auto max-w-7xl">
          <div className="border-b border-white/10 pb-8 mb-8">
            <p className="text-[10px] font-bold tracking-[0.4em] text-white/30 mb-3 uppercase">Cambodia Music</p>
            <h1 className="text-4xl md:text-6xl font-black tracking-tight text-white uppercase leading-none">
              MEGA<br />HITS
            </h1>
            <p className="mt-4 text-[11px] md:text-[13px] text-white/40 tracking-widest">
              ALL-TIME RANKING — 500万再生突破曲
            </p>
          </div>
        </div>
      </section>

      {/* Ranking */}
      <section className="container mx-auto max-w-7xl px-4 md:px-6 pb-20">
        <MegaHitRanking />
      </section>

      <Footer />
    </main>
  );
}
