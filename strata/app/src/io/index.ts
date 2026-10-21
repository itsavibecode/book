// IO ENTRY POINT.
import type { IoApi } from '@/engine/contract';
import { classifyFiles as classify, importImageFile as importFile } from './import';
import { estimateSize as estimate, exportImage as exportImg } from './export';
import { lossList as losses } from './loss';
import { openStrata as openProject, saveStrata as saveProject } from './strata';
import { downloadBlob as download, saveAs as saveFile } from './download';

export type { ExportFormat, ExportOptions, ExportResult, ImportedImage, LossItem } from '@/engine/contract';

export const importImageFile: IoApi['importImageFile'] = importFile;
export const classifyFiles: IoApi['classifyFiles'] = classify;
export const exportImage: IoApi['exportImage'] = exportImg;
export const lossList: IoApi['lossList'] = losses;
export const estimateSize: IoApi['estimateSize'] = estimate;
export const saveStrata: IoApi['saveStrata'] = saveProject;
export const openStrata: IoApi['openStrata'] = openProject;
export const downloadBlob: IoApi['downloadBlob'] = download;
export const saveAs: IoApi['saveAs'] = saveFile;
