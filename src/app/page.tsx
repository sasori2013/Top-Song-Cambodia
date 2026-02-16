import { Header } from '@/components/Header';
import { PageHeader } from '@/components/PageHeader';
import { RankingList } from '@/components/RankingList';
import { SubmissionForm } from '@/components/SubmissionForm';
import { getRankingData } from '@/lib/api';

export default async function Home() {
  const data = await getRankingData();
  const ranking = data?.ranking || [];

  return (
    <main className="bg-black min-h-screen">
      <Header />
      <PageHeader stats={data?.stats} />
      <RankingList items={ranking} />

      <SubmissionForm />

      <footer className="mt-20 pb-20 text-center">
        <p className="text-[10px] tracking-[0.3em] font-medium text-white/10 uppercase">
          Finalized Feed
        </p>
      </footer>
    </main>
  );
}
