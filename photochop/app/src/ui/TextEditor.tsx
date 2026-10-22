// On-canvas text editing: a transparent textarea laid over the text layer in screen space.
// The canvas renders the real text live (every keystroke updates the layer); the textarea
// supplies the caret, selection and IME, so its own glyphs are transparent.
import { useLayoutEffect, useRef } from 'preact/hooks';
import { activeTab, docVersion, foreground, textEdit, toolOptions, viewVersion } from '@/app/state';
import { focusCanvas } from '@/app/shortcuts';
import { docToScreen } from '@/app/view';
import { fontStack } from '@/tools/options';
import { commitTextEdit, updateEditText } from '@/tools/text';

export function TextEditor() {
  const e = textEdit.value;
  void viewVersion.value;
  void docVersion.value;
  const tab = activeTab.value;
  const ref = useRef<HTMLTextAreaElement>(null);
  const sessionKey = e?.mergeKey;

  // Layout effect: focus synchronously after the commit so keys typed right after the click
  // land in the editor, not on the canvas shortcuts.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }, [sessionKey]);

  if (!e || !tab || tab.key !== e.tabKey) return null;
  const n = e.nodeId ? tab.doc.getNode(e.nodeId) : undefined;
  const node = n && n.type === 'text' ? n : null;
  const o = toolOptions.value.text;
  const zoom = tab.view.zoom;
  const font = node?.font ?? fontStack(o.font);
  const size = node?.size ?? o.size;
  const weight = node?.weight ?? o.weight;
  const italic = node?.italic ?? o.italic;
  const lineHeight = node?.lineHeight ?? 1.2;
  const letterSpacing = node?.letterSpacing ?? 0;
  const align = node?.align ?? o.align;
  const text = node?.text ?? '';
  const bounds = node ? tab.doc.nodeBounds(node.id) : null;
  const origin = bounds ?? (node ? { x: node.x, y: node.y, w: 0, h: 0 } : { x: Math.round(e.at.x), y: Math.round(e.at.y - o.size * 0.6), w: 0, h: 0 });
  const s = docToScreen(tab.view, origin.x, origin.y);
  const lines = Math.max(1, text.split('\n').length);
  const lineCss = size * lineHeight * zoom;
  const widthDoc = node?.width ?? Math.max(bounds?.w ?? 0, size * 1.2);
  const w = Math.max(24, widthDoc * zoom + size * zoom * 0.8);
  const h = Math.max(lineCss, lines * lineCss) + 4;
  void foreground.value;

  return (
    <textarea
      key={sessionKey} ref={ref} class="text-editor" data-testid="text-editor" aria-label="Text" spellcheck={false}
      defaultValue={text}
      style={{
        left: `${s.x - 2}px`, top: `${s.y - 2}px`, width: `${w}px`, height: `${h}px`,
        font: `${italic ? 'italic ' : ''}${weight} ${size * zoom}px/${lineHeight} ${font}`,
        letterSpacing: `${letterSpacing * zoom}px`, textAlign: align,
      }}
      onInput={(ev) => updateEditText((ev.currentTarget as HTMLTextAreaElement).value)}
      onKeyDown={(ev) => {
        ev.stopPropagation();
        if (ev.key === 'Escape' || (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey))) {
          ev.preventDefault();
          commitTextEdit();
          focusCanvas();
        }
      }}
      onBlur={() => { if (textEdit.peek()?.mergeKey === sessionKey) commitTextEdit(); }}
    />
  );
}
