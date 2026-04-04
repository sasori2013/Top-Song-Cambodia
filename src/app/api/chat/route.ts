import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
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

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "API key is not configured" },
        { status: 500 }
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    
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

    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      systemInstruction: systemInstruction
    });
    
    // Convert generic chat history into Gemini's expected format.
    const history = messages.slice(0, -1).map((msg: any) => ({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.content }],
    }));

    const chat = model.startChat({
      history: history,
      generationConfig: {
        maxOutputTokens: 1000,
      },
    });

    const result = await chat.sendMessage(lastMessage.content);
    const responseText = result.response.text();

    return NextResponse.json({ text: responseText });
  } catch (error) {
    console.error("Error in AI Chat API:", error);
    return NextResponse.json(
      { error: "Failed to process chat request" },
      { status: 500 }
    );
  }
}
