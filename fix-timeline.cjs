const fs = require('fs');

const src = `import { tables, saveDatabase } from './core.js';
import * as types from '../../src/types.js';
import * as dbTypes from './types.js';

export function getTimeline(projectId: string): types.ProjectTimeline | undefined {
  return tables.timelines.find(t => t.projectId === projectId);
}

export function saveTimeline(timeline: types.ProjectTimeline): types.ProjectTimeline {
  const index = tables.timelines.findIndex(t => t.projectId === timeline.projectId);
  if (index !== -1) {
    tables.timelines[index] = timeline;
  } else {
    tables.timelines.push(timeline);
  }
  saveDatabase();
  return timeline;
}

export function updateTimelineClip(
  projectId: string,
  clipId: string,
  updates: Partial<types.TimelineTrackItem>
): boolean {
  const timeline = getTimeline(projectId);
  if (!timeline) return false;

  let updated = false;
  for (const track of timeline.tracks) {
    const itemIndex = track.items.findIndex((item) => item.id === clipId);
    if (itemIndex !== -1) {
      track.items[itemIndex] = { ...track.items[itemIndex], ...updates };
      updated = true;
      break;
    }
  }

  if (updated) {
    saveDatabase();
  }
  return updated;
}

export function deleteTimelineClip(projectId: string, clipId: string): boolean {
  const timeline = getTimeline(projectId);
  if (!timeline) return false;

  let deleted = false;
  for (const track of timeline.tracks) {
    const prevLength = track.items.length;
    track.items = track.items.filter((item) => item.id !== clipId);
    if (track.items.length < prevLength) {
      deleted = true;
    }
  }

  if (deleted) {
    saveDatabase();
  }
  return deleted;
}

export function reorderTimelineClips(projectId: string, trackId: string, orderedItemIds: string[]): types.ProjectTimeline | undefined {
  const timeline = getTimeline(projectId);
  if (!timeline) return undefined;

  const track = timeline.tracks.find(t => t.id === trackId);
  if (track) {
    const itemsMap = new Map<string, types.TimelineTrackItem>(track.items.map((item) => [item.id, item]));
    const reordered: types.TimelineTrackItem[] = [];

    for (const id of orderedItemIds) {
      const item = itemsMap.get(id);
      if (item) {
        reordered.push(item);
        itemsMap.delete(id);
      }
    }
    // Append any unreferenced items
    for (const remaining of Array.from(itemsMap.values())) {
      reordered.push(remaining);
    }

    // Recalculate start times sequentially for video track
    let currentGlobalTime = 0;
    for (const item of reordered) {
      item.startTime = currentGlobalTime;
      currentGlobalTime += item.duration;
    }

    track.items = reordered;
    saveDatabase();
  }
  return timeline;
}
`;
fs.writeFileSync('server/db/timeline.ts', src);
