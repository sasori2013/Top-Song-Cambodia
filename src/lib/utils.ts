import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/**
 * YouTubeのタイトルから不要な付加情報（(OFFICIAL VIDEO)など）を削除します。
 */
export function cleanSongTitle(title: string): string {
    if (!title) return title;

    // 削除対象のパターン (正規表現)
    const patterns = [
        /\(?\s*OFFICIAL VIDEO\s*\)?/gi,
        /\(?\s*Official MV\s*\)?/gi,
        /\(?\s*OFFICIAL MUSIC VIDEO\s*\)?/gi,
        /\[\s*Eng\s*&\s*Khmer\s*Sub\s*\]/gi,
        /\[\s*Official MV\s*\]/gi,
        /\[\s*OFFICIAL VIDEO\s*\]/gi,
        /\|\s*OFFICIAL VIDEO/gi,
        /\|\s*Official MV/gi,
        /\(?\s*Lyrics\s*\)?/gi,
        /\(?\s*Official Audio\s*\)?/gi,
        /\s*-\s*$/ // 文末に残ったハイフンも削除
    ];

    let cleaned = title;
    patterns.forEach(pattern => {
        cleaned = cleaned.replace(pattern, '');
    });

    return cleaned.trim();
}
