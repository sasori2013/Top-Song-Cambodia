import { Header } from '@/components/Header';
import { PageHeader } from '@/components/PageHeader';
import { RankingList } from '@/components/RankingList';
import { ArtistRegistration } from '@/components/ArtistRegistration';
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

      <RankingList
        items={ranking}
        stats={data?.stats}
      >
        <ArtistRegistration />
      </RankingList>

      <Footer />
    </main>
  );
}
