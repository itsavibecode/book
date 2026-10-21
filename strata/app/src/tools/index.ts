// Tool implementations by id, and tool switching (key, Shift+key cycling, flyouts).
import { groupMember, toolGroup, toolId } from '@/app/state';
import { brushTool, eraserTool } from './brush';
import { fillTool } from './fill';
import { moveTool } from './move';
import { availableMembers, findGroup, groupOf, type GroupId, type ToolId } from './registry';
import { selectEllipseTool, selectRectTool } from './select';
import { shapeEllipseTool, shapeRectTool } from './shape';
import { commitTextEdit, textTool } from './text';
import type { Tool } from './types';
import { eyedropperTool, handTool, zoomTool } from './view';

export const TOOLS: Partial<Record<ToolId, Tool>> = {
  move: moveTool,
  selectRect: selectRectTool,
  selectEllipse: selectEllipseTool,
  brush: brushTool,
  eraser: eraserTool,
  fill: fillTool,
  text: textTool,
  shapeRect: shapeRectTool,
  shapeEllipse: shapeEllipseTool,
  hand: handTool,
  zoom: zoomTool,
  eyedropper: eyedropperTool,
};

/** Listeners (the viewport) that must cancel in-progress gestures when the tool changes. */
const changeListeners = new Set<() => void>();
export function onToolChange(fn: () => void): () => void {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}

export function currentTool(): Tool | undefined {
  return TOOLS[toolId.peek()];
}

export function selectTool(id: ToolId): void {
  if (id === toolId.peek()) return;
  changeListeners.forEach((f) => f());
  if (id !== 'text') commitTextEdit();
  const g = groupOf(id);
  groupMember.value = { ...groupMember.peek(), [g.id]: id };
  toolGroup.value = g.id;
}

/** Selects the group's current member; when the group is already active, does nothing. */
export function selectGroup(g: GroupId): void {
  const grp = findGroup(g);
  const members = availableMembers(grp);
  if (!members.length) return;
  const current = groupMember.peek()[g];
  selectTool(current && members.some((m) => m.id === current) ? current : members[0].id);
}

/** Shift+key: next available member of the group (selecting the group first if needed). */
export function cycleGroup(g: GroupId): void {
  const members = availableMembers(findGroup(g));
  if (!members.length) return;
  if (toolGroup.peek() !== g) { selectGroup(g); return; }
  const i = members.findIndex((m) => m.id === toolId.peek());
  selectTool(members[(i + 1) % members.length].id);
}
