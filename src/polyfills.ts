// Sunwell's line-breaking dependency (linebreak / unicode-trie) expects Node's Buffer.
import { Buffer } from 'buffer';

(globalThis as unknown as { Buffer: typeof Buffer }).Buffer ??= Buffer;
