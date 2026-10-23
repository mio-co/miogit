// The first data the Worker inlined into index.html (src/spa.ts).
export interface Boot {
  site: string;
  owner: string;
  signed: boolean;
  console: boolean;
  session?: { user: string; csrf: string } | null;
  data: Record<string, { status: number; body: unknown }>;
}

function read(): Boot {
  try {
    const el = document.getElementById('mio-boot');
    if (el?.textContent) return JSON.parse(el.textContent) as Boot;
  } catch {
    // fall through
  }
  return { site: 'MioGit', owner: '', signed: false, console: location.pathname.startsWith('/~mio'), session: null, data: {} };
}

export const boot: Boot = read();
