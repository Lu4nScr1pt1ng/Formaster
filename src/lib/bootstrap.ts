import { mount, type Component } from 'svelte';
import '../styles/app.css';

/** Shared by every entrypoint's `main.ts` (popup/options/playground/docs) so the mount boilerplate lives in one place. */
export function mountApp(App: Component): ReturnType<typeof mount> {
  return mount(App, { target: document.getElementById('app')! });
}
