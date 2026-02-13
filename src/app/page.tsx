import { Header } from '@/components/Header';
import { Hero } from '@/components/Hero';
import { RankingList } from '@/components/RankingList';
import { getRankingData } from '@/lib/api';

export default async function Home() {
  const data = await getRankingData();
  const ranking = data?.ranking || [];
  const topItem = ranking[0];
  const otherItems = ranking.slice(1, 11);

  return (
    <main className="bg-black min-h-screen">
      <Header />
      <Hero topItem={topItem} />
      <RankingList items={otherItems} />

      <footer className="mt-40 pb-20 text-center">
        <p className="text-[10px] tracking-[0.3em] font-medium text-white/10 uppercase">
          Finalized Feed
        </p>
      </footer>
    </main>
  );
}
