// IO ENTRY POINT.
import type { IoApi } from '@/engine/contract';
import { classifyFiles as classify, importImageFile as importFile } from './import';
import { estimateSize as estimate, exportImage as exportImg } from './export';
import { lossList as losses } from './loss';
import { openProject as openProjectImpl, saveProject as saveProjectImpl } from './project';
import { downloadBlob as download, saveAs as saveFile } from './download';
import { exportSelection as exportSel, importSelection as importSel } from './selection';
import { copyImageToClipboard as copyToClipboard } from './clipboard';

export type { ExportFormat, ExportOptions, ExportResult, ImportedImage, LossItem } from '@/engine/contract';

export const importImageFile: IoApi['importImageFile'] = importFile;
export const classifyFiles: IoApi['classifyFiles'] = classify;
export const exportImage: IoApi['exportImage'] = exportImg;
export const lossList: IoApi['lossList'] = losses;
export const estimateSize: IoApi['estimateSize'] = estimate;
export const saveProject: IoApi['saveProject'] = saveProjectImpl;
export const openProject: IoApi['openProject'] = openProjectImpl;
export const downloadBlob: IoApi['downloadBlob'] = download;
export const saveAs: IoApi['saveAs'] = saveFile;
export const exportSelection: IoApi['exportSelection'] = exportSel;
export const importSelection: IoApi['importSelection'] = importSel;
export const copyImageToClipboard: IoApi['copyImageToClipboard'] = copyToClipboard;
