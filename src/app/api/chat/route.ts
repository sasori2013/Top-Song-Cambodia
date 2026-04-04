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
あなたは、YouTube、Facebook、TikTokなどのSNSからデータを収集し、「不正検知AI」によって信頼性を担保したカンボジア音楽ランキング「HEAT」のデータに基づいています。

【回答のガイドライン】
1. 提供されたランキングデータや検索結果（コンテキスト）を優先的に使用して答えてください。
2. 常に日本語で、親切かつ情熱的に回答してください。

【コンテキスト情報】
---
■ 最新のHEAT Topランキング:
${rankingData?.ranking.slice(0, 10).map(item => `No.${item.rank}: ${item.title} - ${item.artist}`).join('\n') || "データ取得中"}

■ 関連楽曲 (ベクトル検索結果):
${searchResults.map(item => `- ${item.title} by ${item.artist}`).join('\n') || "なし"}
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
