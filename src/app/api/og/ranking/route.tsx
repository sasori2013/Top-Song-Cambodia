import { ImageResponse } from 'next/og';
import { cleanSongTitle } from '@/lib/utils';

export const runtime = 'edge';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);

    // テンプレートタイプ (rank1 or multi)
    const template = searchParams.get('template') || 'rank1';
    const date = searchParams.get('date') || '2026 02 18';

    // 共通フォントの読み込み
    const [fontArialRegular, fontArialBold, fontArialItalic, fontArialBoldItalic, fontKhmerRegular, fontKhmerBold] = await Promise.all([
        fetch(new URL('/fonts/Arial.ttf', request.url)).then((res) => res.arrayBuffer()),
        fetch(new URL('/fonts/Arial Bold.ttf', request.url)).then((res) => res.arrayBuffer()),
        fetch(new URL('/fonts/Arial Italic.ttf', request.url)).then((res) => res.arrayBuffer()),
        fetch(new URL('/fonts/Arial Bold Italic.ttf', request.url)).then((res) => res.arrayBuffer()),
        fetch(new URL('/fonts/KantumruyPro-Regular.ttf', request.url)).then((res) => res.arrayBuffer()),
        fetch(new URL('/fonts/KantumruyPro-Bold.ttf', request.url)).then((res) => res.arrayBuffer()),
    ]);

    const commonFonts: any[] = [
        { name: 'Arial', data: fontArialRegular, weight: 400, style: 'normal' },
        { name: 'Arial', data: fontArialBold, weight: 700, style: 'normal' },
        { name: 'Arial', data: fontArialItalic, weight: 400, style: 'italic' },
        { name: 'Arial-BoldItalic', data: fontArialBoldItalic, weight: 400, style: 'normal' },
        { name: 'Kantumruy Pro', data: fontKhmerRegular, weight: 400, style: 'normal' },
        { name: 'Kantumruy Pro', data: fontKhmerBold, weight: 700, style: 'normal' },
    ];

    // パラメータ取得 (共通項目) - 曲名のクリーンアップを適用
    const rank = searchParams.get('rank') || '1';
    const artist = searchParams.get('artist') || 'NORITH';
    const title = cleanSongTitle(searchParams.get('title') || 'DECADE OF LOVE');
    const heatPoint = searchParams.get('heatPoint') || '368';
    const growth = searchParams.get('growth') || '0.55';
    const views = searchParams.get('views') || '276K';
    const engagement = searchParams.get('engagement') || '87';
    const change = searchParams.get('change') || '';

    // 背景画像の決定 (ユーザーの指定に従い backgrounds フォルダからランダムに、thumbnailは無視)
    const bgNum = (Math.floor(Math.random() * 5) + 1).toString().padStart(2, '0');
    const backgroundUrl = new URL(`/backgrounds/bg${bgNum}.jpg`, request.url).toString();

    // ロゴ (logo.png を使用)
    const logoUrl = new URL('/logo.png', request.url).toString();

    // 長文タイトル対策: フォントサイズ調整ロジック
    const getTitleFontSize = (text: string, isRank1: boolean) => {
        const len = text.length;
        if (isRank1) {
            if (len > 40) return '40px';
            if (len > 25) return '50px';
            return '60px';
        } else {
            if (len > 40) return '35px';
            if (len > 25) return '45px';
            return '65px';
        }
    };

    const renderChangeText = (changeStr: string, isRank1: boolean) => {
        if (!changeStr) return null;

        let color = '#999'; // STAY
        let text = 'STAY';
        let icon = '';

        if (changeStr === 'NEW') {
            color = '#00E5FF'; // Digital Cyan (blue-green)
            text = 'NEW ENTRY';
            icon = '';
        } else {
            const val = parseInt(changeStr);
            if (val > 0) {
                color = '#00E5FF'; // Digital Cyan (blue-green)
                text = `UP ${Math.abs(val)}`;
                icon = '▲ ';
            } else if (val < 0) {
                color = '#999'; // Gray for DOWN
                text = `DOWN ${Math.abs(val)}`;
                icon = '▼ ';
            } else if (val === 0) {
                color = '#999'; // STAY
                text = 'STAY';
                icon = '';
            }
        }

        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                color: color,
                fontSize: isRank1 ? '34px' : '26px',
                fontWeight: 700,
                letterSpacing: '4px',
                fontFamily: 'Arial',
            }}>
                <span style={{ marginRight: '10px', display: 'flex', alignItems: 'center', transform: 'translateY(-2px)' }}>{icon}</span> {text}
            </div>
        );
    };

    // --- Content Rendering ---

    if (template === 'legacy') {
        // 以前のダイヤモンド・デザインを復元
        return new ImageResponse(
            (
                <div style={{
                    backgroundColor: '#000', color: '#fff', fontFamily: 'Arial',
                    width: '1200px', height: '1200px', display: 'flex',
                    flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    position: 'relative', overflow: 'hidden'
                }}>
                    <img src={backgroundUrl} style={{ position: 'absolute', top: 0, left: 0, width: '1200px', height: '1200px', objectFit: 'cover' }} />
                    <div style={{ position: 'absolute', top: 0, left: 0, width: '1200px', height: '1200px', backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex' }} />

                    {/* Ranking Section */}
                    <div style={{ display: 'flex', position: 'relative', marginBottom: '30px', alignItems: 'flex-end', zIndex: 10 }}>
                        <div style={{ width: '48px', height: '48px', backgroundColor: '#fff', transform: 'rotate(45deg)', position: 'absolute', left: '-65px', bottom: '22px', display: 'flex' }} />
                        <div style={{ fontSize: '380px', fontWeight: 700, lineHeight: 0.8, display: 'flex', letterSpacing: '-15px' }}>{rank}</div>
                    </div>

                    {/* Info Section */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', zIndex: 10, marginTop: '-10px', width: '100%' }}>
                        <div style={{ fontSize: '98px', fontWeight: 400, display: 'flex', letterSpacing: '5px', textTransform: 'uppercase' }}>{artist}</div>
                        <div style={{ fontSize: '46px', fontWeight: 400, marginTop: '10px', display: 'flex', letterSpacing: '2px', textTransform: 'uppercase', fontFamily: 'Kantumruy Pro, Arial' }}>{title}</div>
                        <div style={{ fontSize: '28px', color: '#ccc', marginTop: '25px', display: 'flex', letterSpacing: '2px', textTransform: 'uppercase', fontWeight: 400 }}>
                            {heatPoint} HEAT POINT | {growth}% | {views} | {engagement}%
                        </div>
                    </div>

                    {/* Footer Left */}
                    <div style={{ position: 'absolute', left: '80px', bottom: '80px', display: 'flex', flexDirection: 'column', fontSize: '25px', fontWeight: 400, color: '#bbb', letterSpacing: '5px', lineHeight: '1.4', zIndex: 10 }}>
                        <div style={{ display: 'flex' }}>AI DRIVEN</div>
                        <div style={{ display: 'flex' }}>CAMBODIA MUSIC</div>
                        <div style={{ display: 'flex' }}>DAILY RANKING</div>
                        <div style={{ display: 'flex' }}>{date}</div>
                    </div>
                    {/* Footer Right (Logo) */}
                    <div style={{ position: 'absolute', right: '80px', bottom: '80px', display: 'flex', zIndex: 10 }}>
                        <img src={logoUrl} width="240" height="66" style={{ objectFit: 'contain', display: 'flex' }} />
                    </div>
                </div>
            ),
            { width: 1200, height: 1200, fonts: commonFonts }
        );
    } else if (template === 'rank1') {
        const titleFontSize = getTitleFontSize(title, true);
        return new ImageResponse(
            (
                <div style={{
                    position: 'relative', width: '1200px', height: '1200px', display: 'flex',
                    flexDirection: 'column', alignItems: 'center', backgroundColor: '#000', color: '#fff',
                    fontFamily: 'Arial, sans-serif', overflow: 'hidden'
                }}>
                    {/* Background Surface */}
                    <img src={backgroundUrl} style={{ position: 'absolute', top: 0, left: 0, width: '1200px', height: '1200px', objectFit: 'cover' }} />
                    <div style={{ position: 'absolute', top: 0, left: 0, width: '1200px', height: '1200px', backgroundColor: 'rgba(0,0,0,0.55)', display: 'flex' }} />

                    {/* Logo Section */}
                    <div style={{ position: 'absolute', top: '60px', left: '60px', display: 'flex', zIndex: 10 }}>
                        <img src={logoUrl} width="300" height="82" style={{ objectFit: 'contain', display: 'flex', opacity: 1 }} />
                    </div>

                    {/* Main Content Area - Centered and Tight */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '260px', width: '100%', zIndex: 10 }}>

                        {/* 1. Ranking Area: Diamond + Huge Number (Very Tight) */}
                        <div style={{ display: 'flex', position: 'relative', alignItems: 'flex-end', justifyContent: 'center' }}>
                            {/* White Diamond - Nudged 20px left and 30px down */}
                            <div style={{
                                width: '60px', height: '60px', backgroundColor: '#fff',
                                transform: 'rotate(45deg)', position: 'absolute',
                                left: '-50px', bottom: '55px', display: 'flex'
                            }} />
                            {/* Number 1: Bold Italic, tight line height */}
                            <div style={{
                                fontSize: '500px', fontFamily: 'Arial-BoldItalic',
                                letterSpacing: '-25px', display: 'flex', lineHeight: 0.85
                            }}>1</div>
                        </div>

                        {/* 2. Artist Section: Bold Italic, pulled UP to number */}
                        <div style={{
                            fontSize: '95px', fontFamily: 'Arial-BoldItalic',
                            letterSpacing: '3px', textTransform: 'uppercase',
                            display: 'flex', textAlign: 'center', marginTop: '-30px'
                        }}>{artist}</div>

                        {/* 3. Song Title Section: Normal Font Weight, Smaller and Tighter */}
                        <div style={{
                            fontSize: '52px', fontWeight: 400, marginTop: '10px',
                            textTransform: 'uppercase', fontFamily: 'Arial, "Kantumruy Pro"',
                            display: 'flex', textAlign: 'center', lineHeight: 1.1, maxWidth: '1000px'
                        }}>{title}</div>

                        {/* 4. Rank Movement & Stats Area */}

                        {/* Rank Movement Indicator */}
                        {change && (
                            <div style={{ display: 'flex', marginBottom: '15px', marginTop: '10px' }}>
                                {renderChangeText(change, true)}
                            </div>
                        )}

                        {/* 5. Points & Stats Area: Even smaller and lighter */}
                        <div style={{
                            fontSize: '24px', color: '#bbb', marginTop: '0px',
                            letterSpacing: '2px', display: 'flex', textTransform: 'uppercase'
                        }}>
                            {heatPoint} HEAT POINT | {Number(growth) > 0 ? '+' : ''}{growth}% | {views} | {engagement}%
                        </div>
                    </div>

                    {/* Bottom Footer Info: Wide letter spacing */}
                    <div style={{ position: 'absolute', bottom: '80px', right: '80px', fontSize: '24px', color: '#999', letterSpacing: '8px', textTransform: 'uppercase', display: 'flex' }}>
                        Cambodia Daily Ranking | {date}
                    </div>
                </div>
            ),
            { width: 1200, height: 1200, fonts: commonFonts }
        );
    } else {
        // Multi-rank template (2-4, 5-7, 8-10)
        const itemsJson = searchParams.get('items') || '[]';
        const items = JSON.parse(itemsJson);

        return new ImageResponse(
            (
                <div style={{
                    position: 'relative', width: '1200px', height: '1200px', display: 'flex',
                    flexDirection: 'column', backgroundColor: '#000', color: '#fff',
                    fontFamily: 'Arial, sans-serif', overflow: 'hidden'
                }}>
                    {/* Background Surface */}
                    <img src={backgroundUrl} style={{ position: 'absolute', top: 0, left: 0, width: '1200px', height: '1200px', objectFit: 'cover' }} />
                    <div style={{ position: 'absolute', top: 0, left: 0, width: '1200px', height: '1200px', backgroundColor: 'rgba(0,0,0,0.55)', display: 'flex' }} />

                    {/* Top Left Logo - Unified with Rank 1 */}
                    <div style={{ position: 'absolute', top: '60px', left: '60px', display: 'flex', zIndex: 10 }}>
                        <img src={logoUrl} width="300" height="82" style={{ objectFit: 'contain', display: 'flex', opacity: 1 }} />
                    </div>

                    {/* List Items Area - Nudged up 50px (marginTop: 400px) */}
                    <div style={{ display: 'flex', flexDirection: 'column', marginTop: '400px', marginLeft: '30px', zIndex: 10 }}>
                        {items.slice(0, 3).map((item: any, i: number) => {
                            const cleanedTitle = cleanSongTitle(item.title);
                            const itemFontSize = getTitleFontSize(cleanedTitle, false);
                            return (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', marginBottom: '55px' }}>
                                    {/* Rank Number: Bold Italic */}
                                    <div style={{
                                        fontSize: '110px', fontFamily: 'Arial-BoldItalic',
                                        width: '130px', display: 'flex', justifyContent: 'flex-end',
                                        marginRight: '40px', flexShrink: 0
                                    }}>
                                        {item.rank}
                                    </div>
                                    {/* Text Block: Title (Normal) + Artist (Bold Italic) */}
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <div style={{
                                            fontSize: itemFontSize, textTransform: 'uppercase',
                                            fontFamily: 'Arial, "Kantumruy Pro"', fontWeight: 400,
                                            display: 'flex', lineHeight: 1.1
                                        }}>
                                            {cleanedTitle}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', marginTop: '-5px' }}>
                                            <div style={{
                                                fontSize: '48px', fontFamily: 'Arial-BoldItalic',
                                                color: '#fff', textTransform: 'uppercase',
                                                display: 'flex', marginRight: '30px'
                                            }}>
                                                {item.artist}
                                            </div>
                                            {item.change !== undefined && renderChangeText(String(item.change), false)}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Bottom Footer Info: Unified with Rank 1 */}
                    <div style={{ position: 'absolute', bottom: '80px', right: '80px', fontSize: '24px', color: '#999', letterSpacing: '8px', textTransform: 'uppercase', display: 'flex' }}>
                        Cambodia Daily Ranking | {date}
                    </div>
                </div>
            ),
            { width: 1200, height: 1200, fonts: commonFonts }
        );
    }
}
