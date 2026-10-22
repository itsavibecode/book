// Root component: start screen or editor, plus the global hosts (modals, palette, toasts,
// tooltips, drop hint).
import { dropHint } from '@/app/files';
import { activeTab, booted, compact, documents, paletteOpen, panelVisible, sheetState } from '@/app/state';
import { BottomSheet, sheetHeight } from './BottomSheet';
import { ColourPopover } from './ColourPopover';
import { CommandPalette } from './CommandPalette';
import { ContextBar } from './ContextBar';
import { ModalHost } from './Dialogs';
import { Panel } from './Panel';
import { ToastHost } from './primitives/Toast';
import { TooltipHost } from './primitives/Tooltip';
import { StartScreen } from './StartScreen';
import { StatusBar } from './StatusBar';
import { ToolRail } from './ToolRail';
import { TopBar } from './TopBar';
import { Viewport } from './Viewport';

function Editor() {
  const isCompact = compact.value;
  const showPanel = panelVisible.value && !isCompact;
  const sheetH = isCompact ? sheetHeight(sheetState.value, window.innerHeight) : 0;
  return (
    <div
      class={`editor${isCompact ? ' compact' : ''}${showPanel ? '' : ' no-panel'}`} data-testid="editor"
      style={isCompact ? { '--sheet-h': `${sheetH}px` } as Record<string, string> : undefined}
    >
      <TopBar />
      <ContextBar />
      <div class="stage">
        <Viewport />
        {!isCompact && <ToolRail />}
      </div>
      {showPanel && <aside class="side" aria-label="Layers and inspector"><Panel /></aside>}
      {!isCompact && <StatusBar />}
      {isCompact && <BottomSheet />}
      {isCompact && <ToolRail />}
      <ColourPopover />
    </div>
  );
}

export function App() {
  const hasDocs = documents.value.length > 0 && !!activeTab.value;
  return (
    <>
      {!booted.value ? <div class="boot" aria-busy="true" /> : hasDocs ? <Editor /> : <StartScreen />}
      {dropHint.value && (
        <div class="drop-hint" aria-hidden="true">
          <div class="drop-card">{hasDocs ? 'Drop to add as new layers' : 'Drop to open'}</div>
        </div>
      )}
      <ModalHost />
      {paletteOpen.value && <CommandPalette />}
      <ToastHost />
      <TooltipHost />
    </>
  );
}
