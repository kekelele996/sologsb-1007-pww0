import { uid } from "./data";
import { parseTime } from "./persistence";
import type { Segment } from "./types";

/** 解析出的片段：发言人先记姓名，角色 id 由人物册统一分配。 */
export type ParsedSegment = Omit<Segment, "speakerId"> & { speakerName: string | null };

export interface ParsedTranscript {
  name: string;
  segments: ParsedSegment[];
}

const speakerPrefix = (text: string) => text.match(/^([^：:]{1,10})[：:]/);

const makeParsedSegment = (
  start: number,
  end: number,
  rawText: string,
): ParsedSegment => {
  const speakerName = speakerPrefix(rawText)?.[1]?.trim() || null;
  return {
    id: uid("seg"),
    start,
    end,
    speakerName,
    text: rawText.replace(/^[^：:]{1,10}[：:]\s*/, ""),
    confidence: 3,
    reviewed: false,
    flags: { lowConfidence: false, dialect: false, properNoun: false },
    tagIds: [],
    comments: [],
  };
};

export function parseTimedTranscript(input: string, trackName: string): ParsedTranscript {
  const blocks = input.trim().split(/\n\s*\n/);
  const segments: ParsedSegment[] = [];
  const srtPattern = /(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})/;
  const bracketPattern = /^\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*[-–]?\s*(.*)$/;

  for (const rawBlock of blocks) {
    const lines = rawBlock.split("\n").map((line) => line.trim()).filter(Boolean);
    if (!lines.length) continue;
    const srtIndex = lines.findIndex((line) => srtPattern.test(line));
    if (srtIndex >= 0) {
      const match = srtPattern.exec(lines[srtIndex]);
      const text = lines.slice(srtIndex + 1).join(" ");
      segments.push(
        makeParsedSegment(parseTime(match?.[1] ?? "0"), parseTime(match?.[2] ?? "1"), text),
      );
      continue;
    }
    for (const line of lines) {
      const match = bracketPattern.exec(line);
      if (!match) continue;
      const start = parseTime(match[1]);
      const text = match[2];
      segments.push(makeParsedSegment(start, start + Math.max(3, text.length / 5), text));
    }
  }

  if (!segments.length && input.trim()) {
    input.split("\n").map((line) => line.trim()).filter(Boolean).forEach((text, index) => {
      segments.push(makeParsedSegment(index * 6, index * 6 + 5.4, text));
    });
  }

  return { name: trackName || "导入轨", segments };
}
