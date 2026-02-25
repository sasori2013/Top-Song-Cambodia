import { Header } from '@/components/Header';
import { PageHeader } from '@/components/PageHeader';
import { RankingList } from '@/components/RankingList';
import { getRankingData } from '@/lib/api';
import Link from 'next/link';

export default async function Home() {
  const data = await getRankingData();
  const ranking = data?.ranking || [];

  return (
    <main className="bg-black min-h-screen">
      <Header />
      <PageHeader stats={data?.stats} />
      <RankingList items={ranking} />

      <footer className="mt-60 pb-32 text-center px-6">
        <div className="max-w-2xl mx-auto space-y-4">
          <p className="text-[10px] md:text-[11px] tracking-[0.2em] font-medium text-white/50 leading-relaxed uppercase">
            HEAT is calculated using publicly available data from YouTube, Facebook, and streaming activity.<br />
            The index reflects engagement, growth, and momentum.
          </p>
          <div className="flex items-center justify-center gap-4">
            <div className="h-px w-8 bg-white/20" />
            <p className="text-[9px] tracking-[0.4em] font-bold text-white/30 uppercase">
              Updated daily
            </p>
            <div className="h-px w-8 bg-white/20" />
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4 pt-8">
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
    </main>
  );
}
