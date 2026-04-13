import { Header } from '@/components/Header';
import { PageHeader } from '@/components/PageHeader';
import { RankingList } from '@/components/RankingList';
import { RankingComingSoon } from '@/components/RankingComingSoon';
import { ArtistRegistration } from '@/components/ArtistRegistration';
import { Footer } from '@/components/Footer';
import { getRankingData } from '@/lib/api';

export const dynamic = 'force-dynamic';

// 🔒 Set NEXT_PUBLIC_SHOW_RANKING=false in Vercel to hide ranking
const SHOW_RANKING = process.env.NEXT_PUBLIC_SHOW_RANKING !== 'false';

export default async function Home() {
  const data = SHOW_RANKING ? await getRankingData() : null;
  const ranking = data?.ranking || [];

  return (
    <main className="bg-black min-h-screen">
      <Header />
      <PageHeader stats={data?.stats} />
      
      <ArtistRegistration />
      {SHOW_RANKING
        ? <RankingList items={ranking} stats={data?.stats} />
        : <RankingComingSoon />
      }

      <Footer />
    </main>
  );
}
