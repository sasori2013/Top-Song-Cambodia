import { Header } from '@/components/Header';
import { PageHeader } from '@/components/PageHeader';
import { MainRankingView } from '@/components/MainRankingView';
import { Footer } from '@/components/Footer';
import { getRankingData } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const data = await getRankingData();
  const ranking = data?.ranking || [];

  return (
    <main className="bg-black min-h-screen">
      <Header />
      <PageHeader stats={data?.stats} />
      
      {/* AI Semantic Search & Ranking System */}
      <MainRankingView initialItems={ranking} stats={data?.stats} />

      <Footer />
    </main>
  );
}
