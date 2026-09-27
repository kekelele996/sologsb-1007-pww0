import { uid } from "./data";
import type { ProjectData, Speaker } from "./types";

export const SPEAKER_COLORS = [
  "#2563eb",
  "#be185d",
  "#0f766e",
  "#b45309",
  "#7c3aed",
  "#b91c1c",
  "#0369a1",
  "#4d7c0f",
];

/** 角色名匹配键：忽略首尾空白与大小写，中英文都安全。 */
export const speakerKey = (name: string) => name.trim().toLocaleLowerCase();

export const makeSpeaker = (name: string, role = "待确认", colorIndex = 0): Speaker => ({
  id: uid("sp"),
  name: name.trim(),
  role,
  color: SPEAKER_COLORS[colorIndex % SPEAKER_COLORS.length],
});

export interface SpeakerResolution {
  /** 与输入 names 等长，依次给出每个片段应使用的角色 id。 */
  speakerIds: string[];
  /** 本次新建的角色（调用方负责加入项目人物册）。 */
  created: Speaker[];
  /** 复用的已有同名角色数（按唯一名字计）。 */
  reused: number;
}

/**
 * 为一次导入的所有片段分配角色：
 * 同稿同名共用一个角色；项目已有同名角色直接复用；否则新建。
 */
export function resolveImportSpeakers(
  existing: Speaker[],
  names: (string | null)[],
  fallbackId: string,
  createId: () => string = () => uid("sp"),
): SpeakerResolution {
  const byKey = new Map(existing.map((speaker) => [speakerKey(speaker.name), speaker]));
  const created: Speaker[] = [];
  const resolvedKeys = new Map<string, string>();
  let reused = 0;
  let colorIndex = existing.length;
  const speakerIds = names.map((name) => {
    if (!name?.trim()) return fallbackId;
    const key = speakerKey(name);
    const cached = resolvedKeys.get(key);
    if (cached) return cached;
    const found = byKey.get(key);
    if (found) {
      resolvedKeys.set(key, found.id);
      reused += 1;
      return found.id;
    }
    const speaker: Speaker = {
      id: createId(),
      name: name.trim(),
      role: "待确认",
      color: SPEAKER_COLORS[colorIndex % SPEAKER_COLORS.length],
    };
    colorIndex += 1;
    created.push(speaker);
    byKey.set(key, speaker);
    resolvedKeys.set(key, speaker.id);
    return speaker.id;
  });
  return { speakerIds, created, reused };
}

export type RenameOutcome = "renamed" | "merged" | "unchanged" | "invalid";

/**
 * 重命名角色。新名字已被其他角色使用时，把当前角色的所有片段
 * （跨全部轨道）并入该同名角色，并移除当前角色。
 */
export function applySpeakerRename(
  draft: ProjectData,
  speakerId: string,
  rawName: string,
): { outcome: RenameOutcome; name: string; targetName?: string } {
  const name = rawName.trim();
  const speaker = draft.speakers.find((item) => item.id === speakerId);
  if (!speaker) return { outcome: "invalid", name };
  if (!name || name === speaker.name) return { outcome: "unchanged", name };
  const existing = draft.speakers.find(
    (item) => item.id !== speakerId && speakerKey(item.name) === speakerKey(name),
  );
  if (existing) {
    for (const track of draft.tracks) {
      for (const segment of track.segments) {
        if (segment.speakerId === speakerId) segment.speakerId = existing.id;
      }
    }
    draft.speakers = draft.speakers.filter((item) => item.id !== speakerId);
    return { outcome: "merged", name, targetName: existing.name };
  }
  speaker.name = name;
  return { outcome: "renamed", name };
}

/**
 * 兼容旧草稿：保证人物册存在，且每个片段引用的角色都在册中。
 * 早期版本把导入的发言人统一记为 sp-custom 占位 id，这里补成可改名的角色，
 * 原有片段一律保留。
 */
export function normalizeProjectSpeakers(project: ProjectData): ProjectData {
  if (!Array.isArray(project.speakers)) project.speakers = [];
  if (!project.speakers.length) {
    project.speakers.push({ id: "sp-interviewer", name: "采访者", role: "研究者", color: SPEAKER_COLORS[0] });
  }
  const known = new Set(project.speakers.map((speaker) => speaker.id));
  const missing: string[] = [];
  for (const track of project.tracks ?? []) {
    for (const segment of track.segments ?? []) {
      if (segment.speakerId && !known.has(segment.speakerId) && !missing.includes(segment.speakerId)) {
        missing.push(segment.speakerId);
      }
    }
  }
  let placeholderCount = 0;
  for (const id of missing) {
    placeholderCount += 1;
    project.speakers.push({
      id,
      name: id === "sp-custom" ? "导入发言人" : `未命名发言人 ${placeholderCount}`,
      role: "待确认",
      color: SPEAKER_COLORS[project.speakers.length % SPEAKER_COLORS.length],
    });
  }
  return project;
}
