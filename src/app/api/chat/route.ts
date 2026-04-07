import { NextRequest, NextResponse } from "next/server";
import { GoogleAuth } from "google-auth-library";
import { searchSongsByVector, getRankingDataFromBQ, getArtistMetadata } from "@/lib/bigquery";

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Invalid messages format" }, { status: 400 });
    }

    const lastMessage = messages[messages.length - 1];
    
    // 1. RAG: Fetch relevant data from BigQuery
    const [searchResults, rankingData] = await Promise.all([
      searchSongsByVector(lastMessage.content, 5),
      getRankingDataFromBQ()
    ]);

    // 1.1 Fetch metadata for the top matched artist (if any)
    let artistMetadata = null;
    if (searchResults.length > 0) {
      const topArtist = searchResults[0].artist;
      artistMetadata = await getArtistMetadata(topArtist);
    }

    // 2. GCP Config
    const PROJECT_ID = process.env.GCP_PROJECT_ID;
    const rawJson = (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '').trim().replace(/^['"]|['"]$/g, '');
    const LOCATION = 'us-central1';

    if (!rawJson || !PROJECT_ID) {
      return NextResponse.json({ error: "GCP Configuration is missing" }, { status: 500 });
    }

    const credentials = JSON.parse(rawJson);
    if (credentials.private_key) {
      credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
    }

    // 3. Authenticate with Google Cloud
    const auth = new GoogleAuth({
      credentials,
      scopes: 'https://www.googleapis.com/auth/cloud-platform',
    });
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const token = tokenResponse.token;

    // 4. Construct System Instruction & Context
    const systemInstruction = `あなたはカンボジア音楽の歴史と現状に精通した「音楽百科事典」AIであり、「HEAT」の公式専門アシスタントです。
[System Ver: 1.5K-ARCHIVE-ACTIVE]

【あなたの立場と信頼性】
あなたは、YouTubeやプロダクション公式データから収集された15,000曲以上の膨大な音楽アーカイブに基づいています。独自開発の「不正検知AI」により、信頼性の高い統計データ（再生数・エンゲージメント）を提供します。

【データ収集状況（全履歴アーカイブ）】
ユーザーから過去のデータや歴史について聞かれた際は、以下の最強のデータベースを活用してください：
- 現在の日付: 2026-04-07
- アーカイブ状況: **全 15,411 曲の歴史的データを完備**
- カバー範囲: 2000年代のクラシックから、2010年代の黄金期、現在のヒップホップ・ポップスまで全網羅。
- 登録アーティスト数: ${rankingData?.stats?.totalArtists || "1000以上"}
- 登録楽曲数: ${rankingData?.stats?.totalSongs || "15,000以上"}

【回答のガイドライン】
1. カンボジア音楽のパイオニア（VannDa, Preap Sovath, Rasmey Hang Meas等）から新進気鋭のインディーズまで、熱意を持って専門的に解説してください。
2. 提供された「検索結果コンテキスト」には、各曲の「累計再生数（Views）」が含まれています。これに基づき、「今までで最も再生された曲」などの質問に数字を交えて回答してください。
3. 2026年3月以前のデータについても「豊富に蓄積されている」と伝え、歴史的背景を解説してください。
4. ユーザーが使用した言語（例: 日本語）で親切に返答してください。

【コンテキスト情報】
---
■ 最新のHEAT Topランキング (勢いのある現在のTOP10):
${rankingData?.ranking.slice(0, 10).map(item => `No.${item.rank}: ${item.title} - ${item.artist} (HeatScore: ${item.heatScore})`).join('\n') || "データ取得中"}

■ 関連する歴史的楽曲の検索結果 (ベクトル検索 / 1.5万曲から抽出):
${searchResults.map(item => `- ${item.title} by ${item.artist} | 累計再生数: ${item.views?.toLocaleString() || "不明"} | カテゴリ: ${item.category || "その他"} | タグ: ${item.eventTag || "なし"} (Match: ${Math.round(item.cosine_similarity * 100)}%)`).join('\n') || "関連する楽曲は見つかりませんでした。"}

${artistMetadata ? `■ アーティスト詳細情報 (@${artistMetadata.name}):
- プロダクション: ${artistMetadata.productionName || "不明"}
- ジャンル: ${artistMetadata.genres || "不明"}
- 略歴: ${artistMetadata.bio || "情報なし"}
- YouTube登録者数: ${artistMetadata.subscribers || "不明"}` : ""}
---`;

    // 5. Format Chat History for Vertex AI REST API
    const allMessages = messages.slice(0, -1);
    const firstUserIndex = allMessages.findIndex((msg: any) => msg.role === "user");
    
    // Vertex AI expects contents: [{role: "user", parts: [{text: "..."}]}, {role: "model", parts: [...]}]
    const contents = [];
    
    if (firstUserIndex !== -1) {
      allMessages.slice(firstUserIndex).forEach((msg: any) => {
        contents.push({
          role: msg.role === "user" ? "user" : "model",
          parts: [{ text: msg.content }]
        });
      });
    }
    
    // Add the current prompt
    contents.push({
      role: "user",
      parts: [{ text: lastMessage.content }]
    });

    // 6. Call Vertex AI REST Endpoint (Successful test with gemini-2.0-flash-001)
    const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/gemini-2.0-flash-001:generateContent`;

    const body = {
      contents: contents,
      systemInstruction: {
        role: "system",
        parts: [{ text: systemInstruction }]
      },
      generationConfig: {
        maxOutputTokens: 1000,
        temperature: 0.7,
      }
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
        console.error("Vertex AI REST Error:", JSON.stringify(data));
        return NextResponse.json({ error: "Vertex AI API Error", detail: data }, { status: response.status });
    }

    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "申し訳ございません、回答を生成できませんでした。";

    return NextResponse.json({ text: responseText });
  } catch (error) {
    console.error("Error in AI Chat API (REST):", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
