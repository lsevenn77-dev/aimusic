// Existing classic-script application boundaries. API payload contracts are exercised with SQLite integration tests.
declare const AifectDubbing: typeof import('../shared/dubbing.js');
declare var me: {id: string} | null;
declare var returnRoute: string;
declare var routeTracks: any[];
declare function api(path: string, method?: string, body?: unknown, options?: {fresh?: boolean}): Promise<any>;
declare function card(track: any): string;
declare function cover(track: any, className?: string): string;
declare function icon(name: string, size?: number): string;
declare function esc(value: unknown): string;
declare function heading(title: string, subtitle?: string): string;
declare function time(seconds: number): string;
declare function remember(tracks: any[]): any[];
declare function gate(): string;
declare function listSingDrafts(): Promise<any[]>;
declare function karaokeDraftsHTML(drafts: any[]): string;
declare function communityNavigation(tab: string): string;
declare function voiceView(base: string, id?: string): Promise<{html: string}>;
declare function render(): Promise<void>;
