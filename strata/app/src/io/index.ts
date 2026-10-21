// IO ENTRY POINT. STUB until the engine agent replaces each line with the real implementation.
import type { IoApi } from '@/engine/contract';
export type { ExportFormat, ExportOptions, ExportResult, ImportedImage, LossItem } from '@/engine/contract';

const stub = (name: string) => (() => { throw new Error(`io stub: ${name}`); }) as never;

export const importImageFile: IoApi['importImageFile'] = stub('importImageFile');
export const classifyFiles: IoApi['classifyFiles'] = stub('classifyFiles');
export const exportImage: IoApi['exportImage'] = stub('exportImage');
export const lossList: IoApi['lossList'] = stub('lossList');
export const estimateSize: IoApi['estimateSize'] = stub('estimateSize');
export const saveStrata: IoApi['saveStrata'] = stub('saveStrata');
export const openStrata: IoApi['openStrata'] = stub('openStrata');
export const downloadBlob: IoApi['downloadBlob'] = stub('downloadBlob');
export const saveAs: IoApi['saveAs'] = stub('saveAs');
