import { Header } from '@/components/Header';
import { PageHeader } from '@/components/PageHeader';
import { RankingList } from '@/components/RankingList';
import { ArtistRegistration } from '@/components/ArtistRegistration';
import { Footer } from '@/components/Footer';
import { getRankingData } from '@/lib/api';

export const dynamic = 'force-dynamic';

// 🔒 Set NEXT_PUBLIC_SHOW_RANKING=false in Vercel to hide ranking
const SHOW_RANKING = process.env.NEXT_PUBLIC_SHOW_RANKING !== 'false';

export default async function Home() {
  // Always fetch to keep the stats in PageHeader updated
  const data = await getRankingData();
  const ranking = data?.ranking || [];

  return (
    <main className="bg-black min-h-screen">
      <Header />
      <PageHeader stats={data?.stats} />
      
      <RankingList 
        items={ranking} 
        stats={data?.stats} 
        showList={SHOW_RANKING}
      >
        <ArtistRegistration />
      </RankingList>

      <Footer />
    </main>
  );
}
