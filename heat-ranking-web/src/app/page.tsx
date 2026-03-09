import { Header } from '@/components/Header';
import { PageHeader } from '@/components/PageHeader';
import { RankingList } from '@/components/RankingList';
import { Footer } from '@/components/Footer';
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

      <Footer />
    </main>
  );
}
