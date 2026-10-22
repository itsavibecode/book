// The 13 tool groups from PLAN section 4.2. Only members with `available: true` are ever shown;
// a group with no available member is not rendered at all. Turning a tool on in a later
// release is a one-word change here plus its implementation in src/tools/index.ts.

export type GroupId =
  | 'move' | 'select' | 'lasso' | 'magic' | 'crop' | 'brush' | 'eraser' | 'fill'
  | 'retouch' | 'text' | 'shape' | 'pen' | 'view';

export type ToolId =
  | 'move' | 'selectRect' | 'selectEllipse' | 'brush' | 'eraser' | 'fill' | 'text'
  | 'shapeRect' | 'shapeEllipse' | 'hand' | 'zoom' | 'eyedropper'
  // not yet available (listed so the plan and the rail stay in one place)
  | 'artboard' | 'selectRow' | 'selectColumn' | 'lassoFree' | 'lassoPoly' | 'lassoMagnetic'
  | 'wand' | 'quickSelect' | 'objectSelect' | 'colourRange' | 'crop' | 'perspectiveCrop' | 'straighten'
  | 'pencil' | 'spray' | 'bgEraser' | 'magicEraser' | 'gradient' | 'pattern' | 'spotHeal' | 'clone'
  | 'dodge' | 'textVertical' | 'typeMask' | 'shapePolygon' | 'shapeLine' | 'pen' | 'freePen'
  | 'rotateView' | 'sampler' | 'ruler';

export interface ToolMember {
  id: ToolId;
  name: string;
  /** Key that selects this member directly. Members of a group share the group key unless they have their own. */
  key?: string;
  available: boolean;
  /** Short reason shown in the tooltip: why you would pick this tool. */
  hint: string;
}

export interface ToolGroup {
  id: GroupId;
  name: string;
  key: string;
  members: ToolMember[];
}

export const TOOL_GROUPS: ToolGroup[] = [
  { id: 'move', name: 'Move', key: 'V', members: [
    { id: 'move', name: 'Move', available: true, hint: 'Drag a layer around; arrow keys nudge it' },
    { id: 'artboard', name: 'Artboard', available: false, hint: '' },
  ] },
  { id: 'select', name: 'Select', key: 'M', members: [
    { id: 'selectRect', name: 'Rectangle select', available: true, hint: 'Limit painting and fills to a box' },
    { id: 'selectEllipse', name: 'Ellipse select', available: true, hint: 'Limit painting and fills to an oval' },
    { id: 'selectRow', name: 'Single row', available: false, hint: '' },
    { id: 'selectColumn', name: 'Single column', available: false, hint: '' },
  ] },
  { id: 'lasso', name: 'Lasso', key: 'L', members: [
    { id: 'lassoFree', name: 'Lasso', available: false, hint: '' },
    { id: 'lassoPoly', name: 'Polygonal lasso', available: false, hint: '' },
    { id: 'lassoMagnetic', name: 'Magnetic lasso', available: false, hint: '' },
  ] },
  { id: 'magic', name: 'Magic select', key: 'W', members: [
    { id: 'wand', name: 'Magic wand', available: false, hint: '' },
    { id: 'quickSelect', name: 'Quick selection', available: false, hint: '' },
    { id: 'objectSelect', name: 'Object select', available: false, hint: '' },
    { id: 'colourRange', name: 'Colour range', available: false, hint: '' },
  ] },
  { id: 'crop', name: 'Crop', key: 'C', members: [
    { id: 'crop', name: 'Crop', available: false, hint: '' },
    { id: 'perspectiveCrop', name: 'Perspective crop', available: false, hint: '' },
    { id: 'straighten', name: 'Straighten', available: false, hint: '' },
  ] },
  { id: 'brush', name: 'Brush', key: 'B', members: [
    { id: 'brush', name: 'Brush', available: true, hint: 'Paint with the foreground colour' },
    { id: 'pencil', name: 'Pencil', available: false, hint: '' },
    { id: 'spray', name: 'Airbrush', available: false, hint: '' },
  ] },
  { id: 'eraser', name: 'Eraser', key: 'E', members: [
    { id: 'eraser', name: 'Eraser', available: true, hint: 'Make pixels transparent' },
    { id: 'bgEraser', name: 'Background eraser', available: false, hint: '' },
    { id: 'magicEraser', name: 'Magic eraser', available: false, hint: '' },
  ] },
  { id: 'fill', name: 'Fill', key: 'G', members: [
    { id: 'fill', name: 'Paint bucket', available: true, hint: 'Fill an area of similar colour in one click' },
    { id: 'gradient', name: 'Gradient', available: false, hint: '' },
    { id: 'pattern', name: 'Pattern fill', available: false, hint: '' },
  ] },
  { id: 'retouch', name: 'Retouch', key: 'J', members: [
    { id: 'spotHeal', name: 'Spot heal', available: false, hint: '' },
    { id: 'clone', name: 'Clone stamp', available: false, hint: '' },
    { id: 'dodge', name: 'Dodge', available: false, hint: '' },
  ] },
  { id: 'text', name: 'Text', key: 'T', members: [
    { id: 'text', name: 'Text', available: true, hint: 'Type text that stays editable; click a text layer to edit it' },
    { id: 'textVertical', name: 'Vertical text', available: false, hint: '' },
    { id: 'typeMask', name: 'Type mask', available: false, hint: '' },
  ] },
  { id: 'shape', name: 'Shape', key: 'U', members: [
    { id: 'shapeRect', name: 'Rectangle', available: true, hint: 'Draw a rectangle that stays editable' },
    { id: 'shapeEllipse', name: 'Ellipse', available: true, hint: 'Draw an ellipse that stays editable' },
    { id: 'shapePolygon', name: 'Polygon', available: false, hint: '' },
    { id: 'shapeLine', name: 'Line', available: false, hint: '' },
  ] },
  { id: 'pen', name: 'Pen', key: 'P', members: [
    { id: 'pen', name: 'Pen', available: false, hint: '' },
    { id: 'freePen', name: 'Freeform pen', available: false, hint: '' },
  ] },
  { id: 'view', name: 'View', key: 'H', members: [
    { id: 'hand', name: 'Hand', key: 'H', available: true, hint: 'Pan around the picture; hold Space for it with any tool' },
    { id: 'zoom', name: 'Zoom', key: 'Z', available: true, hint: 'Click to zoom in, Alt-click to zoom out, drag to zoom to an area' },
    { id: 'eyedropper', name: 'Eyedropper', key: 'I', available: true, hint: 'Pick a colour from the picture; Alt picks the background colour' },
    { id: 'rotateView', name: 'Rotate view', available: false, hint: '' },
    { id: 'sampler', name: 'Colour sampler', available: false, hint: '' },
    { id: 'ruler', name: 'Ruler', available: false, hint: '' },
  ] },
];

export function availableMembers(g: ToolGroup): ToolMember[] {
  return g.members.filter((m) => m.available);
}

/** Groups that have at least one working tool, in rail order. */
export const VISIBLE_GROUPS: ToolGroup[] = TOOL_GROUPS.filter((g) => availableMembers(g).length > 0);

/** Visual separators in the rail come after these groups (only between visible groups). */
export const RAIL_GAP_AFTER: GroupId[] = ['crop', 'retouch', 'pen'];

export function groupOf(tool: ToolId): ToolGroup {
  return TOOL_GROUPS.find((g) => g.members.some((m) => m.id === tool))!;
}

export function memberOf(tool: ToolId): ToolMember {
  return groupOf(tool).members.find((m) => m.id === tool)!;
}

/** Shortcut key of a member: its own key, else its group's. */
export function memberKey(m: ToolMember, g: ToolGroup): string {
  return m.key ?? g.key;
}

export function findGroup(id: GroupId): ToolGroup {
  return TOOL_GROUPS.find((x) => x.id === id)!;
}
