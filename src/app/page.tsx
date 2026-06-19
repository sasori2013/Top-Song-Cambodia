import { Header } from '@/components/Header';
import { PageHeader } from '@/components/PageHeader';
import { IntelligenceOSMap } from '@/components/IntelligenceOSMap';
import { HeatIndexMetrics } from '@/components/HeatIndexMetrics';
import { DailyTrafficMetrics } from '@/components/DailyTrafficMetrics';
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

export const dynamic = 'force-dynamic'; // ビルド時静的レンダリング禁止（BQ認証情報はランタイムのみ有効）

export default async function Home() {
  const data = await getRankingData();
  const ranking = data?.ranking || [];

  const dailyActions = data?.stats?.dailyActions;
  const dailyGrowth = (dailyActions?.views && dailyActions?.prev?.views)
    ? ((dailyActions.views - dailyActions.prev.views) / dailyActions.prev.views) * 100
    : 0;

  return (
    <main className="bg-black min-h-screen">
      <Header />
      <PageHeader stats={data?.stats} />
      <IntelligenceOSMap totalSongs={data?.stats?.totalSongs} />

      {/* Main Dashboard Section */}
      <section className="relative z-10 container mx-auto max-w-7xl px-4 md:px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {/* Left Column: 2-column wide components */}
          <div className="lg:col-span-2 w-full space-y-8">
            <DashboardChart items={ranking} stats={data?.stats} />
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <DailyTrafficMetrics
                growth={dailyGrowth}
                trend={data?.stats?.dailyTraffic?.map(item => item.value) || []}
                dailyGenreViews={data?.stats?.dailyActions?.genreViews || []}
              />
              <HeatIndexMetrics 
                growth={data?.stats?.heatGrowth} 
                trend={data?.stats?.heatTrend} 
                weeklyGenreViews={data?.stats?.weeklyGenreViews} 
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <NewReleasePulse data={data?.releaseActivity} />
              <DailyActions count={data?.stats?.dailyActions} />
            </div>

            <GenreStreamgraph data={data?.genreTrend} viewsData={data?.genreTrendViews} />
            <CambodiaHeatmap
              data={data?.regionalData}
              stats={data?.stats}
              top3={data?.ranking?.slice(0, 3)}
            />
          </div>

          {/* Right Column: 1-column wide components */}
          <div className="lg:col-span-1 w-full space-y-8">
            <VerticalVideo videoId="nE1n6d4-8Dk" />
            <MegaHitAccordion />
            <ArtistRegistration />
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
