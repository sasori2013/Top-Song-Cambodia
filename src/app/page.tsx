import { Header } from '@/components/Header';
import { PageHeader } from '@/components/PageHeader';
import { HeatIndexMetrics } from '@/components/HeatIndexMetrics';
import { DailyActions } from '@/components/DailyActions';
import { DashboardChart } from '@/components/DashboardChart';
import { VerticalVideo } from '@/components/VerticalVideo';
import { ArtistRegistration } from '@/components/ArtistRegistration';
import { MegaHitAccordion } from '@/components/MegaHitAccordion';
import { Footer } from '@/components/Footer';
import { CambodiaHeatmap } from '@/components/CambodiaHeatmap';
import { NewReleasePulse } from '@/components/NewReleasePulse';
import { GenreStreamgraph } from '@/components/GenreStreamgraph';
import { getRankingData } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const data = await getRankingData();
  const ranking = data?.ranking || [];

  return (
    <main className="bg-black min-h-screen">
      <Header />
      <PageHeader stats={data?.stats} />

      {/* Main Dashboard Section */}
      <section className="relative z-10 container mx-auto max-w-7xl px-4 md:px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {/* Left Column: Top 20 Interactive Chart & Heatmap */}
          <div className="lg:col-span-2 w-full flex flex-col gap-6">
            <DashboardChart items={ranking} stats={data?.stats} />
            <CambodiaHeatmap
              data={data?.regionalData}
              stats={data?.stats}
              top3={data?.ranking?.slice(0, 3)}
            />
            <GenreStreamgraph data={data?.genreTrend} viewsData={data?.genreTrendViews} />
          </div>

          {/* Right Column: Weekly Short Video, Registration, and Metrics */}
          <div className="lg:col-span-1 w-full flex flex-col gap-6">
            <VerticalVideo videoId="nE1n6d4-8Dk" />
            <ArtistRegistration />
            <MegaHitAccordion />
            <NewReleasePulse data={data?.releaseActivity} />
            <HeatIndexMetrics growth={data?.stats?.heatGrowth} trend={data?.stats?.heatTrend} weeklyGenreViews={data?.stats?.weeklyGenreViews} />
            <DailyActions count={data?.stats?.dailyActions} />
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
