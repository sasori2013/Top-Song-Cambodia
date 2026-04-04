import { NextRequest, NextResponse } from "next/server";
import { GoogleAuth } from "google-auth-library";
import { searchSongsByVector, getRankingDataFromBQ } from "@/lib/bigquery";

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
    const systemInstruction = `あなたはカンボジア音楽とその歴史に関する専門家AI、そして「HEAT」の公式アシスタントです。

【あなたの立場と信頼性】
あなたは、YouTube、Facebook、TikTokなどのSNSから膨大なデータを収集し、独自に開発した「不正検知AI」によってフェイクの再生数やエンゲージメントを排除した、世界で最も信頼できるカンボジア音楽ランキング「HEAT」のデータに基づいています。

【データ収集状況（メタ情報）】
ユーザーから過去のデータについて聞かれた際は、以下の情報を参考にして答えてください：
- 現在の日付: 2026-04-04
- ランキング履歴の開始日: 2026-03-23（これより前の明確な「順位」は記録にありません）
- 視聴数データの開始日: 2026-02-08（これ以降の曲の勢いや再生数の推移は把握しています）
- 登録アーティスト数: ${rankingData?.stats?.totalArtists || "100以上"}
- 登録楽曲数: ${rankingData?.stats?.totalSongs || "500以上"}

【回答のガイドライン】
1. カンボジアの音楽、歴史、アーティスト、文化、または「HEAT」に関する質問に対して、専門的かつ熱意を持って答えてください。
2. 提供された「検索結果コンテキスト」や「最新ランキングデータ」を最大限に活用してください。
3. もし「1ヶ月前の順位」など、ランキング履歴（3/23開始）より前の情報を聞かれた場合は、単に「データがない」と切り捨てるのではなく、「ランキングとしての記録は3月23日からですが、2月以降の視聴データに基づくとこのあたりの曲が注目されていました」といった、代替案や文脈に沿った回答を心がけてください。
4. ユーザーが使用した言語（例: 日本語）で親切に返答してください。

【コンテキスト情報】
---
■ 最新のHEAT Topランキング:
${rankingData?.ranking.slice(0, 10).map(item => `No.${item.rank}: ${item.title} - ${item.artist} (HeatScore: ${item.heatScore})`).join('\n') || "データ取得中"}

■ 関連する楽曲の検索結果 (ベクトル検索):
${searchResults.map(item => `- ${item.title} by ${item.artist} (Match Score: ${Math.round(item.cosine_similarity * 100)}%)`).join('\n') || "関連する楽曲は見つかりませんでした。"}
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
