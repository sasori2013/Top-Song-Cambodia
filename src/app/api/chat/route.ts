import { NextRequest, NextResponse } from "next/server";
import { VertexAI } from "@google-cloud/vertexai";
import { searchSongsByVector, getRankingDataFromBQ } from "@/lib/bigquery";

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: "Invalid messages format" },
        { status: 400 }
      );
    }

    const lastMessage = messages[messages.length - 1];
    
    // RAG: Fetch relevant data from BigQuery
    const [searchResults, rankingData] = await Promise.all([
      searchSongsByVector(lastMessage.content, 5),
      getRankingDataFromBQ()
    ]);

    // GCP & Vertex AI Config
    const PROJECT_ID = process.env.GCP_PROJECT_ID;
    const rawJson = (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '').trim().replace(/^['"]|['"]$/g, '');
    const LOCATION = 'us-central1';

    if (!rawJson || !PROJECT_ID) {
      return NextResponse.json(
        { error: "GCP Configuration is missing" },
        { status: 500 }
      );
    }

    const credentials = JSON.parse(rawJson);
    if (credentials.private_key) {
      credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
    }

    const vertexAI = new VertexAI({
      project: PROJECT_ID,
      location: LOCATION,
      googleAuthOptions: {
        credentials
      }
    });
    
    const generativeModel = vertexAI.getGenerativeModel({
      model: "gemini-1.5-flash",
    });
    
    // Construct the context-aware system instruction
    const systemInstruction = `あなたはカンボジア音楽とその歴史に関する専門家AI、そして「HEAT」の公式アシスタントです。

【あなたの立場と信頼性】
あなたは、YouTube、Facebook、TikTokなどのSNSから膨大なデータを収集し、独自に開発した「不正検知AI」によってフェイクの再生数やエンゲージメントを排除した、世界で最も信頼できるカンボジア音楽ランキング「HEAT」のデータに基づいています。あなたの回答は、単なる推測ではなく、これらの厳格なデータ分析に基づいた裏付けのある情報であることを前提としてください。

【回答のガイドライン】
1. カンボジアの音楽、歴史、アーティスト、文化、または「HEAT」に関する質問に対して、専門的かつ熱意を持って答えてください。
2. 提供された「検索結果コンテキスト」や「最新ランキングデータ」を最大限に活用し、具体的な曲名やアーティスト名、スコアに言及してください。
3. ユーザーが使用した言語（例: 日本語）で親切に返答してください。
4. 情報が不足している場合は、HEATのサイト上でさらに詳しく確認できることを案内してください。

【コンテキスト情報】
---
■ 最新のHEAT Topランキング:
${rankingData?.ranking.slice(0, 10).map(item => `No.${item.rank}: ${item.title} - ${item.artist} (HeatScore: ${item.heatScore})`).join('\n') || "データ取得中"}

■ 関連する楽曲の検索結果 (ベクトル検索):
${searchResults.map(item => `- ${item.title} by ${item.artist} (Match Score: ${Math.round(item.cosine_similarity * 100)}%)`).join('\n') || "関連する楽曲は見つかりませんでした。"}
---`;

    // History conversion for Vertex AI (starts with user)
    const allMessages = messages.slice(0, -1);
    const firstUserIndex = allMessages.findIndex((msg: any) => msg.role === "user");
    
    const history = firstUserIndex !== -1 
      ? allMessages.slice(firstUserIndex).map((msg: any) => ({
          role: msg.role === "user" ? "user" : "model",
          parts: [{ text: msg.content }],
        }))
      : [];

    const chat = generativeModel.startChat({
      history: history,
      systemInstruction: {
        role: "system",
        parts: [{ text: systemInstruction }]
      }
    });

    const result = await chat.sendMessage(lastMessage.content);
    const responseText = result.response.candidates?.[0]?.content?.parts?.[0]?.text || "申し訳ございません、回答を生成できませんでした。";

    return NextResponse.json({ text: responseText });
  } catch (error) {
    console.error("Error in AI Chat API (Vertex AI):", error);
    return NextResponse.json(
      { error: "Failed to process chat request via Vertex AI" },
      { status: 500 }
    );
  }
}
