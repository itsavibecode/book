// Entry point: styles, synchronous boot (head, theme, layout, commands), first render, then
// the async part of boot (settings and recovery of documents open at the last visit).
import { render } from 'preact';
import './ui/tokens.css';
import './ui/base.css';
import './ui/shell.css';
import './ui/panel.css';
import './ui/start.css';
import './ui/modal.css';
import './ui/compact.css';
import { bootAsync, bootSync } from './app/boot';
import { App } from './ui/App';

bootSync();
render(<App />, document.getElementById('app')!);
void bootAsync();
